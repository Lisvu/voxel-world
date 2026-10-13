import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const origin=process.env.TEST_WEB_URL||'http://127.0.0.1:5173';
try{
 for(const mode of ['survival-drop','survival-keep','creative']){
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let snapshot={version:1,generatorVersion:2,seed:42,changes:[],position:{x:20,y:65,z:0},yaw:0,pitch:-.4,selected:7,night:true,timeSeconds:450,creatures:[],gameMode:mode==='creative'?'creative':'survival',health:20,keepInventory:mode==='survival-keep',inventory:{'7':5},weather:'clear',drops:[]};
  let revision=0;const summary={id:'mode-world',name:mode,seed:42,generatorVersion:2,gameMode:snapshot.gameMode,revision:0,createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',blockCount:0};
  await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname;let result;if(p.endsWith('/save')){snapshot=route.request().postDataJSON().snapshot;revision++;result={...summary,revision};}else result=p==='/api/auth/me'?{id:'mode-test',name:'测试',email:'mode@example.test'}:p==='/api/worlds'?[summary]:{...summary,revision,snapshot};await route.fulfill({json:result});});
  await page.goto(origin);await page.getByRole('button',{name:`进入 ${mode}`}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);
  assert.ok(await page.evaluate(()=>window.__voxel.getState().starsOpacity>.5));
  await page.locator('#play').click();
  if(mode!=='creative'){
    await page.locator('#death-panel[open]').waitFor();const state=await page.evaluate(()=>window.__voxel.getState());assert.equal(state.health,0);assert.equal(state.drops,mode==='survival-keep'?0:1);assert.equal(state.inventory['7']??0,mode==='survival-keep'?5:0);
    await page.locator('#respawn-death').click();await page.waitForFunction(()=>window.__voxel.getState().active&&window.__voxel.getState().health===20);
  }else{
    await page.waitForFunction(()=>window.__voxel.getState().grounded);assert.equal(await page.evaluate(()=>window.__voxel.getState().health),20);
    await page.keyboard.press('e');await page.locator('#material-grid [data-type="7"]').click();assert.equal(await page.evaluate(()=>window.__voxel.getState().inventory['7']),69);await page.locator('#materials-panel-close').click();await page.locator('#resume').click();await page.waitForFunction(()=>window.__voxel.getState().active);
  }
  await page.keyboard.press('Escape');await page.locator('#menu-settings').click();
  for(const weather of ['rain','snow','thunder','cloudy','clear']){await page.locator('#weather-choice').selectOption(weather);await page.waitForFunction(w=>window.__voxel.getState().weather===w,weather);}
  await page.locator('#keep-inventory').check();assert.equal(await page.evaluate(()=>window.__voxel.getState().keepInventory),true);
  await page.locator('#weather-choice').selectOption('snow');await page.screenshot({path:`screenshots/mode-${mode}.png`});
  await page.locator('#settings-panel-close').click();await page.locator('#world-list').click();await page.getByRole('button',{name:'继续游玩'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready||document.querySelector('.app-modal'));if(await page.getByRole('button',{name:'继续云端版本'}).isVisible())await page.getByRole('button',{name:'继续云端版本'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);
  const restored=await page.evaluate(()=>window.__voxel.getState());assert.equal(restored.weather,'snow');assert.equal(restored.keepInventory,true);assert.equal(restored.gameMode,summary.gameMode);
  assert.deepEqual(errors,[]);console.log(`${mode}: health, inventory, death, weather and persistence passed`);await page.close();
 }
}finally{await browser.close();}
