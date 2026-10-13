// Persistence contract check without a database; PostgreSQL coverage remains test:api.
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldsService } from '../dist-server/server/worlds.js';
test('service creates v2 modes, round trips JSON state, and preserves legacy generation',async()=>{
 let row,chunkRows=[];
 const world={
  create:async({data})=>{row={id:'w',revision:0,...data};chunkRows=data.chunks.create;return {...row};},
  findFirst:async()=>({...row,chunks:chunkRows}),
  updateMany:async({where,data})=>{if(where.revision!==row.revision)return {count:0};row={...row,...data,revision:row.revision+1};return {count:1};},
  findUniqueOrThrow:async()=>({...row}),
  findMany:async()=>[{...row}],
 };
 const tx={world,worldChunk:{deleteMany:async()=>{chunkRows=[];},createMany:async({data})=>{chunkRows=data;}}};
 const service=new WorldsService({...tx,$transaction:async f=>f(tx)});
 const created=await service.create('owner',{name:'New',seed:42,gameMode:'survival',keepInventory:true});
 assert.equal(created.snapshot.generatorVersion,2);assert.equal(created.snapshot.gameMode,'survival');assert.equal(created.snapshot.timeSeconds,200);
 const snapshot={...created.snapshot,timeSeconds:725,health:12,inventory:{'7':24},weather:'snow',changes:[['1000,24,-1000',8]],creatures:[{id:'yak',species:'yak',x:1000,y:24,z:-1000,yaw:1}],drops:[{id:'drop',position:{x:999,y:24,z:-1000},items:{'1':4}}]};
 await service.save('owner','w',{revision:0,snapshot});const restored=await service.detail('owner','w');assert.deepEqual(restored.snapshot,snapshot);
 await assert.rejects(()=>service.save('owner','w',{revision:0,snapshot}),/其他页面/);
 const legacy=await service.create('owner',{name:'Old',snapshot:{version:1,seed:42,changes:[]}});assert.equal(legacy.generatorVersion,1);
 await service.save('owner','w',{revision:0,snapshot:legacy.snapshot});
 await assert.rejects(()=>service.save('owner','w',{revision:1,snapshot:{...legacy.snapshot,generatorVersion:2}}),/生成器版本/);
});
