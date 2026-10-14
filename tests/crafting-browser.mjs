import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const world={id:'crafting-world',name:'合成测试',seed:42,revision:0,updatedAt:new Date().toISOString(),blockCount:0,snapshot:{version:1,seed:42,generatorVersion:2,changes:[],gameMode:'survival',inventory:{206:30,34:6,4:10},health:20,hunger:10}};
 let saved;
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/save'))saved=route.request().postDataJSON().snapshot;await route.fulfill({json:path==='/api/auth/me'?{id:'craft-user',name:'测试',email:'test@example.test'}:path==='/api/worlds'?[world]:path.endsWith('/save')?{revision:1}:world});});
 const state=()=>page.evaluate(()=>window.__voxel.getState());
 async function open(){await page.goto(process.env.TEST_WEB_URL??'http://localhost:5173');await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('voxel-backup:'))localStorage.removeItem(key);});await page.getByRole('button',{name:'进入 合成测试'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);await page.locator('#open-materials').click();}
 await open();await page.locator('#tracked-recipe').selectOption('205');await page.locator('#craft-amount').selectOption('8');
 await page.locator('[data-category="recipes"]').click();await page.getByRole('button',{name:'合成面包',exact:true}).click();assert.equal((await state()).inventory[205],8);assert.equal((await state()).inventory[206],6);assert.match(await page.locator('#tracked-status').textContent(),/已拥有/);
 await page.getByRole('button',{name:'合成面包',exact:true}).click();assert.equal((await state()).inventory[206],6,'failed batch does not consume materials');
 await page.locator('#craft-amount').selectOption('max');await page.getByRole('button',{name:'合成面包',exact:true}).click();assert.equal((await state()).inventory[205],10);assert.equal((await state()).inventory[206],0);assert.match(await page.locator('#tracked-ingredients').textContent(),/缺 3/);
 await page.locator('#craft-amount').selectOption('8');await page.getByRole('button',{name:'合成钻石剑',exact:true}).click();assert.equal((await state()).inventory[126],1);assert.equal((await state()).inventory[34],4);assert.equal((await state()).durability[126],1562);
 await page.getByRole('button',{name:'合成钻石剑',exact:true}).click();assert.equal((await state()).inventory[34],4,'existing tool is not duplicated');
 await page.locator('[data-category="food"]').click();assert.match(await page.locator('[data-item="205"]').textContent(),/恢复 3 个面包/);
 await page.locator('[data-category="tools"]').click();assert.match(await page.locator('[data-item="125"]').textContent(),/岩石／矿石/);
 await page.locator('#materials-panel-close').click();await page.waitForTimeout(900);assert.equal(saved.inventory[205],10);
 await open();assert.equal(await page.locator('#tracked-recipe').inputValue(),'205','tracking persists');
 await page.setViewportSize({width:390,height:844});const panel=await page.locator('#materials-panel').evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth}));assert.ok(panel.scroll<=panel.width+1,'inventory has no horizontal overflow');await page.screenshot({path:'screenshots/crafting-inventory-mobile.png'});
 await page.locator('#materials-panel-close').click();await page.locator('#play').click();await page.waitForFunction(()=>window.__voxel.getState().active);const box=await page.locator('#recipe-tracker').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);await page.screenshot({path:'screenshots/crafting-tracker-mobile.png'});await page.keyboard.press('Escape');
 await page.locator('#menu-materials').click();await page.locator('#clear-tracking').click();assert.equal(await page.locator('#recipe-tracker').isVisible(),false);
 world.id='other-craft-world';await open();assert.equal(await page.locator('#tracked-recipe').inputValue(),'','world preferences are isolated');
 assert.deepEqual(errors,[]);console.log('Batch crafting, atomic failure, tool limit, attributes, save, tracking persistence, cancellation and mobile layout passed.');
}finally{await browser.close();}
