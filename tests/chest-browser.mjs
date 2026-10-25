import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{Element.prototype.requestPointerLock=()=>Promise.reject(new Error('Unavailable'));});
 const changes=[];for(let x=-6;x<=6;x++)for(let z=4;z<=17;z++)changes.push([`${x},20,${z}`,3]);changes.push(['0,21,9',25]);
 let snapshot={version:1,seed:42,generatorVersion:2,changes,gameMode:'survival',inventory:{4:64,125:1},durability:{125:100},position:{x:0,y:21.3,z:12},yaw:0,pitch:-.3},saved;
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;const world={id:'station-world',name:'箱子测试',seed:42,revision:0,updatedAt:new Date().toISOString(),blockCount:0,snapshot};if(path.endsWith('/save'))saved=route.request().postDataJSON().snapshot;return route.fulfill({json:path==='/api/auth/me'?{id:'station-user',name:'测试',email:'station@example.test'}:path==='/api/worlds'?[world]:path.endsWith('/save')?{revision:1}:world});});
 async function open(){await page.goto(process.env.TEST_WEB_URL??'http://localhost:5173');await page.evaluate(()=>localStorage.clear());await page.getByRole('button',{name:'进入 箱子测试'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);await page.locator('#play').click();await page.keyboard.press('t');await page.waitForFunction(()=>window.__voxel.getState().target?.type===25);}
 await open();await page.keyboard.press('r');await page.locator('#station-panel[open]').waitFor();
 assert.equal(await page.locator('.station-chest .station-slot').count(),27);assert.equal(await page.locator('#station-result').isVisible(),false);assert.equal(await page.locator('#station-item option[value="125"]').count(),0);
 await page.locator('#station-item').selectOption('4');await page.locator('#station-amount').selectOption('64');await page.locator('#station-slot-26').click();assert.equal(await page.evaluate(()=>window.__voxel.getState().inventory[4]),0);
 await page.setViewportSize({width:390,height:844});await page.locator('#station-slot-26').scrollIntoViewIfNeeded();assert.ok(await page.locator('#station-panel').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:'screenshots/chest-mobile.png'});
 await page.locator('#station-panel-close').click();await page.locator('#save').click();await page.waitForTimeout(700);assert.equal(saved.stations['0,21,9'].slots[26].count,64);snapshot=structuredClone(saved);await page.setViewportSize({width:1280,height:850});
 await open();await page.keyboard.press('r');await page.locator('[data-take-slot="26"]').click();assert.equal(await page.evaluate(()=>window.__voxel.getState().inventory[4]),64);
 await page.locator('#station-item').selectOption('4');await page.locator('#station-amount').selectOption('64');await page.locator('#station-slot-26').click();await page.locator('#station-panel-close').click();await page.locator('#resume').click();await page.keyboard.press('f');await page.waitForFunction(()=>window.__voxel.getState().mined===1);await page.keyboard.press('Escape');await page.locator('#save').click();await page.waitForTimeout(700);
 assert.deepEqual(saved.stations,{});for(const [id,count] of [[25,1],[4,64]])assert.equal((saved.inventory[id]??0)+saved.drops.reduce((n,d)=>n+(d.items[id]??0),0),count);
 assert.deepEqual(errors,[]);console.log('Chest: 27 slots, mobile layout, restricted equipment, save/reload, withdrawal and break contents conserved.');
}finally{await browser.close();}
