import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { message: 'fixture' } }));
  await page.goto(process.env.TEST_WEB_URL ?? 'http://localhost:5173');
  await page.evaluate(async () => {
    const { createInventoryBrowser } = await import('/src/game/InventoryBrowser.ts');
    const root = document.createElement('dialog');
    root.id = 'materials-panel';
    root.className = 'feature-dialog materials-dialog';
    root.innerHTML = `<h2>背包</h2>
      <section data-inventory-section="blocks"><h3>方块</h3><div class="material-grid" id="material-grid">
        <button class="material-card" data-type="4"><strong>木材</strong></button>
        <button class="material-card" data-type="18"><strong>钻石矿石</strong></button></div></section>
      <section data-inventory-section="equipment"><h3>物品</h3><div class="material-grid" id="equipment-grid">
        <button class="material-card" data-item="126"><strong>钻石剑</strong></button>
        <button class="material-card" data-item="200"><strong>苹果</strong></button>
        <button class="material-card" data-item="30"><strong>煤炭</strong></button></div></section>
      <section data-inventory-section="recipes"><h3>合成</h3><div class="material-grid" id="craft-grid">
        <button class="material-card" data-recipe="126"><strong>合成钻石剑</strong></button>
        <button class="material-card" data-recipe="205"><strong>合成面包</strong></button></div></section>
      <section data-inventory-section="eggs"><h3>生物蛋</h3><div class="material-grid" id="creature-grid">
        <button class="material-card" data-species="cow"><strong>牛生物蛋</strong></button></div></section>`;
    document.body.append(root);
    const state = { inventory: { 4: 1, 34: 3, 206: 3, 200: 2 }, creative: false, clicked: 0 };
    root.querySelector('[data-item="200"]').onclick = () => state.clicked++;
    const helper = createInventoryBrowser({ root, inventory: () => state.inventory, creative: () => state.creative,
      recipes: [{ id: 126, name: '钻石剑', recipe: { 34: 2, 4: 2 } }, { id: 205, name: '面包', recipe: { 206: 3 } }],
      name: id => ({ 4: '木材', 34: '钻石', 206: '小麦' })[id] ?? String(id),
    });
    window.inventoryFixture = { state, helper };
    root.showModal();
  });
  const visible = () => page.locator('#materials-panel .material-card:visible').count();
  assert.equal(await visible(), 8);
  await page.locator('[data-category="food"]').click();
  assert.equal(await visible(), 1);
  await page.getByRole('button', { name: '苹果', exact: true }).click();
  assert.equal(await page.evaluate(() => window.inventoryFixture.state.clicked), 1, 'existing item action is preserved');
  await page.locator('#inventory-reset').click();
  await page.locator('#inventory-search').fill('钻石');
  assert.equal(await visible(), 3);
  await page.locator('#inventory-owned').check();
  assert.equal(await visible(), 0);
  assert.equal(await page.locator('.inventory-empty').isVisible(), true);
  await page.locator('#inventory-reset').click();
  await page.locator('#inventory-craftable').check();
  assert.equal(await visible(), 1);
  assert.equal(await page.getByRole('button', { name: '合成面包', exact: true }).isVisible(), true);
  await page.locator('#inventory-craftable').uncheck();
  assert.match(await page.locator('[data-recipe="126"]').innerText(), /木材 1\/2 · 缺 1/);
  await page.evaluate(() => { window.inventoryFixture.state.inventory[4] = 2; window.inventoryFixture.helper.refresh(); });
  await page.locator('#inventory-craftable').check();
  assert.equal(await visible(), 2);
  await page.evaluate(() => { window.inventoryFixture.state.inventory[126] = 1; window.inventoryFixture.helper.refresh(); });
  assert.equal(await visible(), 1, 'owned single-instance tools cannot be crafted again');
  await page.evaluate(() => { window.inventoryFixture.state.inventory = {}; window.inventoryFixture.state.creative = true; window.inventoryFixture.helper.refresh(); });
  assert.equal(await visible(), 2, 'creative recipes do not require ingredients');
  await page.locator('#inventory-reset').click();
  await page.locator('[data-category="resources"]').click();
  assert.equal(await visible(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#inventory-reset').click();
  assert.equal(await page.evaluate(() => {
    const dialog = document.getElementById('materials-panel');
    return dialog.scrollWidth <= dialog.clientWidth && dialog.getBoundingClientRect().right <= innerWidth;
  }), true, 'inventory fits a narrow viewport');
  await page.evaluate(() => window.inventoryFixture.helper.dispose());
  assert.equal(await page.locator('.inventory-browser-controls').count(), 0);
  assert.equal(await visible(), 8);
  console.log('Inventory categories, search, owned/craftable filters, deficits, creative recipes, callbacks, mobile width and disposal passed.');
} finally { await browser.close(); }
