import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, biomes, WORLD_LIMIT } from '../src/game/world.ts';
import { advanceTime, clockState } from '../src/game/clock.ts';
import { snapshotSchema, snapshotFingerprint } from '../shared/contracts.ts';
test('600 real seconds advances exactly one 24-hour day; pause freezes time',()=>{
  const t=advanceTime(150,600);assert.equal(t,750);assert.equal(clockState(t).hour,6);assert.equal(clockState(t).day,2);assert.equal(advanceTime(t,600,false),t);
  assert.equal(clockState(150).night,false);assert.equal(clockState(450).night,true);
});
test('all six seeded biomes exist and ocean has deep water',()=>{
  const w=new VoxelWorld(42),seen=new Set();
  for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++){seen.add(w.biome(x*192,z*192));if(w.biome(x*192,z*192)==='ocean')assert.ok(w.height(x*192,z*192)<12);}
  assert.deepEqual([...seen].sort(),[...biomes].sort());assert.ok(w.village(38,38));assert.equal(w.get(26,26,26),9);
});
test('chunks are deterministic across generation order, negative coordinates and eviction',()=>{
  const a=new VoxelWorld(42),b=new VoxelWorld(42);a.chunk(-1,0);a.chunk(0,0);b.chunk(0,0);b.chunk(-1,0);
  assert.deepEqual(a.chunk(-1,0),b.chunk(-1,0));assert.deepEqual(a.chunk(0,0),b.chunk(0,0));
  a.set(-1,60,16,8);a.retain(100,100,2);assert.equal(a.cachedChunks,0);assert.equal(a.get(-1,60,16),8);
  assert.notDeepEqual(a.chunk(9,9),new VoxelWorld(43).chunk(9,9));
});
test('legacy snapshot is accepted; expanded positions, eggs and clock round trip',()=>{
  const old=snapshotSchema.parse({version:1,seed:42,changes:[],night:true});assert.equal(old.generatorVersion,1);assert.deepEqual(old.creatures,[]);
  const modern=snapshotSchema.parse({...old,generatorVersion:2,timeSeconds:713,position:{x:2000,y:22,z:-2000},changes:[['2000,70,-2000',13]],creatures:[{id:'yak-1',species:'yak',x:2000,y:22,z:-2000,yaw:0}]});
  assert.equal(snapshotFingerprint(modern),snapshotFingerprint(JSON.parse(JSON.stringify(modern))));
  assert.equal(snapshotSchema.safeParse({...modern,changes:[[`${WORLD_LIMIT+1},2,0`,1]]}).success,false);
  assert.equal(snapshotSchema.safeParse({...modern,creatures:[modern.creatures[0],modern.creatures[0]]}).success,false);
  assert.equal(snapshotSchema.safeParse({...modern,timeSeconds:-1}).success,false);
});
test('legacy central terrain and trees are preserved exactly',()=>{
  const w=new VoxelWorld(42,1),old=new Map(),k=(x,y,z)=>`${x},${y},${z}`;
  for(let x=-28;x<=28;x++)for(let z=-28;z<=28;z++){const h=w.legacyHeight(x,z);for(let y=0;y<=h;y++)old.set(k(x,y,z),y===h?(h<=3?6:1):y<h-2?3:2);}
  for(let x=-25;x<25;x++)for(let z=-25;z<25;z++){
    if(w.legacyHeight(x,z)<4||w.legacyRandom(x,z,8)>.014||Math.hypot(x,z-12)<5)continue;
    const h=w.legacyHeight(x,z),trunk=3+Math.floor(w.legacyRandom(x,z,9)*2);
    for(let y=h+1;y<=h+trunk;y++)old.set(k(x,y,z),4);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=0;dy<=2;dy++)if(Math.abs(dx)+Math.abs(dz)+(dy===2?1:0)<=3&&!old.has(k(x+dx,h+trunk+dy,z+dz)))old.set(k(x+dx,h+trunk+dy,z+dz),5);
  }
  for(let x=-28;x<=28;x++)for(let z=-28;z<=28;z++)for(let y=0;y<40;y++)assert.equal(w.get(x,y,z),old.get(k(x,y,z))??0,`legacy ${x},${y},${z}`);
});

test('survival inventory is consumed and death drops respect the keep toggle',async()=>{
 const {applyDamage,fallDamage,consumeItem,deathInventory}=await import('../src/game/rules.ts');
 const inventory={'7':2};assert.equal(consumeItem('survival',inventory,7),true);assert.equal(inventory[7],1);assert.equal(consumeItem('survival',inventory,8),false);
 assert.equal(consumeItem('creative',inventory,8),true);assert.equal(applyDamage('creative',20,100),20);assert.equal(applyDamage('survival',20,100),0);assert.equal(fallDamage(10),7);
 assert.deepEqual(deathInventory(inventory,false),{inventory:{},dropped:{'7':1}});assert.deepEqual(deathInventory(inventory,true),{inventory:{'7':1},dropped:{}});
 const saved=snapshotSchema.parse({version:1,seed:42,changes:[],gameMode:'survival',health:4,keepInventory:true,inventory:{'7':2},weather:'snow',drops:[]});assert.equal(saved.weather,'snow');assert.equal(saved.gameMode,'survival');
 assert.equal(snapshotSchema.safeParse({...saved,health:21}).success,false);assert.equal(snapshotSchema.safeParse({...saved,inventory:{'99':1}}).success,false);
});

test('database numeric rounding does not produce death-drop conflicts',()=>{
 const a={version:1,seed:42,changes:[],drops:[{id:'drop',position:{x:2.6913373470306396,y:22,z:0},items:{'7':4}}]};
 const b=structuredClone(a);b.drops[0].position.x=2.69133734703064;assert.equal(snapshotFingerprint(a),snapshotFingerprint(b));
});
