import { z } from 'zod';

export const WORLD_SIZE = 28;
export const GENERATOR_VERSION = 1;
const finite = z.number().finite();
export const positionSchema = z.object({
  x: finite.min(-40).max(40), y: finite.min(-10).max(40), z: finite.min(-40).max(40),
}).strict();
const blockKey = z.string().regex(/^-?\d+,[1-9]\d*,-?\d+$/).refine(value => {
  const [x, y, z] = value.split(',').map(Number);
  return Math.abs(x) <= WORLD_SIZE && Math.abs(z) <= WORLD_SIZE && y <= 32 && `${x},${y},${z}` === value;
}, '方块坐标超出范围');
export const snapshotSchema = z.object({
  version: z.literal(1), seed: z.number().int().min(0).max(2147483647),
  changes: z.array(z.tuple([blockKey, z.number().int().min(0).max(7)])).max(30000)
    .refine(entries => new Set(entries.map(([key]) => key)).size === entries.length, '方块坐标重复'),
  position: positionSchema.optional(), yaw: finite.default(-1.05),
  pitch: finite.min(-1.5).max(1.5).default(-.22),
  selected: z.number().int().min(1).max(7).default(1), night: z.boolean().default(false),
}).strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export function snapshotFingerprint(snapshot: Snapshot): string {
  // PostgreSQL/Prisma can round the last digits of JSON floating-point values.
  // Sub-microunit differences must not turn an acknowledged save into a draft.
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const canonical = snapshotSchema.parse(snapshot);
  if (canonical.position) canonical.position = { x: round(canonical.position.x), y: round(canonical.position.y), z: round(canonical.position.z) };
  canonical.yaw = round(canonical.yaw); canonical.pitch = round(canonical.pitch);
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
}).strict().refine(data => !data.snapshot || data.seed === undefined || data.seed === data.snapshot.seed, '种子与存档不一致');
export const saveSchema = z.object({ revision: z.number().int().min(0), snapshot: snapshotSchema }).strict();
export interface User { id: string; email: string; name: string }
export interface WorldSummary {
  id: string; name: string; seed: number; generatorVersion: number; revision: number;
  createdAt: string; updatedAt: string; blockCount: number;
}
export interface WorldDetail extends WorldSummary { snapshot: Snapshot }
