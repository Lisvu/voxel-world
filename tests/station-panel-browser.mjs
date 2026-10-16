import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { message: 'fixture' } }));
  await page.goto(process.env.TEST_WEB_URL ?? 'http://localhost:5173');
  const available = await page.evaluate(async () => {
    try { await import('/src/game/StationPanel.ts'); return true; } catch { return false; }
  });
  assert.equal(available, true, 'the workbench must provide an interactive station panel');
  await page.evaluate(async () => {
    const { createStationPanel } = await import('/src/game/StationPanel.ts');
    const { createStation, advanceFurnace } = await import('/shared/stations.ts');
    const state = { inventory: { 4: 64, 3: 64, 15: 2, 30: 2 }, creative: false, changes: [], closes: 0 };
    const panel = createStationPanel({ name: id => ({ 4: '木材', 3: '石头', 15: '铜矿石', 30: '煤炭' })[id] ?? String(id),
      inventory: () => state.inventory, creative: () => state.creative,
      changed: id => state.changes.push(id), close: () => { state.closes++; document.getElementById('station-panel').close(); } });
    const workbench = createStation('workbench');
    const furnace = createStation('furnace');
    window.stationFixture = { panel, state, workbench, furnace, advanceFurnace };
    panel.open('1,2,3', workbench);
  });
  assert.equal(await page.locator('#station-panel').evaluate(el => el.open), false, 'the game owns showing and pausing the dialog');
  await page.locator('#station-panel').evaluate(el => el.showModal());
  assert.equal(await page.locator('.station-grid .station-slot').count(), 9);
  await page.locator('#station-item').selectOption('4');
  await page.locator('#station-amount').selectOption('16');
  await page.locator('#station-slot-0').click();
  assert.deepEqual(await page.evaluate(() => window.stationFixture.workbench.slots[0]), { id: 4, count: 16 });
  assert.equal(await page.evaluate(() => window.stationFixture.state.inventory[4]), 48);
  await page.locator('[data-take-slot="0"]').click();
  assert.equal(await page.evaluate(() => window.stationFixture.state.inventory[4]), 64);
  await page.locator('#station-amount').selectOption('1');
  await page.locator('#station-slot-0').click();
  await page.locator('#station-slot-0').click({ button: 'right' });
  assert.equal(await page.evaluate(() => window.stationFixture.state.inventory[4]), 64);
  await page.locator('#station-amount').selectOption('64');
  await page.locator('#station-slot-0').click();
  const changes = await page.evaluate(() => window.stationFixture.state.changes.length);
  await page.locator('#station-slot-0').click();
  assert.equal(await page.evaluate(() => window.stationFixture.state.changes.length), changes, 'a rejected deposit does not save a false mutation');
  assert.match(await page.locator('#station-status').innerText(), /无法放入/);
  await page.locator('[data-take-slot="0"]').click();
  await page.locator('#station-amount').selectOption('1');
  await page.locator('#station-fill').click();
  assert.equal(await page.locator('#station-craft').isEnabled(), true);
  const previewId = await page.evaluate(() => {
    const { workbench } = window.stationFixture;
    return import('/shared/stations.ts').then(({ matchRecipe }) => matchRecipe(workbench.slots).output.id);
  });
  await page.locator('#station-craft').click();
  assert.ok(await page.evaluate(id => window.stationFixture.state.inventory[id] >= 1, previewId));
  assert.equal(await page.evaluate(() => window.stationFixture.state.changes.at(-1)), previewId, 'craft tells the game which item was produced');
  await page.locator('#station-item').focus();
  assert.equal(await page.evaluate(() => {
    const select = document.getElementById('station-item');
    window.stationFixture.panel.refresh();
    return document.activeElement === select;
  }), true, 'refresh keeps keyboard focus on the material control');
  assert.equal(await page.locator('#station-panel').evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth), true, 'workbench fits a 390px viewport');
  await page.locator('#station-item').selectOption('4');
  await page.locator('#station-slot-8').click();
  assert.equal(await page.evaluate(() => {
    const dialog = document.getElementById('station-panel');
    dialog.scrollTop = 80;
    const before = dialog.scrollTop;
    window.stationFixture.panel.refresh();
    return before === dialog.scrollTop;
  }), true, 'furnace and inventory refreshes keep the dialog scroll position');
  await page.locator('#station-panel').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/station-workbench.png' });
  await page.locator('#station-panel-close').click();
  assert.equal(await page.evaluate(() => window.stationFixture.state.closes), 1);
  await page.evaluate(() => {
    const { panel, workbench } = window.stationFixture;
    panel.open('1,2,3', workbench);
    document.getElementById('station-panel').showModal();
  });
  assert.deepEqual(await page.evaluate(() => window.stationFixture.workbench.slots[8]), { id: 4, count: 1 }, 'closing and reentering keeps the workbench contents');
  await page.locator('#station-panel-close').click();
  await page.evaluate(() => {
    const { panel, furnace } = window.stationFixture;
    panel.open('2,2,3', furnace);
    document.getElementById('station-panel').showModal();
  });
  assert.equal(await page.locator('.station-furnace .station-slot').count(), 3);
  await page.locator('#station-item').selectOption('15');
  await page.locator('#station-slot-0').click();
  await page.locator('#station-item').selectOption('30');
  await page.locator('#station-slot-1').click();
  await page.evaluate(() => { const f = window.stationFixture; f.advanceFurnace(f.furnace, 4); f.panel.refresh(); });
  assert.equal(await page.locator('#furnace-progress').evaluate(el => el.value), 4);
  await page.screenshot({ path: '/tmp/station-furnace.png' });
  await page.evaluate(() => { const f = window.stationFixture; f.advanceFurnace(f.furnace, 4); f.panel.refresh(); });
  assert.deepEqual(await page.evaluate(() => window.stationFixture.furnace.slots[2]), { id: 31, count: 1 });
  await page.locator('#station-slot-2').click();
  assert.equal(await page.evaluate(() => window.stationFixture.state.inventory[31]), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.stationFixture.state.closes), 3);
  await page.evaluate(() => window.stationFixture.panel.dispose());
  assert.equal(await page.locator('#station-panel').count(), 0);
  console.log('Station panel deposits, returns, recipe fill/craft, furnace, focus, narrow layout, close and cleanup passed.');
} finally { await browser.close(); }
