import test from 'node:test';
import assert from 'node:assert/strict';
import {createStation,transferTo,transferBack,stationContents,fillRecipe,craftStation,advanceFurnace} from '../dist-server/shared/stations.js';
import {snapshotSchema,snapshotFingerprint} from '../dist-server/shared/contracts.js';
test('chest has 27 bounded slots and preserves contents on rejected transfers',()=>{
 const chest=createStation('chest'),bag={4:80,125:1};assert.equal(chest.slots.length,27);
 assert.equal(transferTo(chest,26,4,64,bag,false),true);assert.equal(bag[4],16);
 const before=JSON.stringify({chest,bag});assert.equal(transferTo(chest,26,4,1,bag,false),false);assert.equal(transferTo(chest,27,4,1,bag,false),false);assert.equal(transferTo(chest,0,125,1,bag,false),false);assert.equal(JSON.stringify({chest,bag}),before);
 assert.deepEqual(stationContents(chest),{4:64});bag[4]=9999;assert.equal(transferBack(chest,26,bag),false);bag[4]=16;assert.equal(transferBack(chest,26,bag),true);assert.equal(bag[4],80);
 assert.equal(fillRecipe(chest,20,bag,false),false);assert.equal(craftStation(chest,bag,false),false);assert.equal(advanceFurnace(chest,10),false);
});
test('eight planks craft a chest and saved chest requires its corresponding block',()=>{
 const table=createStation('workbench'),bag={7:8};assert.equal(fillRecipe(table,25,bag,false),true);assert.equal(craftStation(table,bag,false),true);assert.equal(bag[25],1);
 const chest=createStation('chest');chest.slots[26]={id:208,count:12};const raw={version:1,seed:42,changes:[['0,21,9',25]],stations:{'0,21,9':chest}};
 const save=snapshotSchema.parse(raw);assert.equal(snapshotFingerprint(save),snapshotFingerprint(JSON.parse(JSON.stringify(save))));
 for(const invalid of [{...raw,changes:[]},{...raw,stations:{'0,21,9':{...chest,slots:chest.slots.slice(0,26)}}},{...raw,stations:{'0,21,9':{...chest,burn:1}}}])assert.equal(snapshotSchema.safeParse(invalid).success,false);
});
