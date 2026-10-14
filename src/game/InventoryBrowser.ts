import { armorItems } from '../../shared/armor';
import { foods, tools } from '../../shared/items';
import './inventory-browser.css';

type Recipe = { id: number; name: string; recipe: Record<string, number> };
type Category = 'armor' | 'all' | 'blocks' | 'tools' | 'food' | 'resources' | 'recipes' | 'eggs';
type Options = {
  root?: HTMLElement;
  inventory: () => Record<string, number>;
  creative: () => boolean;
  recipes: Recipe[];
  name: (id: number) => string;
};

/** Enhance existing inventory cards without replacing their selection/crafting handlers. */
export function createInventoryBrowser(options: Options) {
  const root = options.root ?? document.getElementById('materials-panel')!;
  const categories: [Category, string][] = [
    ['all', '全部'], ['blocks', '方块'], ['tools', '工具'], ['food', '食物'],
    ['resources', '资源'], ['armor','装备'], ['recipes', '合成'], ['eggs', '生物蛋'],
  ];
  const sections = ['material-grid', 'equipment-grid', 'craft-grid', 'creature-grid'].map(id => {
    const grid = root.querySelector<HTMLElement>(`#${id}`)!;
    const wrapper = grid.closest<HTMLElement>('[data-inventory-section]');
    const headings: HTMLElement[] = [];
    if (!wrapper) {
      let sibling = grid.previousElementSibling;
      while (sibling instanceof HTMLElement && (sibling.tagName === 'P' || sibling.tagName === 'H3')) {
        headings.push(sibling);
        if (sibling.tagName === 'H3') break;
        sibling = sibling.previousElementSibling;
      }
    }
    return { grid, wrapper, headings };
  });
  const controls = document.createElement('div');
  controls.className = 'inventory-browser-controls';
  controls.innerHTML = `
    <div class="inventory-search-row">
      <label class="inventory-search-label" for="inventory-search">查找物品</label>
      <input id="inventory-search" type="search" placeholder="搜索方块、工具、食物…" autocomplete="off" />
    </div>
    <div class="inventory-categories" role="group" aria-label="物品分类"></div>
    <div class="inventory-filter-row">
      <label><input id="inventory-owned" type="checkbox" /> 仅看已拥有</label>
      <label><input id="inventory-craftable" type="checkbox" /> 仅看可合成配方</label>
      <button type="button" id="inventory-reset">重置筛选</button>
    </div>
    <p id="inventory-result-count" class="inventory-result-count" role="status" aria-live="polite"></p>`;
  const first = sections[0];
  root.insertBefore(controls, first.wrapper ?? first.headings.at(-1) ?? first.grid);
  const empty = document.createElement('div');
  empty.className = 'inventory-empty';
  empty.hidden = true;
  empty.innerHTML = '<strong>没有符合条件的物品</strong><p>试试其他关键词，或重置筛选查看全部物品。</p>';
  controls.after(empty);
  const search = controls.querySelector<HTMLInputElement>('#inventory-search')!;
  const owned = controls.querySelector<HTMLInputElement>('#inventory-owned')!;
  const craftable = controls.querySelector<HTMLInputElement>('#inventory-craftable')!;
  const result = controls.querySelector<HTMLElement>('#inventory-result-count')!;
  const tabs = controls.querySelector<HTMLElement>('.inventory-categories')!;
  let category: Category = 'all';
  let disposed = false;
  const recipeMap = new Map(options.recipes.map(recipe => [recipe.id, recipe]));
  const toolIds = new Set([...tools,...armorItems].map(item => item.id));
  const armorIds = new Set(armorItems.map(item=>item.id));
  const foodIds = new Set(foods.filter(item => item.hunger > 0).map(item => item.id));
  const cards = sections.flatMap(({ grid }) => Array.from(grid.querySelectorAll<HTMLButtonElement>('.material-card')).map(card => {
    const id = Number(card.dataset.recipe ?? card.dataset.type ?? card.dataset.item);
    const kind: Category = card.dataset.recipe !== undefined ? 'recipes'
      : card.dataset.species !== undefined ? 'eggs'
      : card.dataset.type !== undefined ? 'blocks'
      : armorIds.has(id) ? 'armor' : toolIds.has(id) ? 'tools' : foodIds.has(id) ? 'food' : 'resources';
    const name = card.querySelector('strong')?.textContent ?? options.name(id);
    const details = kind === 'recipes' ? document.createElement('div') : null;
    if (details) {
      details.className = 'recipe-availability';
      card.append(details);
    }
    // Keep the action's accessible name stable as inventory counts change.
    const previousLabel = card.getAttribute('aria-label');
    card.setAttribute('aria-label', name);
    return { card, id, kind, name, details, previousLabel };
  }));
  for (const [value, label] of categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = value;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(value === category));
    button.onclick = () => { category = value; if (value !== 'recipes' && value !== 'all') craftable.checked = false; refresh(); };
    tabs.append(button);
  }

  function refresh() {
    if (disposed) return;
    const inventory = options.inventory(), creative = options.creative();
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const { card, id, kind, name, details } of cards) {
      const recipe = recipeMap.get(id);
      const ingredients = recipe ? Object.entries(recipe.recipe) : [];
      const enough = creative || ingredients.every(([key, need]) => (inventory[key] ?? 0) >= need);
      const capacity = toolIds.has(id) ? !(inventory[id] > 0) : (inventory[id] ?? 0) < 9999;
      const canCraft = kind === 'recipes' && enough && capacity;
      if (details && recipe) {
        details.replaceChildren();
        for (const [key, need] of ingredients) {
          const have = inventory[key] ?? 0;
          const ingredient = document.createElement('span');
          ingredient.className = !creative && have < need ? 'recipe-missing' : 'recipe-ready';
          ingredient.textContent = `${options.name(Number(key))} ${have}/${need}${!creative && have < need ? ` · 缺 ${need - have}` : ''}`;
          details.append(ingredient);
        }
        const status = document.createElement('small');
        status.className = 'recipe-status';
        status.textContent = !capacity ? toolIds.has(id) ? '已拥有此工具或装备' : '此物品已达上限'
          : creative ? '创造模式 · 免费合成' : enough ? '材料齐全 · 可合成' : '收集以上缺少的材料';
        details.append(status);
        card.dataset.craftable = String(canCraft);
      }
      const matches = (category === 'all' || category === kind)
        && (!query || name.toLocaleLowerCase().includes(query))
        && (!owned.checked || (kind !== 'eggs' && (inventory[id] ?? 0) > 0))
        && (!craftable.checked || canCraft);
      card.hidden = !matches;
      if (matches) visible++;
    }
    for (const { grid, wrapper, headings } of sections) {
      const show = Array.from(grid.children).some(child => child instanceof HTMLElement && !child.hidden);
      grid.hidden = !show;
      if (wrapper) wrapper.hidden = !show;
      for (const heading of headings) heading.hidden = !show;
    }
    for (const button of tabs.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.category === category));
    result.textContent = `显示 ${visible} 项${craftable.checked ? '可合成配方' : ''} · ${creative ? '创造模式' : '生存模式'}`;
    empty.hidden = visible > 0;
  }
  const reset = () => { category = 'all'; search.value = ''; owned.checked = false; craftable.checked = false; refresh(); };
  search.addEventListener('input', refresh);
  owned.addEventListener('change', refresh);
  craftable.addEventListener('change', () => { if (craftable.checked) category = 'recipes'; refresh(); });
  controls.querySelector<HTMLButtonElement>('#inventory-reset')!.onclick = reset;
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      controls.remove();
      empty.remove();
      for (const { card, details, previousLabel } of cards) {
        card.hidden = false;
        details?.remove();
        delete card.dataset.craftable;
        if (previousLabel === null) card.removeAttribute('aria-label');
        else card.setAttribute('aria-label', previousLabel);
      }
      for (const { grid, wrapper, headings } of sections) {
        grid.hidden = false;
        if (wrapper) wrapper.hidden = false;
        for (const heading of headings) heading.hidden = false;
      }
    },
  };
}
