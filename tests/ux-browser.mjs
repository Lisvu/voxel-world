import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/game/world.ts';
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.TEST_WEB_URL??'http://localhost:5173';
const world={id:'ux-world',name:'前端验证',revision:0,seed:42,updatedAt:new Date().toISOString(),blockCount:0,snapshot:{version:1,seed:42,generatorVersion:2,changes:[],gameMode:'survival',inventory:{125:1,200:2},durability:{125:33},selected:1,health:20,hunger:20}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.addInitScript(()=>{Element.prototype.requestPointerLock=()=>Promise.reject(new Error('Unavailable'));});
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({json:path==='/api/auth/me'?{id:'ux',name:'测试',email:'ux@example.test'}:path==='/api/worlds'?[world]:path.endsWith('/save')?{revision:1}:world});});
 async function open(){await page.goto(base);await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('voxel-backup:'))localStorage.removeItem(key);});await page.getByRole('button',{name:'进入 前端验证'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready||document.querySelector('.fatal-error'));const fatal=await page.locator('.fatal-error').count()?await page.locator('.fatal-error').textContent():null;if(fatal)throw new Error(fatal);}
 await open();assert.equal(await page.locator('.slot').count(),9);
 await page.locator('#open-materials').click();await page.locator('#inventory-search').fill('钻石镐');assert.equal(await page.locator('#equipment-grid .material-card:visible').count(),1);
 await page.locator('[data-item="125"]').click();await page.locator('#quickbar-slot').selectOption('9');await page.locator('#quickbar-bind').click();assert.equal(await page.locator('.slot').nth(8).getAttribute('data-type'),'125');
 assert.equal(await page.locator('.slot').nth(8).locator('progress').getAttribute('max'),'1562');
 await page.locator('#materials-panel-close').click();await page.locator('#play').click();await page.keyboard.press('Digit1');await page.keyboard.press('Digit9');assert.equal(await page.evaluate(()=>window.__voxel.getState().selected),125);
 await page.keyboard.press('h');await page.locator('#help-panel[open]').waitFor();assert.equal(await page.evaluate(()=>window.__voxel.getState().active),false);await page.locator('#help-panel-close').click();await page.locator('#resume').click();assert.equal(await page.evaluate(()=>window.__voxel.getState().active),true);
 await page.keyboard.press('Escape');await open();assert.equal(await page.locator('.slot').nth(8).getAttribute('data-type'),'125','world-specific quickbar persists');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const bar=await page.locator('.survival-bar').boundingBox();assert.ok(bar.x>=0&&bar.x+bar.width<=391);for(const icon of await page.locator('#hunger-value span').all()){const box=await icon.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,'hunger icon fits mobile screen');}await page.screenshot({path:'screenshots/ux-mobile-hotbar.png'});
 const terrain=new VoxelWorld(42);let ocean;
 for(let x=-768;x<=768&&!ocean;x+=192)for(let z=-768;z<=768;z+=192)if(terrain.biome(x,z)==='ocean'&&terrain.top(x,z)<8){ocean={x,y:9,z};break;}
 assert.ok(ocean);world.id='ux-ocean';world.snapshot.position=ocean;world.snapshot.pitch=0;world.snapshot.gameMode='survival';
 await page.setViewportSize({width:1440,height:900});await open();assert.equal(await page.locator('.slot').nth(8).getAttribute('data-type'),'9','other world has independent quickbar');
 await page.locator('#play').click();await page.locator('#oxygen-hud').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#oxygen-hud').classList.contains('oxygen-low'),null,{timeout:12000});const oxygenBox=await page.locator('#oxygen-hud').boundingBox(),hintBox=await page.locator('#control-hint').boundingBox();assert.ok(oxygenBox.y+oxygenBox.height<=hintBox.y,'oxygen does not overlap touchpad hint');await page.screenshot({path:'screenshots/ux-oxygen.png'});
 await page.keyboard.press('Escape');assert.deepEqual(errors,[]);console.log('Nine-slot binding, durability, hotkeys, reload, world isolation, help pause, mobile layout and real underwater oxygen passed.');
}finally{await browser.close();}
