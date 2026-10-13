import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
let source = await readFile(new URL('../src/game/features.ts', import.meta.url), 'utf8');
const items=ts.transpileModule(await readFile(new URL('../shared/items.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
source=source.replace('../../shared/items',`data:text/javascript;base64,${Buffer.from(items).toString('base64')}`);
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { normalizeSettings, defaults, placementError } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('corrupt and out-of-range local settings are safe', () => {
  assert.deepEqual(normalizeSettings(null), defaults);
  assert.deepEqual(normalizeSettings({ sensitivity: Infinity, fov: 200, volume: -3, quality: 'ultra', shadows: 'yes' }), { ...defaults, fov:100, volume:0 });
});
test('placement respects world bounds, body, occupancy and change budget', () => {
  const player = { x:0, y:5, z:0 };
  assert.equal(placementError(2,5,0,player,false,false),'');
  assert.match(placementError(32769,5,0,player,false,false), /边界/);
  assert.match(placementError(2,0,0,player,false,false), /边界/);
  assert.match(placementError(2,96,0,player,false,false), /边界/);
  assert.match(placementError(0,5,0,player,false,false), /身体/);
  assert.match(placementError(2,5,0,player,true,false), /已有/);
  assert.match(placementError(2,5,0,player,false,true), /上限/);
  assert.equal(placementError(-32768,95,32768,player,false,false),'');
});
