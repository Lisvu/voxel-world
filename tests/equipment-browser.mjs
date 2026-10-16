import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.addInitScript(()=>{Element.prototype.requestPointerLock=()=>Promise.reject(new Error('Unavailable'));});
 const changes=[];for(let x=-6;x<=6;x++)for(let z=4;z<=17;z++)changes.push([`${x},20,${z}`,3]);changes.push(['0,21,9',20]);
 let snapshot={version:1,seed:42,generatorVersion:2,changes,gameMode:'survival',inventory:{32:30,4:20,30:10},position:{x:0,y:21.3,z:12},yaw:0,pitch:-.3,timeSeconds:450,hunger:10,health:20};let saved;
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;const world={id:'equipment-test',name:'工作台测试',revision:0,seed:42,updatedAt:new Date().toISOString(),blockCount:0,snapshot};if(path.endsWith('/save'))saved=route.request().postDataJSON().snapshot;await route.fulfill({json:path==='/api/auth/me'?{id:'gear-user',name:'测试',email:'gear@example.test'}:path==='/api/worlds'?[world]:path.endsWith('/save')?{revision:1}:world});});
 const state=()=>page.evaluate(()=>window.__voxel.getState());
 async function open(){await page.goto(process.env.TEST_WEB_URL??'http://localhost:5173');await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('voxel-backup:'))localStorage.removeItem(key);});await page.getByRole('button',{name:'进入 工作台测试'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);await page.locator('#play').click();await page.keyboard.press('t');}
 await open();await page.keyboard.press('e');await page.locator('#inventory-search').fill('不存在的配方');await page.locator('#materials-panel-close').click();await page.locator('#resume').click();await page.waitForFunction(()=>window.__voxel.getState().target?.type===20);await page.keyboard.press('r');await page.locator('#station-panel[open]').waitFor();assert.match(await page.locator('#station-title').textContent(),/工作台/);
 for(const id of [300,301,302,303]){await page.locator('#station-recipe').selectOption(String(id));await page.locator('#station-fill').click();await page.locator('#station-craft').click();assert.equal((await state()).inventory[id],1);}
 await page.locator('#station-panel-close').click();await page.locator('#resume').click();await page.keyboard.press('e');await page.locator('#inventory-reset').click();
 for(const [slot,id] of Object.entries({helmet:300,chestplate:301,leggings:302,boots:303}))await page.locator(`[data-armor-slot="${slot}"]`).selectOption(String(id));
 assert.equal((await state()).armorDefense,12);assert.equal((await state()).inventory[32],6);assert.match(await page.locator('#armor-summary').textContent(),/36%/);
 await page.getByRole('button',{name:'合成火把',exact:true}).click();await page.locator('#materials-panel-close').click();await page.locator('#resume').click();await page.screenshot({path:'screenshots/lighting-before.png'});
 await page.keyboard.down('Shift');await page.keyboard.press('r');await page.keyboard.up('Shift');await page.waitForFunction(()=>window.__voxel.getState().lightSources===1);assert.equal((await state()).inventory[21],0);await page.waitForTimeout(300);await page.screenshot({path:'screenshots/lighting-after.png'});
 await page.keyboard.press('Escape');await page.locator('#save').click();await page.waitForTimeout(700);assert.equal(saved.equipment.helmet,300);assert.ok(saved.changes.some(([,id])=>id===21));snapshot=structuredClone(saved);
 await open();assert.equal((await state()).equipment.boots,303);await page.waitForFunction(()=>window.__voxel.getState().lightSources===1);await page.waitForFunction(()=>window.__voxel.getState().target?.type===21);await page.keyboard.press('f');await page.waitForFunction(()=>window.__voxel.getState().lightSources===0);
 await page.keyboard.press('e');await page.locator('[data-category="armor"]').click();assert.equal(await page.locator('#equipment-grid .material-card:visible').count(),12);await page.locator('[data-armor-slot="helmet"]').selectOption('');assert.equal((await state()).armorDefense,10);
 await page.setViewportSize({width:390,height:844});await page.locator('#equipment-slots').scrollIntoViewIfNeeded();assert.ok(await page.locator('#materials-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'screenshots/equipment-mobile.png'});

 await page.setViewportSize({width:1280,height:850});
 snapshot={...snapshot,changes:changes.filter(([key])=>key!=='0,20,12').concat([['0,20,12',10],['3,21,10',22]]),health:20,hunger:10,position:{x:0,y:21.3,z:12},inventory:{300:1,301:1,302:1,303:1},equipment:{helmet:300,chestplate:301,leggings:302,boots:303},drops:[],keepInventory:false};
 await open();await page.waitForFunction(()=>window.__voxel.getState().health<20);assert.ok(Math.abs((await state()).health-17.44)<.01,'iron armor reduces lava damage by 36%');await page.waitForFunction(()=>window.__voxel.getState().lightSources===1);await page.keyboard.press('Escape');
 for(const keep of [false,true]){
   snapshot={...snapshot,changes,health:.5,hunger:0,keepInventory:keep,inventory:{300:1},equipment:{helmet:300},drops:[]};await open();await page.waitForFunction(()=>window.__voxel.getState().dead,null,{timeout:10000});
   const dead=await state();assert.equal(dead.equipment.helmet,keep?300:undefined);assert.equal(dead.inventory[300]??0,keep?1:0);assert.equal(dead.drops,keep?0:1);await page.waitForTimeout(650);assert.equal(saved.equipment.helmet,keep?300:undefined);if(!keep)assert.equal(saved.drops[0].items[300],1);
 }
 snapshot={...snapshot,health:20,hunger:10,inventory:{300:2},equipment:{helmet:300},drops:[{id:'extra-helmet',position:{x:0,y:21.3,z:12},items:{300:1}}]};await open();await page.waitForTimeout(800);await page.keyboard.press('Escape');await page.locator('#save').click();await page.waitForTimeout(650);assert.equal((await state()).inventory[300],2,'legacy stacks must not create negative pickup');assert.equal(saved.drops[0].items[300],1);
 assert.deepEqual(errors,[]);console.log('Workbench interaction, four armor slots, recipes, save/reload, torch placement/light/removal mobile equipment, lava defense and death retention/drop passed.');
}finally{await browser.close();}
