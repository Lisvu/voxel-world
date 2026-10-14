import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BlockLights} from '../src/game/BlockLights.ts';
test('nearest eight lights within 32 blocks use the specified range and release resources',()=>{const scene=new THREE.Scene(),changes=new Map(Array.from({length:12},(_,i)=>[`${i},21,0`,i%2?22:21]));changes.set('100,21,0',22);const lights=new BlockLights(scene,changes);lights.update({x:0,y:21,z:0});assert.equal(lights.activeCount,8);assert.equal(scene.children.length,8);assert.equal(scene.children[0].distance,10);assert.equal(scene.children[1].distance,14);lights.update({x:1000,y:21,z:0});assert.equal(lights.activeCount,0);assert.ok(scene.children.every(l=>l.intensity===0));lights.dispose();assert.equal(scene.children.length,0);});
test('placed, removed and restored light blocks update their source immediately',()=>{const scene=new THREE.Scene(),lights=new BlockLights(scene,new Map());lights.set('-1,21,-1',21);lights.update({x:0,y:21,z:0});assert.equal(lights.activeCount,1);lights.set('-1,21,-1',0);lights.update({x:0,y:21,z:0});assert.equal(lights.activeCount,0);lights.dispose();});
