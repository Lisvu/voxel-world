import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),changes=[];for(let x=-5;x<=5;x++)for(let z=3;z<=17;z++)changes.push([`${x},20,${z}`,3]);
 const world={id:'placing',name:'放置测试',seed:42,revision:0,updatedAt:new Date().toISOString(),blockCount:0,snapshot:{version:1,seed:42,generatorVersion:2,changes,gameMode:'creative',position:{x:0,y:21.3,z:12},yaw:0,pitch:-.6,selected:7}};
 await page.addInitScript(()=>{Element.prototype.requestPointerLock=()=>Promise.reject(new Error('Unavailable'));});
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/me'?{id:'p',name:'测试',email:'p@example.test'}:path==='/api/worlds'?[world]:path.endsWith('/save')?{revision:1}:world});});
 async function open(){await page.goto(process.env.TEST_WEB_URL??'http://localhost:5173');await page.evaluate(()=>localStorage.clear());await page.getByRole('button',{name:'进入 放置测试'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);await page.locator('#play').click();await page.keyboard.press('t');}
 await open();await page.keyboard.down('r');await page.waitForTimeout(650);await page.keyboard.up('r');assert.ok(await page.evaluate(()=>window.__voxel.getState().placed>=2),'holding R should place successive blocks');
 const placed=await page.evaluate(()=>window.__voxel.getState().placed);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__voxel.getState().placed),placed,'release stops placing');
 await open();await page.mouse.move(640,425);await page.mouse.down({button:'right'});await page.mouse.move(648,425);await page.waitForTimeout(550);await page.mouse.up({button:'right'});assert.ok(await page.evaluate(()=>window.__voxel.getState().placed>=2),'small pointer movement must not cancel held secondary placement');
 await page.keyboard.down('r');await page.keyboard.press('e');const paused=await page.evaluate(()=>window.__voxel.getState().placed);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__voxel.getState().placed),paused);await page.keyboard.up('r');
 console.log('Held keyboard and trackpad placement, pointer movement, release and menu cancellation passed.');
}finally{await browser.close();}
