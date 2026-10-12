import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { createWorldSchema, GENERATOR_VERSION, saveSchema, snapshotSchema, worldNameSchema, type Snapshot } from '../shared/contracts.js';
import { AuthGuard, type AuthRequest } from './auth.js';
import { Database } from './database.js';
import { parse } from './validation.js';

const summarySelect = { id: true, name: true, seed: true, generatorVersion: true, revision: true, blockCount: true, createdAt: true, updatedAt: true } as const;
function chunks(snapshot: Snapshot) {
  const grouped = new Map<string, { x: number; z: number; edits: Snapshot['changes'] }>();
  for (const edit of snapshot.changes) {
    const [x, , z] = edit[0].split(',').map(Number), cx = Math.floor(x / 16), cz = Math.floor(z / 16), key = `${cx},${cz}`;
    if (!grouped.has(key)) grouped.set(key, { x: cx, z: cz, edits: [] });
    grouped.get(key)!.edits.push(edit);
  }
  return [...grouped.values()];
}
function playerState(snapshot: Snapshot): Prisma.InputJsonObject {
  const { changes: _, seed: __, version: ___, ...player } = snapshot;
  return JSON.parse(JSON.stringify(player));
}

@Injectable()
export class WorldsService {
  constructor(private readonly db: Database) {}
  list(ownerId: string) { return this.db.world.findMany({ where: { ownerId }, select: summarySelect, orderBy: { updatedAt: 'desc' } }); }
  async detail(ownerId: string, id: string) {
    const world = await this.db.world.findFirst({ where: { id, ownerId }, select: { ...summarySelect, playerState: true, chunks: true } });
    if (!world) throw new NotFoundException('世界不存在');
    const { chunks: savedChunks, playerState: player, ...summary } = world;
    return { ...summary, snapshot: snapshotSchema.parse({ ...(player as object), version: 1, seed: world.seed, changes: savedChunks.flatMap(chunk => chunk.edits as Snapshot['changes']) }) };
  }
  async create(ownerId: string, input: unknown) {
    const data = parse(createWorldSchema, input);
    const snapshot = data.snapshot ?? snapshotSchema.parse({ version: 1, seed: data.seed ?? randomInt(2147483647), changes: [] });
    const result = await this.db.world.create({ data: {
      name: data.name, seed: snapshot.seed, ownerId, generatorVersion: GENERATOR_VERSION,
      playerState: playerState(snapshot), blockCount: snapshot.changes.length,
      chunks: { create: chunks(snapshot) },
    }, select: summarySelect });
    return { ...result, snapshot };
  }
  async save(ownerId: string, id: string, input: unknown) {
    const { revision, snapshot } = parse(saveSchema, input);
    // The revision update obtains the row lock before replacing chunk records.
    // A stale tab cannot overwrite a newer world, including concurrent requests.
    return this.db.$transaction(async tx => {
      const world = await tx.world.findFirst({ where: { id, ownerId }, select: { seed: true, generatorVersion: true } });
      if (!world) throw new NotFoundException('世界不存在');
      if (snapshot.seed !== world.seed || world.generatorVersion !== GENERATOR_VERSION) throw new BadRequestException('世界种子或生成器版本不一致');
      const result = await tx.world.updateMany({ where: { id, ownerId, revision }, data: {
        revision: { increment: 1 }, playerState: playerState(snapshot), blockCount: snapshot.changes.length,
      } });
      if (result.count !== 1) throw new ConflictException('世界已在其他页面更新，请重新载入后继续');
      await tx.worldChunk.deleteMany({ where: { worldId: id } });
      const rows = chunks(snapshot).map(chunk => ({ ...chunk, worldId: id }));
      if (rows.length) await tx.worldChunk.createMany({ data: rows });
      return tx.world.findUniqueOrThrow({ where: { id }, select: summarySelect });
    });
  }
  async rename(ownerId: string, id: string, input: unknown) {
    const { name } = parse(z.object({ name: worldNameSchema }).strict(), input);
    const result = await this.db.world.updateMany({ where: { id, ownerId }, data: { name } });
    if (!result.count) throw new NotFoundException('世界不存在');
    return this.db.world.findUniqueOrThrow({ where: { id }, select: summarySelect });
  }
  async remove(ownerId: string, id: string) {
    const result = await this.db.world.deleteMany({ where: { id, ownerId } });
    if (!result.count) throw new NotFoundException('世界不存在');
    return { ok: true };
  }
}

@Controller('worlds') @UseGuards(AuthGuard)
export class WorldsController {
  constructor(private readonly worlds: WorldsService) {}
  @Get() list(@Req() req: AuthRequest) { return this.worlds.list(req.user.id); }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown) { return this.worlds.create(req.user.id, body); }
  @Get(':id') detail(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.worlds.detail(req.user.id, id); }
  @Put(':id/save') save(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.worlds.save(req.user.id, id, body); }
  @Patch(':id') rename(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.worlds.rename(req.user.id, id, body); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.worlds.remove(req.user.id, id); }
}
