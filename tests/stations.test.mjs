import test from 'node:test';
import assert from 'node:assert/strict';
import { createStation, stationRecipes, matchRecipe, fillRecipe, craftStation, transferTo, transferBack, advanceFurnace, stationContents } from '../dist-server/shared/stations.js';

const stack = (id, count = 1) => ({ id, count });
const grid = (ids) => ids.map(id => id === null ? null : stack(id));

test('shaped recipes accept translated and mirrored shapes but reject extra material', () => {
  assert.equal(matchRecipe(grid([null,null,null, null,4,4, null,4,4]))?.id, 20);
  assert.equal(matchRecipe(grid([null,null,null, 206,206,206, null,null,null]))?.id, 205);
  assert.equal(matchRecipe(grid([null,32,32, null,4,32, null,4,null]))?.id, 119);
  assert.equal(matchRecipe(grid([4,4,null, 4,4,null, null,null,3])), null);
  assert.equal(matchRecipe(Array(9).fill(null)), null);
  assert.equal(matchRecipe([stack(4)]), null);
});

test('recipes cover all tools and armor and preserve their distinct shaped costs', () => {
  const ids = new Set(stationRecipes.map(recipe => recipe.id));
  for (const id of [...Array.from({length:30}, (_,i) => 100+i), ...Array.from({length:12}, (_,i) => 300+i), 7,20,21,22,23,205]) assert.equal(ids.has(id), true, `recipe ${id}`);
  assert.equal(matchRecipe(grid([3,3,3, 3,null,3, 3,3,3]))?.id, 23);
  assert.equal(matchRecipe(grid([32,32,32, 32,null,32, null,null,null]))?.id, 300);
  assert.equal(stationRecipes.find(recipe => recipe.id === 100).pattern.filter(id => id === 4).length, 5);
});

test('fill returns the previous grid and debits new materials atomically', () => {
  const station = createStation('workbench'), inventory = {4:3,3:2};
  station.slots[8] = stack(4,2);
  station.slots[7] = stack(3,2);
  assert.equal(fillRecipe(station,20,inventory,false),true);
  assert.deepEqual(inventory,{4:1,3:4});
  assert.equal(matchRecipe(station.slots)?.id,20);
  assert.equal(station.slots.filter(Boolean).length,4);
});

test('insufficient materials and return overflow leave both inventories untouched', () => {
  for (const inventory of [{4:2},{4:9999,3:9999}]) {
    const station = createStation('workbench');
    station.slots[8] = stack(3);
    const before = structuredClone({station,inventory});
    assert.equal(fillRecipe(station,20,inventory,false),false);
    assert.deepEqual({station,inventory},before);
  }
});

test('craft consumes one item per occupied cell and respects output capacity', () => {
  const station = createStation('workbench'), inventory = {4:2};
  station.slots[7] = stack(4,2);
  assert.equal(craftStation(station,inventory,false),true);
  assert.deepEqual(inventory,{4:2,7:4});
  assert.deepEqual(station.slots[7],stack(4));
  inventory[7] = 9998;
  const before = structuredClone({station,inventory});
  assert.equal(craftStation(station,inventory,false),false);
  assert.deepEqual({station,inventory},before);
});

test('tools and armor are unique inventory outputs and cannot enter station slots', () => {
  for (const id of [100,300]) {
    const station = createStation('workbench'), inventory = {[id]:1,4:99,32:99};
    assert.equal(fillRecipe(station,id,inventory,false),true);
    const before = structuredClone({station,inventory});
    assert.equal(craftStation(station,inventory,false),false);
    assert.deepEqual({station,inventory},before);
    assert.equal(transferTo(station,8,id,1,inventory,false),false);
    assert.equal(inventory[id],1);
  }
});

test('creative recipe fill is free and crafting consumes only its grid', () => {
  const station = createStation('workbench'), inventory = {};
  assert.equal(fillRecipe(station,23,inventory,true),true);
  assert.deepEqual(inventory,{});
  assert.equal(craftStation(station,inventory,true),true);
  assert.deepEqual(inventory,{23:1});
  assert.equal(station.slots.every(slot => slot === null),true);
});

test('transfers enforce amounts, stack bounds and inventory availability atomically', () => {
  const station = createStation('workbench'), inventory = {4:70};
  assert.equal(transferTo(station,0,4,64,inventory,false),true);
  assert.deepEqual(station.slots[0],stack(4,64));
  assert.equal(inventory[4],6);
  const before = structuredClone({station,inventory});
  for (const [index,id,count] of [[0,4,1],[1,4,7],[1,3,1],[-1,4,1],[9,4,1],[1.5,4,1],[1,4,0],[1,4,-1],[1,4,1.5],[1,4,Infinity],[1,4,NaN],[1,999,1]]) {
    assert.equal(transferTo(station,index,id,count,inventory,false),false);
    assert.deepEqual({station,inventory},before);
  }
  assert.equal(transferBack(station,0,inventory),true);
  assert.deepEqual(inventory,{4:70});
  assert.equal(station.slots[0],null);
});

test('return overflow and replacing a different material never lose either stack', () => {
  const station = createStation('workbench'), inventory = {4:9999,3:1};
  station.slots[0] = stack(4);
  const before = structuredClone({station,inventory});
  assert.equal(transferBack(station,0,inventory),false);
  assert.equal(transferTo(station,0,3,1,inventory,false),false);
  assert.deepEqual({station,inventory},before);
});

test('furnace accepts only smeltable inputs and fuel and never deposits into output', () => {
  const station = createStation('furnace'), inventory = {15:3,30:2,31:1,3:1};
  assert.equal(transferTo(station,0,3,1,inventory,false),false);
  assert.equal(transferTo(station,1,15,1,inventory,false),false);
  assert.equal(transferTo(station,2,31,1,inventory,false),false);
  assert.equal(transferTo(station,0,15,3,inventory,false),true);
  assert.equal(transferTo(station,1,30,2,inventory,false),true);
  assert.equal(advanceFurnace(station,4),true);
  assert.equal(station.progress,4);
  assert.equal(station.burn,60);
  assert.equal(transferBack(station,0,inventory),true);
  assert.equal(station.progress,0);
  assert.equal(transferTo(station,0,16,1,inventory,true),true);
  assert.equal(station.progress,0);
});

test('furnace preserves elapsed time across fuel and recipe boundaries', () => {
  const station = createStation('furnace');
  station.slots = [stack(15,10),stack(30,2),null];
  assert.equal(advanceFurnace(station,70),true);
  assert.deepEqual(station.slots,[stack(15,2),null,stack(31,8)]);
  assert.equal(station.progress,6);
  assert.equal(station.burn,58);
  assert.equal(advanceFurnace(station,2),true);
  assert.deepEqual(station.slots,[stack(15),null,stack(31,9)]);
  assert.equal(station.progress,0);
  assert.equal(station.burn,56);
});

test('all furnace recipes yield the expected product after eight seconds', () => {
  for (const [input,output] of [[15,31],[16,32],[17,33],[6,24],[202,203],[204,208]]) {
    const station = createStation('furnace');
    station.slots = [stack(input),stack(4),null];
    assert.equal(advanceFurnace(station,8),true);
    assert.deepEqual(station.slots,[null,null,stack(output)]);
    assert.equal(station.burn,8);
    assert.equal(station.progress,0);
  }
});

test('wood and planks burn sixteen seconds and no fuel is consumed when blocked', () => {
  for (const fuel of [4,7]) {
    const station = createStation('furnace');
    station.slots = [stack(16,3),stack(fuel),null];
    advanceFurnace(station,20);
    assert.deepEqual(station.slots,[stack(16),null,stack(32,2)]);
    assert.equal(station.burn,0);
    assert.equal(station.progress,0);
  }
  for (const output of [stack(32,64),stack(31)]) {
    const station = createStation('furnace');
    station.slots = [stack(16),stack(30),output];
    const before = structuredClone(station);
    assert.equal(advanceFurnace(station,10),false);
    assert.deepEqual(station,before);
  }
});

test('already burning fuel ticks while blocked without consuming another fuel', () => {
  const station = createStation('furnace');
  station.slots = [stack(16,2),stack(30,2),stack(32,63)];
  advanceFurnace(station,80);
  assert.deepEqual(station.slots,[stack(16),stack(30),stack(32,64)]);
  assert.equal(station.burn,0);
  assert.equal(station.progress,0);
});

test('furnace gives the same result for one large step and many small steps', () => {
  const whole = createStation('furnace');
  whole.slots = [stack(6,64),stack(7,40),null];
  const split = structuredClone(whole);
  advanceFurnace(whole,513);
  for (let i=0;i<513;i++) advanceFurnace(split,1);
  assert.deepEqual(whole,split);
  assert.deepEqual(whole.slots,[null,stack(7,8),stack(24,64)]);
});

test('fractional frame times complete recipes at the eight-second boundary', () => {
  const station = createStation('furnace');
  station.slots = [stack(15,3),stack(4),null];
  for (let i=0;i<160;i++) advanceFurnace(station,.1);
  assert.deepEqual(station.slots,[stack(15),null,stack(31,2)]);
  assert.equal(station.progress,0);
  assert.equal(station.burn,0);
});

test('each registered recipe crafts its own product with exact material accounting', () => {
  for (const recipe of stationRecipes) {
    const station = createStation('workbench'), inventory = {};
    assert.equal(fillRecipe(station,recipe.id,inventory,true),true);
    assert.equal(matchRecipe(station.slots)?.id,recipe.id,`ambiguous recipe ${recipe.id}`);
    assert.equal(craftStation(station,inventory,true),true);
    assert.deepEqual(inventory,{[recipe.output.id]:recipe.output.count});
    assert.equal(station.slots.every(slot => slot === null),true);
  }
});

test('adding matching input preserves work and returning output permits a blocked furnace to continue', () => {
  const station = createStation('furnace'), inventory = {15:3};
  station.slots = [stack(15),stack(30),stack(31,63)];
  advanceFurnace(station,4);
  assert.equal(transferTo(station,0,15,2,inventory,false),true);
  assert.equal(station.progress,4);
  advanceFurnace(station,4);
  assert.equal(station.slots[2].count,64);
  assert.equal(transferBack(station,2,inventory),true);
  assert.equal(inventory[31],64);
  advanceFurnace(station,8);
  assert.deepEqual(station.slots[2],stack(31));
});

test('invalid times and slot indexes never mutate station or inventory', () => {
  const station = createStation('furnace'), inventory = {};
  station.slots = [stack(15),stack(30),null];
  const before = structuredClone({station,inventory});
  for (const dt of [0,-1,NaN,Infinity]) assert.equal(advanceFurnace(station,dt),false);
  for (const index of [-1,3,1.5,NaN]) assert.equal(transferBack(station,index,inventory),false);
  assert.equal(craftStation(station,inventory,false),false);
  assert.equal(fillRecipe(station,20,inventory,false),false);
  assert.deepEqual({station,inventory},before);
});

test('station contents count duplicate slot materials exactly for atomic block drops', () => {
  const station = createStation('workbench');
  station.slots[0] = stack(4,64);
  station.slots[3] = stack(4,2);
  station.slots[8] = stack(32,7);
  assert.deepEqual(stationContents(station),{4:66,32:7});
});
