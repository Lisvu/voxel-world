import test from 'node:test';
import assert from 'node:assert/strict';
import {craftBatch,craftableCount} from '../src/game/crafting.ts';
const bread={id:205,name:'面包',recipe:{206:3}};
test('batch consumes exact ingredients and produces the requested amount',()=>{const inv={206:25};assert.equal(craftBatch(bread,inv,8,false),true);assert.deepEqual(inv,{206:1,205:8});});
test('insufficient ingredients or output capacity causes no partial consumption',()=>{for(const inv of [{206:23},{206:99,205:9998}]){const before={...inv};assert.equal(craftBatch(bread,inv,8,false),false);assert.deepEqual(inv,before);}});
test('maximum respects materials, capacity and 64 item action limit',()=>{assert.equal(craftableCount(bread,{206:25},false),8);assert.equal(craftableCount(bread,{206:9999,205:9997},false),2);assert.equal(craftableCount(bread,{206:9999},false),64);});
test('tools cannot duplicate and creative mode consumes no resources',()=>{const recipe={id:126,name:'剑',recipe:{34:2,4:2}},inv={};assert.equal(craftBatch(recipe,inv,1,true,true),true);assert.equal(craftBatch(recipe,inv,1,true,true),false);assert.deepEqual(inv,{126:1});});
test('zero, fractional and excessive requests are rejected',()=>{const inv={206:9999};for(const n of [0,-1,1.5,65,NaN,Infinity])assert.equal(craftBatch(bread,inv,n,false),false);assert.deepEqual(inv,{206:9999});});
