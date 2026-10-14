// Frontend integration tests use controlled API fixtures; no database required.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const origin=process.env.TEST_WEB_URL || 'http://127.0.0.1:5173';
const user={id:'frontend-test',name:'建造者',email:'builder@example.test'};
const base={seed:42,generatorVersion:1,revision:0,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',blockCount:0};
const worlds=[{...base,id:'a',name:'青木河谷'},{...base,id:'b',name:'沙岸小屋',blockCount:12}];
const snapshot={version:1,seed:42,changes:[],yaw:-1.05,pitch:-.65,selected:1,night:false};
async function fixture(page){
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path==='/api/auth/me'?user:path==='/api/worlds'?worlds:path.endsWith('/save')?{revision:1}: {...worlds[0],snapshot};
    await route.fulfill({json:body});
  });
}
await mkdir('screenshots',{recursive:true});
try {
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
    await page.goto(origin);await page.locator('.world-card').first().waitFor();
    await page.getByPlaceholder('输入世界名称…').fill('沙岸');assert.equal(await page.locator('.world-card').count(),1);
    await page.getByPlaceholder('输入世界名称…').fill('不存在');await page.getByText('没有找到这个世界').waitFor();
    await page.getByRole('button',{name:'清空搜索'}).click();
    await page.locator('.world-sort select').selectOption('blocks');assert.equal(await page.locator('.world-card h2').first().textContent(),'沙岸小屋');
    await page.screenshot({path:`screenshots/lobby-${mobile?'mobile':'desktop'}.png`});
    await page.getByRole('button',{name:'进入 青木河谷'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);
    assert.equal(await page.locator('.slot').count(),9);assert.equal(await page.locator('#material-grid .material-card').count(),19);
    await page.locator('#open-settings').click();await page.locator('#setting-volume').fill('0');await page.locator('#setting-fov').fill('90');await page.locator('#setting-quality').selectOption('low');await page.locator('#setting-shadows').uncheck();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('voxel-settings-v1')).fov),90);
    await page.screenshot({path:`screenshots/settings-${mobile?'mobile':'desktop'}.png`});
    await page.locator('#settings-panel-close').click();await page.locator('#open-materials').click();await page.locator('.material-card').nth(6).click();assert.equal(await page.evaluate(()=>window.__voxel.getState().selected),7);
    await page.screenshot({path:`screenshots/materials-${mobile?'mobile':'desktop'}.png`});
    await page.locator('#materials-panel-close').click();
    await page.locator('#minimap-toggle').click();assert.equal(await page.locator('#minimap-canvas').isVisible(),false);await page.locator('#minimap-toggle').click();await page.locator('#minimap-expand').click();assert.equal(await page.locator('#minimap').evaluate(el=>el.classList.contains('large')),true);await page.locator('#minimap-expand').click();
    await page.locator('#play').click();await page.waitForFunction(()=>window.__voxel.getState().active);
    await page.waitForFunction(()=>window.__voxel.getState().target);
    if(!mobile){await page.keyboard.press('b');assert.equal(await page.evaluate(()=>window.__voxel.getState().selected===window.__voxel.getState().target.type),true);}
    const mapBefore=await page.locator('#minimap-canvas').evaluate(c=>c.toDataURL());
    const placedBefore=await page.evaluate(()=>window.__voxel.getState().placed);
    if(mobile){await page.locator('.slot').nth(6).click();await page.locator('#place').click();}
    else{await page.keyboard.press('Digit7');await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});}
    await page.waitForFunction(before=>window.__voxel.getState().placed===before+1,placedBefore);
    await page.waitForFunction(before=>document.querySelector('#minimap-canvas').toDataURL()!==before,mapBefore);
    await page.screenshot({path:`screenshots/game-${mobile?'mobile':'desktop'}.png`});
    if(mobile)await page.locator('#pause').click();else await page.keyboard.press('Escape');
    await page.locator('#menu-settings').click();await page.locator('#settings-panel-close').click();await page.locator('#menu[open]').waitFor();
    await page.getByRole('button',{name:'返回并保留本地草稿'}).click();await page.getByText('最近游玩',{exact:true}).waitFor();
    await page.getByRole('button',{name:'继续游玩'}).click();
    await page.waitForFunction(()=>window.__voxel?.getState().ready || document.querySelector('.app-modal'));
    if(await page.getByRole('button',{name:'继续云端版本'}).isVisible())await page.getByRole('button',{name:'继续云端版本'}).click();
    await page.waitForFunction(()=>window.__voxel?.getState().ready);
    assert.equal(await page.locator('.slot').count(),9);await page.locator('#open-settings').click();assert.equal(await page.locator('#setting-fov').inputValue(),'90');
    assert.deepEqual(errors,[]);await context.close();console.log(`${mobile?'Mobile':'Desktop'} frontend checks passed`);
  }
}finally{await browser.close();}
