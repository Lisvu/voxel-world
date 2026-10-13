import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { VoxelWorld,biomes } from '../src/game/world.ts';
const browser=await chromium.launch({channel:'chrome',headless:true});
const origin=process.env.TEST_WEB_URL||'http://127.0.0.1:5173';
const w=new VoxelWorld(42),locations=new Map();
for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){const b=w.biome(x*192,z*192);if(!locations.has(b))locations.set(b,{x:x*192,z:z*192});}
locations.set('plains',{x:0,z:12});
await mkdir('screenshots',{recursive:true});
try{
 for(const biome of biomes){
  const context=await browser.newContext({viewport:{width:1100,height:760}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const {x,z}=locations.get(biome);let saved={version:1,generatorVersion:2,seed:42,changes:[],position:{x,y:Math.max(w.top(x,z)+1.5,w.waterLevel(x,z)+1),z},yaw:0,pitch:-.5,selected:1,night:false,timeSeconds:150,creatures:[]};
  let revision=0;const summary={id:'expanded',name:'大世界测试',seed:42,generatorVersion:2,revision,createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',blockCount:0};
  await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let result;
    if(path.endsWith('/save')){const body=route.request().postDataJSON();assert.equal(body.snapshot.generatorVersion,2);saved=structuredClone(body.snapshot);revision++;result={...summary,revision};}
    else result=path==='/api/auth/me'?{id:'user',name:'测试',email:'world@example.test'}:path==='/api/worlds'?[summary]:{...summary,revision,snapshot:saved};
    await route.fulfill({json:result});
  });
  await page.goto(origin);await page.getByRole('button',{name:'进入 大世界测试'}).click();await page.waitForFunction(()=>window.__voxel?.getState().ready);
  await page.waitForFunction(()=>window.__voxel.getState().loadedChunks===25);
  assert.equal(await page.evaluate(()=>window.__voxel.getState().biome),biome);
  assert.ok(await page.evaluate(()=>window.__voxel.getState().cachedChunks<=90));
  await page.locator('#play').click();await page.waitForFunction(()=>window.__voxel.getState().active);
  const before=await page.evaluate(()=>window.__voxel.getState().timeSeconds);await page.waitForFunction(t=>window.__voxel.getState().timeSeconds>t+.5,before);
  if(biome==='plains'||biome==='ocean'){
    await page.keyboard.press('e');const species=biome==='ocean'?'fish':'cow';await page.locator(`[data-species="${species}"]`).click();await page.locator('#materials-panel-close').click();await page.locator('#resume').click();await page.waitForFunction(()=>window.__voxel.getState().active);
    await page.waitForFunction(()=>window.__voxel.getState().target!==null);await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
    await page.waitForFunction(()=>window.__voxel.getState().eggCreatures===1,{},{timeout:3000}).catch(async e=>{console.log(JSON.stringify(await page.evaluate(()=>({state:window.__voxel.getState(),message:document.querySelector('#toast').textContent}))));throw e;});
  }
  await page.screenshot({path:`screenshots/biome-${biome}.png`});
  if(biome==='plains'){
    // Walk across a chunk edge; streaming must stay bounded and maintain solid ground.
    await page.keyboard.down('Space');await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.__voxel.getState().position.x>18);await page.keyboard.up('KeyD');await page.keyboard.up('Space');
    assert.ok(await page.evaluate(()=>window.__voxel.getState().position.y>0));
  }
  await page.keyboard.press('Escape');await page.locator('#menu[open]').waitFor();const paused=await page.evaluate(()=>window.__voxel.getState().timeSeconds);
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__voxel.getState().timeSeconds),paused);
  await page.locator('#world-list').click();await page.getByRole('button',{name:'继续游玩'}).click();
  await page.waitForFunction(()=>window.__voxel?.getState().ready||document.querySelector('.app-modal'));if(await page.getByRole('button',{name:'继续云端版本'}).isVisible())await page.getByRole('button',{name:'继续云端版本'}).click();
  await page.waitForFunction(()=>window.__voxel?.getState().ready);
  assert.ok(Math.abs(await page.evaluate(()=>window.__voxel.getState().timeSeconds)-paused)<.2);
  if(biome==='plains'||biome==='ocean')assert.equal(await page.evaluate(()=>window.__voxel.getState().eggCreatures),1);
  assert.deepEqual(errors,[]);console.log(`${biome}: streamed terrain, clock, save/reload passed`);await context.close();
 }
}finally{await browser.close();}
