import type { Recipe } from './crafting';
export function createRecipeTracker(options: { key: string; recipes: Recipe[]; name: (id: number) => string }) {
  const picker = document.getElementById('tracked-recipe') as HTMLSelectElement;
  const panel = document.getElementById('recipe-tracker')!;
  const title = document.getElementById('tracked-title')!;
  const ingredients = document.getElementById('tracked-ingredients')!;
  const status = document.getElementById('tracked-status')!;
  const notice = document.getElementById('tracker-notice')!;
  const events = new AbortController();
  let inventory: Record<string, number> = {}, creative = false;
  for (const recipe of options.recipes) { const option = document.createElement('option'); option.value = String(recipe.id); option.textContent = recipe.name; picker.append(option); }
  try { const saved = localStorage.getItem(options.key); if (options.recipes.some(r => String(r.id) === saved)) picker.value = saved!; } catch {}
  function render() {
    const recipe = options.recipes.find(r => String(r.id) === picker.value);
    panel.hidden = !recipe;
    if (!recipe) return;
    title.textContent = recipe.name;
    ingredients.replaceChildren();
    let enough = true;
    for (const [id, need] of Object.entries(recipe.recipe)) {
      const have = inventory[id] ?? 0, row = document.createElement('li');
      const missing = Math.max(0, need - have); enough &&= missing === 0;
      row.textContent = `${options.name(Number(id))} ${have}/${need}${missing && !creative ? ` · 缺 ${missing}` : ' ✓'}`;
      row.className = missing && !creative ? 'tracking-missing' : 'tracking-ready'; ingredients.append(row);
    }
    status.textContent = (inventory[recipe.id] ?? 0) > 0 ? '目标已拥有 · 可更换或取消追踪' : creative ? '创造模式可免费合成' : enough ? '材料齐全 · 按 E 打开背包合成' : '收集材料后在背包合成';
  }
  function change() { try { if (picker.value) localStorage.setItem(options.key, picker.value); else localStorage.removeItem(options.key); notice.textContent = '追踪一份配方；按账号与世界保存在此浏览器。'; } catch { notice.textContent = '浏览器存储不可用，追踪仅本次会话有效。'; } render(); }
  picker.addEventListener('change', change, { signal: events.signal });
  document.getElementById('clear-tracking')!.addEventListener('click', () => { picker.value = ''; change(); }, { signal: events.signal });
  return { update(items: Record<string, number>, isCreative: boolean) { inventory = items; creative = isCreative; render(); }, dispose() { events.abort(); picker.replaceChildren(new Option('不追踪', '')); panel.hidden = true; } };
}
