import { validItem } from '../../shared/items';
import { craftStation, fillRecipe, matchRecipe, stationRecipes, transferBack, transferTo, type Station } from '../../shared/stations';
import './station-panel.css';

type StationPanelOptions = {
  name: (id: number) => string;
  inventory: () => Record<string, number>;
  creative: () => boolean;
  changed: (craftedId?: number) => void;
  close: () => void;
};

/** Owns the station controls; the engine owns the modal and the world state. */
export function createStationPanel(options: StationPanelOptions) {
  const abort = new AbortController();
  const dialog = document.createElement('dialog');
  dialog.id = 'station-panel';
  dialog.className = 'feature-dialog station-dialog';
  dialog.setAttribute('aria-labelledby', 'station-title');
  dialog.innerHTML = `<div class="menu-heading"><span class="eyebrow">野境 · 手作与冶炼</span><button id="station-panel-close" class="icon-button" type="button" aria-label="关闭工作站">×</button></div>
    <h2 id="station-title">工作台</h2><p id="station-description"></p>
    <div class="station-transfer"><label>背包材料<select id="station-item" aria-label="背包材料"></select></label><label>放入数量<select id="station-amount"><option value="1">1 个</option><option value="16">16 个</option><option value="64">64 个</option></select></label></div>
    <div id="station-recipe-controls" class="station-recipe-controls"><label>配方<select id="station-recipe"></select></label><button id="station-fill" type="button">填入配方</button></div>
    <div id="station-layout" class="station-workspace"><div id="station-slots" class="station-grid"></div><div id="station-result" class="station-result"><span>合成结果</span><output id="station-output" aria-live="polite">尚无匹配配方</output><button id="station-craft" type="button">合成一次</button></div></div>
    <div id="station-furnace-status" class="station-furnace-status" hidden><label for="furnace-progress">冶炼进度 <span id="furnace-progress-label">0 / 8 秒</span></label><progress id="furnace-progress" max="8" value="0"></progress><p id="furnace-fuel" role="status"></p><p>煤炭可燃烧 64 秒，木材或木板 16 秒。点击产物取回背包。</p></div>
    <p id="station-status" class="station-status" role="status" aria-live="polite"></p><p class="station-hint">点击格子放入材料；使用“取回”或右键格子取回整组。关闭后材料保留在原处。</p>`;
  document.body.append(dialog);
  const get = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const title = get<HTMLHeadingElement>('station-title');
  const description = get<HTMLParagraphElement>('station-description');
  const item = get<HTMLSelectElement>('station-item');
  const amount = get<HTMLSelectElement>('station-amount');
  const recipe = get<HTMLSelectElement>('station-recipe');
  const fill = get<HTMLButtonElement>('station-fill');
  const craft = get<HTMLButtonElement>('station-craft');
  const output = get<HTMLOutputElement>('station-output');
  const slots = get<HTMLDivElement>('station-slots');
  const status = get<HTMLParagraphElement>('station-status');
  const progress = get<HTMLProgressElement>('furnace-progress');
  let station: Station | undefined;
  let disposed = false;
  let renderedKind: Station['kind'] | undefined;
  let itemKey: string | undefined;
  const cells: { button: HTMLButtonElement; name: HTMLElement; count: HTMLElement; take: HTMLButtonElement }[] = [];

  for (const entry of stationRecipes) recipe.add(new Option(entry.name, String(entry.id)));
  if (stationRecipes.some(entry => entry.id === 20)) recipe.value = '20';
  get('station-panel-close').addEventListener('click', options.close, { signal: abort.signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); options.close(); }, { signal: abort.signal });
  // Keep modal typing and navigation out of gameplay's keyboard handlers.
  dialog.addEventListener('keydown', event => event.stopPropagation(), { signal: abort.signal });
  dialog.addEventListener('keyup', event => event.stopPropagation(), { signal: abort.signal });

  function mutated(ok: boolean, message: string, failure: string, craftedId?: number) {
    status.textContent = ok ? message : failure;
    if (ok) options.changed(craftedId);
    refresh();
  }

  function take(index: number) {
    if (!station) return;
    mutated(transferBack(station, index, options.inventory()), '已取回背包。', '无法取回：格子为空，或背包容量不足。');
  }

  function deposit(index: number) {
    if (!station) return;
    if (station.kind === 'furnace' && index === 2) { take(index); return; }
    mutated(transferTo(station, index, Number(item.value), Number(amount.value), options.inventory(), options.creative()),
      '已放入材料。', '无法放入：材料不足、槽位已满，或材料不适用于这个格子。');
  }

  fill.addEventListener('click', () => {
    if (!station) return;
    mutated(fillRecipe(station, Number(recipe.value), options.inventory(), options.creative()),
      '配方已填入，可以合成。', '无法填入：材料不足，或背包无法收回原有材料。');
  }, { signal: abort.signal });
  craft.addEventListener('click', () => {
    if (!station) return;
    const matched = matchRecipe(station.slots);
    mutated(craftStation(station, options.inventory(), options.creative()), '合成完成，产物已放入背包。',
      '无法合成：配方不匹配、背包已满，或已经拥有这件装备。', matched?.output.id);
  }, { signal: abort.signal });

  function buildSlots(kind: Station['kind']) {
    if (renderedKind === kind) return;
    renderedKind = kind;
    cells.length = 0;
    slots.replaceChildren();
    slots.className = kind === 'workbench' ? 'station-grid' : 'station-furnace';
    for (let index = 0; index < (kind === 'workbench' ? 9 : 3); index++) {
      const cell = document.createElement('div');
      cell.className = 'station-cell';
      const label = kind === 'workbench' ? `材料格 ${index + 1}` : ['原料', '燃料', '产物'][index];
      const heading = document.createElement('span');
      heading.className = 'station-cell-label';
      heading.textContent = label;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'station-slot';
      button.id = `station-slot-${index}`;
      const name = document.createElement('strong');
      const count = document.createElement('span');
      button.append(name, count);
      const takeButton = document.createElement('button');
      takeButton.type = 'button';
      takeButton.className = 'station-take';
      takeButton.dataset.takeSlot = String(index);
      takeButton.textContent = '取回';
      takeButton.setAttribute('aria-label', `取回${label}的材料`);
      button.addEventListener('click', () => deposit(index), { signal: abort.signal });
      button.addEventListener('contextmenu', event => { event.preventDefault(); take(index); }, { signal: abort.signal });
      takeButton.addEventListener('click', () => take(index), { signal: abort.signal });
      cell.append(heading, button, takeButton);
      slots.append(cell);
      cells.push({ button, name, count, take: takeButton });
    }
  }

  function refresh() {
    if (disposed || !station) return;
    const scroll = dialog.scrollTop;
    const inventory = options.inventory();
    const creative = options.creative();
    const ids = creative ? Array.from({ length: 511 }, (_, i) => i + 1).filter(validItem)
      : Object.keys(inventory).map(Number).filter(id => inventory[id] > 0 && validItem(id));
    // Preserve a just-exhausted selection so frequent furnace ticks never move focus or selection.
    if (item.value && !ids.includes(Number(item.value))) ids.push(Number(item.value));
    ids.sort((a, b) => a - b);
    const key = ids.join(',');
    if (key !== itemKey) {
      const selected = item.value;
      item.replaceChildren();
      if (!ids.length) item.add(new Option('背包暂无材料', ''));
      for (const id of ids) item.add(new Option('', String(id)));
      if (ids.includes(Number(selected))) item.value = selected;
      itemKey = key;
    }
    for (const option of item.options) {
      if (option.value) option.textContent = `${options.name(Number(option.value))} · ${creative ? '无限' : inventory[option.value] ?? 0}`;
    }
    item.disabled = ids.length === 0;
    const furnace = station.kind === 'furnace';
    for (const [index, cell] of cells.entries()) {
      const stack = station.slots[index];
      cell.name.textContent = stack ? options.name(stack.id) : '空';
      cell.count.textContent = stack ? `× ${stack.count}` : furnace && index === 2 ? '等待冶炼' : '点击放入';
      const label = furnace ? ['原料', '燃料', '产物'][index] : `材料格 ${index + 1}`;
      cell.button.setAttribute('aria-label', `${label}：${stack ? `${options.name(stack.id)} ${stack.count} 个` : '空'}${furnace && index === 2 ? '，点击取回' : '，点击放入'}`);
      cell.button.dataset.occupied = String(Boolean(stack));
      cell.take.disabled = !stack;
    }
    const matched = furnace ? null : matchRecipe(station.slots);
    output.textContent = matched ? `${options.name(matched.output.id)} × ${matched.output.count}` : '尚无匹配配方';
    craft.disabled = !matched;
    fill.disabled = !recipe.value;
    progress.value = station.progress;
    get('furnace-progress-label').textContent = `${station.progress.toFixed(1)} / 8 秒`;
    get('furnace-fuel').textContent = station.burn > 0 ? `燃烧中 · 剩余 ${Math.ceil(station.burn)} 秒` : '尚未燃烧 · 放入原料与燃料后自动开始';
    dialog.scrollTop = scroll;
  }

  return {
    open(key: string, next: Station) {
      if (disposed) return;
      station = next;
      dialog.dataset.stationKey = key;
      buildSlots(next.kind);
      const furnace = next.kind === 'furnace';
      title.textContent = furnace ? '熔炉' : '工作台';
      description.textContent = furnace ? '放入原料和燃料，每 8 秒冶炼一份。关闭面板后，在游戏进行时继续冶炼。' : '在 3 × 3 网格中摆放材料，也可以选择配方自动填入。';
      get('station-recipe-controls').hidden = furnace;
      get('station-result').hidden = furnace;
      get('station-furnace-status').hidden = !furnace;
      get('station-layout').classList.toggle('is-furnace', furnace);
      status.textContent = options.creative() ? '创造模式可免费放入材料。' : '';
      refresh();
    },
    refresh,
    dispose() { disposed = true; abort.abort(); dialog.remove(); },
  };
}
