export type Recipe = { id: number; name: string; recipe: Record<string, number> };
export function craftableCount(recipe: Recipe, inventory: Record<string, number>, creative: boolean, tool = false): number {
  const entries = Object.entries(recipe.recipe);
  if (!entries.length || entries.some(([, count]) => !Number.isInteger(count) || count <= 0)) return 0;
  const capacity = Math.max(0, (tool ? 1 : 9999) - (inventory[recipe.id] ?? 0));
  const materials = creative ? 64 : Math.min(...entries.map(([id, count]) => Math.floor((inventory[id] ?? 0) / count)));
  return Math.max(0, Math.min(64, capacity, materials));
}
/** Check the whole request before consuming any ingredients. Each recipe yields one item. */
export function craftBatch(recipe: Recipe, inventory: Record<string, number>, amount: number, creative: boolean, tool = false): boolean {
  if (!Number.isInteger(amount) || amount < 1 || amount > craftableCount(recipe, inventory, creative, tool)) return false;
  if (!creative) for (const [id, count] of Object.entries(recipe.recipe)) inventory[id] -= count * amount;
  inventory[recipe.id] = (inventory[recipe.id] ?? 0) + amount;
  return true;
}
