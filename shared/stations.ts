import { armorItems } from './armor.js';
import { toolMaterials, tools, validItem } from './items.js';

export type Stack = { id: number; count: number };
export type Station = { kind: 'workbench' | 'furnace' | 'chest'; slots: (Stack | null)[]; progress: number; burn: number };
export type StationRecipe = { id: number; name: string; pattern: (number | null)[]; output: Stack };
export const furnaceRecipes: Readonly<Record<number, number>> = {15:31,16:32,17:33,6:24,202:203,204:208};
export const furnaceFuels: Readonly<Record<number, number>> = {30:64,4:16,7:16};
const uniqueItems = new Set([...tools, ...armorItems].map(item => item.id));
const clockEpsilon = 1e-9;
const inventoryLimit = (id: number) => uniqueItems.has(id) ? 1 : 9999;
const recipe = (id: number, name: string, pattern: (number | null)[], count = 1): StationRecipe => ({id,name,pattern,output:{id,count}});

export const stationRecipes: StationRecipe[] = [
  recipe(7,'木板',[4,null,null, null,null,null, null,null,null],4),
  recipe(20,'工作台',[4,4,null, 4,4,null, null,null,null]),
  recipe(21,'火把',[30,null,null, 4,null,null, null,null,null]),
  recipe(22,'灯笼',[32,30,32, null,null,null, null,null,null]),
  recipe(25,'箱子',[7,7,7, 7,null,7, 7,7,7]),
  recipe(23,'熔炉',[3,3,3, 3,null,3, 3,3,3]),
  recipe(205,'面包',[206,206,206, null,null,null, null,null,null]),
  ...tools.map(tool => {
    const material = toolMaterials[Math.floor((tool.id - 100) / 5)].resource;
    const patterns: Record<typeof tool.kind, (number | null)[]> = {
      pickaxe:[material,material,material, null,4,null, null,4,null],
      sword:[null,material,null, null,material,null, 4,4,null],
      shovel:[material,null,null, 4,null,null, 4,null,null],
      hoe:[material,material,null, null,4,null, null,4,null],
      axe:[material,material,null, material,4,null, null,4,null],
    };
    return recipe(tool.id,tool.name,patterns[tool.kind]);
  }),
  ...armorItems.map(item => {
    const material = Number(Object.keys(item.recipe)[0]);
    const patterns: Record<typeof item.slot, (number | null)[]> = {
      helmet:[material,material,material, material,null,material, null,null,null],
      chestplate:[material,null,material, material,material,material, material,material,material],
      leggings:[material,material,material, material,null,material, material,null,material],
      boots:[material,null,material, material,null,material, null,null,null],
    };
    return recipe(item.id,item.name,patterns[item.slot]);
  }),
];

export function createStation(kind: Station['kind']): Station {
  return {kind,slots:Array(kind === 'workbench' ? 9 : kind === 'chest' ? 27 : 3).fill(null),progress:0,burn:0};
}

function validStack(stack: Stack): boolean {
  return !!stack && validItem(stack.id) && Number.isInteger(stack.count) && stack.count > 0 && stack.count <= 64;
}

function validSlots(station: Station): boolean {
  return !!station && (station.kind === 'workbench' || station.kind === 'furnace' || station.kind === 'chest') &&
    Array.isArray(station.slots) && station.slots.length === (station.kind === 'workbench' ? 9 : station.kind === 'chest' ? 27 : 3) &&
    station.slots.every(stack => stack === null || validStack(stack));
}

/** Trim empty margins so a shaped recipe can be moved within the 3×3 grid. */
function shape(pattern: (number | null)[]) {
  const occupied = pattern.flatMap((id,index) => id === null ? [] : [index]);
  if (!occupied.length) return null;
  const left = Math.min(...occupied.map(index => index % 3));
  const right = Math.max(...occupied.map(index => index % 3));
  const top = Math.floor(Math.min(...occupied) / 3);
  const bottom = Math.floor(Math.max(...occupied) / 3);
  const rows = Array.from({length:bottom-top+1}, (_,row) => pattern.slice((top+row)*3+left,(top+row)*3+right+1));
  return rows;
}

export function matchRecipe(slots: (Stack | null)[]): StationRecipe | null {
  if (!Array.isArray(slots) || slots.length !== 9 || !slots.every(stack => stack === null || validStack(stack))) return null;
  const input = shape(slots.map(stack => stack?.id ?? null));
  if (!input) return null;
  return stationRecipes.find(candidate => {
    const expected = shape(candidate.pattern)!;
    if (input.length !== expected.length || input[0].length !== expected[0].length) return false;
    return [false,true].some(mirror => input.every((row,y) => row.every((id,x) => id === expected[y][mirror ? row.length-1-x : x])));
  }) ?? null;
}

function quantity(inventory: Record<string, number>, id: number): number {
  return inventory[id] ?? 0;
}

function validQuantity(amount: number, id: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && amount <= inventoryLimit(id);
}

export function fillRecipe(station: Station, recipeId: number, inventory: Record<string, number>, creative: boolean): boolean {
  if (!validSlots(station) || station.kind !== 'workbench') return false;
  const selected = stationRecipes.find(candidate => candidate.id === recipeId);
  if (!selected) return false;
  const next = {...inventory};
  const affected = new Set<number>();
  for (const stack of station.slots) {
    if (!stack) continue;
    affected.add(stack.id);
    next[stack.id] = quantity(next,stack.id) + stack.count;
  }
  if (!creative) for (const id of selected.pattern) {
    if (id === null) continue;
    affected.add(id);
    next[id] = quantity(next,id)-1;
  }
  if ([...affected].some(id => !validQuantity(quantity(next,id),id))) return false;
  for (const id of affected) inventory[id] = next[id];
  station.slots = selected.pattern.map(id => id === null ? null : {id,count:1});
  return true;
}

/** Creative mode supplies ingredients on fill; both modes consume the visible grid. */
export function craftStation(station: Station, inventory: Record<string, number>, _creative: boolean): boolean {
  if (!validSlots(station) || station.kind !== 'workbench') return false;
  const selected = matchRecipe(station.slots);
  if (!selected) return false;
  const output = selected.output;
  const current = quantity(inventory,output.id);
  if (!validQuantity(current,output.id) || !validQuantity(current+output.count,output.id)) return false;
  inventory[output.id] = current+output.count;
  station.slots = station.slots.map(stack => stack && stack.count > 1 ? {...stack,count:stack.count-1} : null);
  return true;
}

export function transferTo(station: Station, index: number, id: number, count: number, inventory: Record<string, number>, creative: boolean): boolean {
  if (!validSlots(station) || !Number.isInteger(index) || index < 0 || index >= station.slots.length ||
      !validItem(id) || uniqueItems.has(id) || !Number.isInteger(count) || count < 1 || count > 64) return false;
  if (station.kind === 'furnace' && (index === 2 || (index === 0 ? !furnaceRecipes[id] : !furnaceFuels[id]))) return false;
  const previous = station.slots[index];
  if (previous && (previous.id !== id || previous.count+count > 64)) return false;
  const available = quantity(inventory,id);
  if (!creative && (!validQuantity(available,id) || available < count)) return false;
  if (!creative) inventory[id] = available-count;
  station.slots[index] = {id,count:(previous?.count ?? 0)+count};
  if (station.kind === 'furnace' && index === 0 && previous?.id !== id) station.progress = 0;
  return true;
}

export function transferBack(station: Station, index: number, inventory: Record<string, number>): boolean {
  if (!validSlots(station) || !Number.isInteger(index) || index < 0 || index >= station.slots.length) return false;
  const stack = station.slots[index];
  if (!stack) return false;
  const current = quantity(inventory,stack.id);
  if (!validQuantity(current,stack.id) || !validQuantity(current+stack.count,stack.id)) return false;
  inventory[stack.id] = current+stack.count;
  station.slots[index] = null;
  if (station.kind === 'furnace' && index === 0) station.progress = 0;
  return true;
}

export function advanceFurnace(station: Station, dt: number): boolean {
  if (!validSlots(station) || station.kind !== 'furnace' || !Number.isFinite(dt) || dt <= 0 ||
      !Number.isFinite(station.progress) || station.progress < 0 || station.progress >= 8 ||
      !Number.isFinite(station.burn) || station.burn < 0 || station.burn > 64) return false;
  let remaining = dt;
  let changed = false;
  while (remaining > 0) {
    const input = station.slots[0];
    const outputId = input ? furnaceRecipes[input.id] : undefined;
    const output = station.slots[2];
    const canSmelt = !!outputId && (!output || (output.id === outputId && output.count < 64));
    if (!outputId && station.progress !== 0) { station.progress = 0; changed = true; }
    if (!canSmelt) {
      const burn = Math.max(0,station.burn-remaining);
      if (burn !== station.burn) { station.burn = burn; changed = true; }
      break;
    }
    if (station.burn === 0) {
      const fuel = station.slots[1];
      const duration = fuel ? furnaceFuels[fuel.id] : undefined;
      if (!duration) break;
      station.burn = duration;
      station.slots[1] = fuel!.count === 1 ? null : {id:fuel!.id,count:fuel!.count-1};
      changed = true;
    }
    const elapsed = Math.min(remaining,station.burn,8-station.progress);
    remaining -= elapsed;
    station.burn = Math.max(0,station.burn-elapsed);
    if (station.burn < clockEpsilon) station.burn = 0;
    station.progress += elapsed;
    changed = true;
    // Repeated fractional frame times must finish on the same boundary as one large step.
    if (station.progress >= 8-clockEpsilon) {
      station.slots[0] = input!.count === 1 ? null : {id:input!.id,count:input!.count-1};
      station.slots[2] = {id:outputId!,count:(output?.count ?? 0)+1};
      station.progress = 0;
    }
  }
  return changed;
}

export function stationContents(station: Station): Record<string, number> {
  const contents: Record<string, number> = {};
  if (!validSlots(station)) return contents;
  for (const stack of station.slots) if (stack) contents[stack.id] = (contents[stack.id] ?? 0)+stack.count;
  return contents;
}
