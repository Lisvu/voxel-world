export const blockTypes = [
  { id: 1, name: '草方块', color: '#679348', side: '#826245', description: '铺设草坪、花园和自然地表。' },
  { id: 2, name: '泥土', color: '#92704f', description: '填平地面，塑造山坡与地基。' },
  { id: 3, name: '岩石', color: '#929c9c', description: '适合城墙、石桥和坚固的建筑。' },
  { id: 4, name: '橡木', color: '#947048', description: '用作树干、立柱与木屋框架。' },
  { id: 5, name: '树叶', color: '#4d8050', description: '装点树冠、绿篱和空中花园。' },
  { id: 6, name: '细沙', color: '#dbc68c', description: '打造沙滩、小径与庭院。' },
  { id: 7, name: '木板', color: '#ba955e', description: '铺设地板、栈道和温暖的墙面。' },
];
export type Settings = { sensitivity: number; touchSensitivity: number; fov: number; volume: number; quality: 'low' | 'medium' | 'high'; shadows: boolean };
export const defaults: Settings = { sensitivity: 1, touchSensitivity: 1, fov: 68, volume: 60, quality: 'high', shadows: true };
export function normalizeSettings(value: unknown): Settings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Settings>;
  const clamp = (n: unknown, min: number, max: number, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return { sensitivity: clamp(v.sensitivity, .2, 3, 1), touchSensitivity: clamp(v.touchSensitivity, .2, 3, 1), fov: clamp(v.fov, 45, 100, 68), volume: clamp(v.volume, 0, 100, 60), quality: ['low', 'medium', 'high'].includes(v.quality ?? '') ? v.quality! : 'high', shadows: typeof v.shadows === 'boolean' ? v.shadows : true };
}
export function readSettings(): Settings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem('voxel-settings-v1') ?? 'null')); } catch { return { ...defaults }; }
}
export function placementError(x: number, y: number, z: number, player: { x: number; y: number; z: number }, occupied: boolean, limit: boolean): string {
  if (Math.abs(x) > 28 || Math.abs(z) > 28 || y < 1 || y > 32) return '已到达世界边界';
  if (limit) return '已达到此世界的修改上限';
  if (occupied) return '这里已有方块';
  if (Math.abs(x-player.x) < .82 && Math.abs(z-player.z) < .82 && Math.abs(y-player.y) < 1.35) return '不能放在脚下或身体内';
  return '';
}
