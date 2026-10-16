import { z } from 'zod';
import { armorItems, armorSlots } from './armor.js';
import { validItem, tools, MAX_BLOCK_ID } from './items.js';
import type { Station } from './stations.js';

export const WORLD_SIZE = 32768;
export const GENERATOR_VERSION = 2;
const finite = z.number().finite();
export const positionSchema = z.object({
  x: finite.min(-32768).max(32768), y: finite.min(-10).max(100), z: finite.min(-32768).max(32768),
}).strict();
const blockKey = z.string().regex(/^-?\d+,[1-9]\d*,-?\d+$/).refine(value => {
  const [x, y, z] = value.split(',').map(Number);
  return Math.abs(x) <= WORLD_SIZE && Math.abs(z) <= WORLD_SIZE && y < 96 && `${x},${y},${z}` === value;
}, '方块坐标超出范围');
export const speciesSchema = z.enum(['cow','sheep','chicken','fish','yak','villager','swallow','eagle','sparrow','cat']);
export type Species = z.infer<typeof speciesSchema>;
export const creatureSchema = z.object({ id:z.string().max(80), species:speciesSchema, x:finite.min(-32768).max(32768), y:finite.min(0).max(100), z:finite.min(-32768).max(32768), yaw:finite, health:finite.min(0).max(40).optional() }).strict();
export type CreatureSave = z.infer<typeof creatureSchema>;
export const gameModeSchema=z.enum(['survival','creative']);
export const inventorySchema=z.record(z.string().refine(v=>String(Number(v))===v&&validItem(Number(v))),z.number().int().min(0).max(9999));
export const durabilitySchema=z.record(z.string().refine(v=>tools.some(t=>String(t.id)===v)),z.number().int().min(1).max(1562)).default({});
export const dropSchema=z.object({id:z.string().max(80),position:positionSchema,items:inventorySchema,durability:durabilitySchema}).strict();
export type WorldDrop=z.infer<typeof dropSchema>;
const armorSlotSchema=(slot:string)=>z.number().int().refine(id=>armorItems.some(a=>a.id===id&&a.slot===slot)).optional();
export const equipmentSchema=z.object({helmet:armorSlotSchema('helmet'),chestplate:armorSlotSchema('chestplate'),leggings:armorSlotSchema('leggings'),boots:armorSlotSchema('boots')}).strict().default({});
const stationStackSchema=z.object({
  id:z.number().int().refine(id=>validItem(id)&&!tools.some(t=>t.id===id)&&!armorItems.some(a=>a.id===id)),
  count:z.number().int().min(1).max(64),
}).strict();
const stationSlotSchema=stationStackSchema.nullable();
const furnaceSlotSchema=(ids:number[])=>stationSlotSchema.refine(stack=>stack===null||ids.includes(stack.id),'熔炉槽位物品无效');
export const stationSchema:z.ZodType<Station>=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('workbench'),slots:z.array(stationSlotSchema).length(9),progress:z.literal(0),burn:z.literal(0)}).strict(),
  z.object({kind:z.literal('furnace'),slots:z.tuple([
    furnaceSlotSchema([15,16,17,6,202,204]),furnaceSlotSchema([30,4,7]),furnaceSlotSchema([31,32,33,24,203,208]),
  ]),progress:finite.min(0).lt(8),burn:finite.min(0).max(64)}).strict(),
]);
export const stationsSchema=z.record(blockKey,stationSchema).refine(value=>Object.keys(value).length<=128,'工作站数量超出限制').default({});
export const snapshotSchema = z.object({
  version: z.literal(1), seed: z.number().int().min(0).max(2147483647),
  changes: z.array(z.tuple([blockKey, z.number().int().min(0).max(MAX_BLOCK_ID)])).max(30000)
    .refine(entries => new Set(entries.map(([key]) => key)).size === entries.length, '方块坐标重复'),
  gameMode: gameModeSchema.default('creative'),
  hunger:finite.min(0).max(20).default(20),
  durability:durabilitySchema,
  equipment:equipmentSchema,
  stations:stationsSchema,
  deadCreatures:z.array(z.string().max(80)).max(10000).default([]),
  health: finite.min(0).max(20).default(20),
  keepInventory: z.boolean().default(false),
  inventory: inventorySchema.default({}),
  drops: z.array(dropSchema).max(256).default([]).refine(v=>new Set(v.map(d=>d.id)).size===v.length,'掉落物标识重复'),
  weather: z.enum(['auto','clear','rain','snow','thunder','cloudy']).default('auto'),
  generatorVersion: z.union([z.literal(1),z.literal(2)]).default(1),
  timeSeconds: finite.min(0).max(1e12).optional(),
  creatures: z.array(creatureSchema).max(256).default([]).refine(v=>new Set(v.map(c=>c.id)).size===v.length,'生物标识重复'),
  position: positionSchema.optional(), yaw: finite.default(-1.05),
  pitch: finite.min(-1.5).max(1.5).default(-.22),
  selected: z.number().int().refine(validItem).default(1), night: z.boolean().default(false),
}).strict().superRefine((snapshot,ctx)=>{
  for(const slot of armorSlots){const id=snapshot.equipment[slot];if(id!==undefined&&(snapshot.inventory[id]??0)<1)ctx.addIssue({code:'custom',path:['equipment',slot],message:'穿戴装备必须在背包中'});}
  const blocks=new Map(snapshot.changes);
  for(const [key,station] of Object.entries(snapshot.stations))if(blocks.get(key)!==(station.kind==='workbench'?20:23))ctx.addIssue({code:'custom',path:['stations',key],message:'工作站必须对应已保存的工作台或熔炉方块'});
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export function snapshotFingerprint(snapshot: Snapshot): string {
  // PostgreSQL/Prisma can round the last digits of JSON floating-point values.
  // Sub-microunit differences must not turn an acknowledged save into a draft.
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const canonical = snapshotSchema.parse(snapshot);
  if (canonical.position) canonical.position = { x: round(canonical.position.x), y: round(canonical.position.y), z: round(canonical.position.z) };
  canonical.hunger=round(canonical.hunger);
  canonical.deadCreatures.sort();
  canonical.stations=Object.fromEntries(Object.entries(canonical.stations).sort(([a],[b])=>a.localeCompare(b)).map(([key,station])=>[key,{...station,progress:round(station.progress),burn:round(station.burn)}]));
  canonical.yaw = round(canonical.yaw); canonical.pitch = round(canonical.pitch);
  if(canonical.timeSeconds!==undefined)canonical.timeSeconds=round(canonical.timeSeconds);
  canonical.drops=canonical.drops.map(d=>({...d,position:{x:round(d.position.x),y:round(d.position.y),z:round(d.position.z)}})).sort((a,b)=>a.id.localeCompare(b.id));
  canonical.creatures=canonical.creatures.map(c=>({...c,x:round(c.x),y:round(c.y),z:round(c.z),yaw:round(c.yaw)})).sort((a,b)=>a.id.localeCompare(b.id));
  canonical.changes.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(canonical);
}
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, '密码至少需要 10 个字符').max(128),
}).strict();
export const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(1).max(30) });
export const worldNameSchema = z.string().trim().min(1, '请输入世界名称').max(40);
export const createWorldSchema = z.object({
  name: worldNameSchema,
  seed: z.number().int().min(0).max(2147483647).optional(),
  snapshot: snapshotSchema.optional(),
  gameMode: gameModeSchema.optional(),
  keepInventory: z.boolean().optional(),
}).strict().refine(data => !data.snapshot || data.seed === undefined || data.seed === data.snapshot.seed, '种子与存档不一致');
export const saveSchema = z.object({ revision: z.number().int().min(0), snapshot: snapshotSchema }).strict();
export interface User { id: string; email: string; name: string }
export interface WorldSummary {
  gameMode?: 'survival'|'creative';
  id: string; name: string; seed: number; generatorVersion: number; revision: number;
  createdAt: string; updatedAt: string; blockCount: number;
}
export interface WorldDetail extends WorldSummary { snapshot: Snapshot }
