export type ArmorSlot = 'helmet' | 'chestplate' | 'leggings' | 'boots';
export type Equipment = Partial<Record<ArmorSlot, number>>;
export const armorSlots: readonly ArmorSlot[] = ['helmet', 'chestplate', 'leggings', 'boots'];
export const armorSlotLabels: Record<ArmorSlot, string> = {
  helmet: '头盔', chestplate: '胸甲', leggings: '护腿', boots: '靴子',
};
const materials = [
  { name: '铁', resource: 32, defense: [2, 5, 3, 2] },
  { name: '金', resource: 33, defense: [1, 3, 3, 1] },
  { name: '钻石', resource: 34, defense: [3, 8, 6, 3] },
];
const costs = [5, 8, 7, 4];
/** Armor stays in inventory while equipped; this version has no armor durability. */
export const armorItems = materials.flatMap((material, materialIndex) => armorSlots.map((slot, slotIndex) => ({
  id: 300 + materialIndex * 4 + slotIndex,
  name: material.name + armorSlotLabels[slot],
  slot,
  defense: material.defense[slotIndex],
  recipe: { [material.resource]: costs[slotIndex] } as Record<string, number>,
})));

/** Ignore forged slots, wrong item kinds, and pieces no longer present in inventory. */
export function normalizeEquipment(equipment: unknown, inventory: Record<string, number>): Equipment {
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment)) return {};
  const normalized: Equipment = {};
  for (const slot of armorSlots) {
    const id = (equipment as Record<string, unknown>)[slot];
    const item = armorItems.find(item => item.id === id && item.slot === slot);
    if (item && Number.isFinite(inventory[item.id]) && inventory[item.id] >= 1) normalized[slot] = item.id;
  }
  return normalized;
}

export function armorDefense(equipment: Equipment, inventory: Record<string, number>): number {
  return Object.values(normalizeEquipment(equipment, inventory)).reduce((total, id) => total + armorItems.find(item => item.id === id)!.defense, 0);
}

/** Each defense point absorbs 3%, capped at 60%. Environmental bypass damage stays unchanged. */
export function protectedDamage(amount: number, reason: string, equipment: Equipment, inventory: Record<string, number>): number {
  if (reason !== '熔岩灼伤' && reason !== '生物攻击') return amount;
  return amount * (1 - Math.min(0.6, armorDefense(equipment, inventory) * 0.03));
}
