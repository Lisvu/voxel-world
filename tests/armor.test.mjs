import test from 'node:test';
import assert from 'node:assert/strict';
import { armorItems, armorSlots, normalizeEquipment, armorDefense, protectedDamage } from '../shared/armor.ts';

const inventory = Object.fromEntries(armorItems.map(item => [item.id, 1]));
const suit = start => Object.fromEntries(armorSlots.map((slot, index) => [slot, start + index]));

test('armor recipes and complete suits have the intended material costs and defense', () => {
  assert.equal(armorItems.length, 12);
  for (const [start, resource, defense] of [[300, 32, 12], [304, 33, 8], [308, 34, 20]]) {
    assert.equal(armorDefense(suit(start), inventory), defense);
    assert.deepEqual(armorItems.filter(item => item.id >= start && item.id < start + 4).map(item => item.recipe), [5, 8, 7, 4].map(cost => ({ [resource]: cost })));
  }
});

test('normalization rejects wrong slots, missing ownership, forged properties, and malformed equipment', () => {
  assert.deepEqual(normalizeEquipment({ helmet: 309, chestplate: 309, leggings: 999, boots: 311, extra: 308 }, { 309: 1, 311: 0 }), { chestplate: 309 });
  for (const invalid of [null, undefined, 5, 'armor', [308]]) assert.deepEqual(normalizeEquipment(invalid, inventory), {});
  assert.deepEqual(normalizeEquipment({ helmet: 308, boots: 311 }, { 308: Infinity, 311: NaN }), {});
  assert.deepEqual(normalizeEquipment({ helmet: '308' }, inventory), {});
  const before = structuredClone(inventory);
  normalizeEquipment(suit(308), inventory);
  assert.deepEqual(inventory, before, 'equipping does not consume inventory');
});

test('armor reduces permitted damage only and never hides loss of ownership', () => {
  for (const reason of ['生物攻击', '熔岩灼伤']) {
    assert.equal(protectedDamage(10, reason, suit(308), inventory), 4);
    assert.equal(protectedDamage(10, reason, suit(300), inventory), 6.4);
    assert.equal(protectedDamage(10, reason, suit(308), {}), 10);
  }
  for (const reason of ['饥饿', '溺水', '摔落', '坠入虚空', 'unknown']) assert.equal(protectedDamage(10, reason, suit(308), inventory), 10);
  assert.equal(armorDefense(suit(308), { ...inventory, 309: 0 }), 12);
});
