import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotSchema,snapshotFingerprint} from '../dist-server/shared/contracts.js';

const base={version:1,seed:42,changes:[]};
const bench=()=>({kind:'workbench',slots:Array(9).fill(null),progress:0,burn:0});
const furnace=()=>({kind:'furnace',slots:[{id:15,count:64},{id:30,count:1},{id:31,count:2}],progress:7.99,burn:64});
const save=(station=bench(),key='0,21,0',block=station.kind==='workbench'?20:23)=>({...base,changes:[[key,block]],stations:{[key]:station}});
const accepts=value=>assert.equal(snapshotSchema.safeParse(value).success,true);
const rejects=value=>assert.equal(snapshotSchema.safeParse(value).success,false);

test('legacy saves default stations to empty and fingerprint like an explicit empty map',()=>{
  assert.deepEqual(snapshotSchema.parse(base).stations,{});
  assert.equal(snapshotFingerprint(base),snapshotFingerprint({...base,stations:{}}));
});
test('workbench and furnace contents and timers round trip',()=>{
  const station=bench();station.slots[4]={id:4,count:64};
  assert.deepEqual(snapshotSchema.parse(save(station)).stations['0,21,0'],station);
  assert.deepEqual(snapshotSchema.parse(save(furnace())).stations['0,21,0'],furnace());
});
test('station keys must be canonical coordinates with matching changed blocks',()=>{
  rejects({...base,stations:{'0,21,0':bench()}});
  for(const [key,block] of [['0,21,0',3],['0,21,0',23],['00,21,0',20],['0,0,0',20],['32769,21,0',20]])rejects(save(bench(),key,block));
  rejects(save(furnace(),'0,21,0',20));
});
test('at most 128 station states are accepted',()=>{
  const value={...base,changes:[],stations:{}};
  for(let x=0;x<128;x++){const key=`${x},21,0`;value.changes.push([key,20]);value.stations[key]=bench();}
  accepts(value);value.changes.push(['128,21,0',20]);value.stations['128,21,0']=bench();rejects(value);
});
test('station shapes, stack bounds and stack item categories are strict',()=>{
  for(const station of [{...bench(),extra:true},{...bench(),kind:'chest'},{...bench(),slots:Array(8).fill(null)},{...bench(),slots:Array(10).fill(null)},{...furnace(),slots:[]},{...bench(),progress:1},{...bench(),burn:1}])rejects(save(station));
  for(const stack of [{id:4,count:0},{id:4,count:65},{id:4,count:1.5},{id:100,count:1},{id:308,count:1},{id:999,count:1},{id:4,count:1,extra:true},{}]){const station=bench();station.slots[0]=stack;rejects(save(station));}
  const station=bench();station.slots[0]={id:208,count:1};accepts(save(station));
});
test('furnace slots accept only the corresponding input fuel and output ids',()=>{
  for(const [index,ids] of [[0,[15,16,17,6,202,204]],[1,[30,4,7]],[2,[31,32,33,24,203,208]]]){
    for(const id of ids){const station=furnace();station.slots[index]={id,count:1};accepts(save(station));}
    const station=furnace();station.slots[index]={id:3,count:1};rejects(save(station));
  }
  accepts(save({...furnace(),slots:[null,null,null],progress:0,burn:0}));
});
test('furnace timers are finite and bounded',()=>{
  for(const progress of [-1,8,Infinity,NaN])rejects(save({...furnace(),progress}));
  for(const burn of [-1,64.01,Infinity,NaN])rejects(save({...furnace(),burn}));
});
test('fingerprints sort station keys and round timers without mutating input',()=>{
  const a={...base,changes:[['1,21,0',23],['0,21,0',20]],stations:{'1,21,0':{...furnace(),progress:1.1234561,burn:2.1234561},'0,21,0':bench()}};
  const b={...a,stations:{'0,21,0':bench(),'1,21,0':{...furnace(),progress:1.1234562,burn:2.1234562}}};
  const original=JSON.stringify(a);assert.equal(snapshotFingerprint(a),snapshotFingerprint(b));assert.equal(JSON.stringify(a),original);
  b.stations['1,21,0'].slots[0].count=2;assert.notEqual(snapshotFingerprint(a),snapshotFingerprint(b));
});
