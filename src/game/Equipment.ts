import { armorItems, armorSlots, armorSlotLabels, armorDefense, normalizeEquipment, type ArmorSlot, type Equipment } from '../../shared/armor';

type EquipmentOptions = {
  inventory: () => Record<string, number>;
  equipment: () => Equipment;
  change: (next: Equipment) => void;
};

/** The inventory remains the source of ownership; equipping never consumes an item. */
export function createEquipment(options: EquipmentOptions) {
  const root = document.getElementById('equipment-slots');
  const summary = document.getElementById('armor-summary');
  const hud = document.getElementById('armor-hud');
  const abort = new AbortController();
  const controls = new Map<ArmorSlot, HTMLSelectElement>();
  const labels: HTMLLabelElement[] = [];
  let disposed = false;
  for (const slot of armorSlots) {
    const label = document.createElement('label');
    label.className = 'armor-slot';
    const title = document.createElement('span');
    title.textContent = armorSlotLabels[slot];
    const select = document.createElement('select');
    select.dataset.armorSlot = slot;
    select.setAttribute('aria-label', `穿戴${armorSlotLabels[slot]}`);
    label.append(title, select);
    root?.append(label);
    labels.push(label);
    controls.set(slot, select);
    select.addEventListener('change', () => {
      const next = normalizeEquipment(options.equipment(), options.inventory());
      if (select.value) next[slot] = Number(select.value);
      else delete next[slot];
      options.change(normalizeEquipment(next, options.inventory()));
      refresh();
    }, { signal: abort.signal });
  }
  function refresh() {
    if (disposed) return;
    const inventory = options.inventory();
    const equipment = normalizeEquipment(options.equipment(), inventory);
    for (const slot of armorSlots) {
      const select = controls.get(slot)!;
      const available = armorItems.filter(item => item.slot === slot && Number.isFinite(inventory[item.id]) && inventory[item.id] >= 1);
      const key = available.map(item => item.id).join(',');
      if (select.dataset.options !== key) {
        select.replaceChildren(new Option('未穿戴', ''));
        for (const item of available) select.add(new Option(`${item.name} · 防御 ${item.defense}`, String(item.id)));
        select.dataset.options = key;
      }
      select.value = equipment[slot] ? String(equipment[slot]) : '';
    }
    const defense = armorDefense(equipment, inventory);
    const percent = Math.round(Math.min(0.6, defense * 0.03) * 100);
    if (summary) summary.textContent = `防御 ${defense} / 20 · 生物攻击与熔岩伤害降低 ${percent}%。穿戴不消耗背包物品；当前护甲没有耐久消耗，无法抵挡饥饿、溺水、摔落与虚空伤害。`;
    if (hud) {
      hud.textContent = `🛡 防御 ${defense} · 减伤 ${percent}%`;
      hud.title = '仅减免生物攻击与熔岩灼伤';
    }
  }
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      abort.abort();
      for (const label of labels) label.remove();
      if (summary) summary.textContent = '';
      if (hud) hud.textContent = '';
    },
  };
}
