import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotSchema,snapshotFingerprint} from '../dist-server/shared/contracts.js';
const base={version:1,seed:42,changes:[]};
test('legacy saves receive empty equipment',()=>assert.deepEqual(snapshotSchema.parse(base).equipment,{}));
test('armor and new blocks round trip without losing gear or death drops',()=>{const save=snapshotSchema.parse({...base,changes:[['0,21,0',20],['1,21,0',21],['2,21,0',22]],inventory:{308:1},equipment:{helmet:308},drops:[{id:'gear',position:{x:0,y:21,z:0},items:{309:1}}]});assert.equal(snapshotFingerprint(save),snapshotFingerprint(JSON.parse(JSON.stringify(save))));assert.equal(save.equipment.helmet,308);});
test('reject wrong slot, unowned armor, illegal slot and unknown block',()=>{for(const equipment of [{boots:308},{helmet:308},{head:308}])assert.equal(snapshotSchema.safeParse({...base,equipment}).success,false);assert.equal(snapshotSchema.safeParse({...base,changes:[['0,21,0',26]]}).success,false);});
