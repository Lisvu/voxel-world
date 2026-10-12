import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { snapshotFingerprint } from '../dist-server/shared/contracts.js';

const base = process.env.TEST_API_URL ?? 'http://127.0.0.1:3001/api';
const db = new PrismaClient();
const users = [];
async function request(path, { method = 'GET', body, cookie, csrf = true } = {}) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Voxel-Client': 'web' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json(), setCookie: response.headers.get('set-cookie') };
}
await test('PostgreSQL-backed API', async t => {
  const suffix = randomUUID(), password = 'Test-only-password-2026!';
  let cookieA, cookieB, world;
  const email = `api-a-${suffix}@example.test`;
  try {
    await t.test('JSON numeric round trips do not create false draft conflicts', () => {
      const snapshot = { version: 1, seed: 248, changes: [['0,4,0', 7], ['2,3,0', 0]], position: { x: 2.6913373470306396, y: 6.315098762512207, z: 10.750333786010742 }, yaw: 0, pitch: 0, selected: 7, night: false };
      const restored = { ...snapshot, changes: [...snapshot.changes].reverse(), position: { ...snapshot.position, x: 2.69133734703064, z: 10.75033378601074 } };
      assert.equal(snapshotFingerprint(snapshot), snapshotFingerprint(restored));
      assert.notEqual(snapshotFingerprint(snapshot), snapshotFingerprint({ ...restored, selected: 3 }));
    });
    await t.test('health and anonymous access', async () => {
      assert.equal((await request('/health')).data.database, 'postgresql');
      assert.equal((await request('/worlds')).status, 401);
      assert.equal((await request('/auth/register', { method: 'POST', csrf: false, body: {} })).status, 403);
    });
    await t.test('register, password hashing, secure session cookie', async () => {
      const a = await request('/auth/register', { method: 'POST', body: { email, password, name: 'API test A' } });
      assert.equal(a.status, 201); users.push(a.data.id); cookieA = a.setCookie.split(';')[0];
      assert.match(a.setCookie, /HttpOnly/i); assert.match(a.setCookie, /SameSite=Strict/i);
      assert.equal(a.data.passwordHash, undefined);
      const row = await db.user.findUniqueOrThrow({ where: { id: a.data.id } });
      assert.notEqual(row.passwordHash, password); assert.match(row.passwordHash, /^[a-f0-9]+:[a-f0-9]+$/);
      const b = await request('/auth/register', { method: 'POST', body: { email: `api-b-${suffix}@example.test`, password, name: 'API test B' } });
      assert.equal(b.status, 201); users.push(b.data.id); cookieB = b.setCookie.split(';')[0];
      assert.equal((await request('/auth/me', { cookie: cookieA })).data.id, a.data.id);
    });
    await t.test('duplicate registration and invalid password', async () => {
      assert.equal((await request('/auth/register', { method: 'POST', body: { email, password, name: 'duplicate' } })).status, 409);
      assert.equal((await request('/auth/login', { method: 'POST', body: { email, password: 'wrong-password' } })).status, 401);
    });
    await t.test('create world and owner isolation', async () => {
      const result = await request('/worlds', { method: 'POST', cookie: cookieA, body: { name: 'Integration world', seed: 248 } });
      assert.equal(result.status, 201); world = result.data;
      assert.equal(world.revision, 0); assert.deepEqual(world.snapshot.changes, []);
      assert.equal((await request('/worlds', { cookie: cookieB })).data.length, 0);
      assert.equal((await request(`/worlds/${world.id}`, { cookie: cookieB })).status, 404);
      assert.equal((await request(`/worlds/${world.id}`, { method: 'DELETE', cookie: cookieB })).status, 404);
      assert.equal((await request(`/worlds/${world.id}`, { method: 'PATCH', cookie: cookieB, body: { name: 'stolen' } })).status, 404);
    });
    const snapshot = () => ({ ...world.snapshot, changes: [['0,5,0', 7], ['-17,4,17', 0]], position: { x: 0, y: 8, z: 12 } });
    await t.test('validate coordinates, duplicate blocks, bedrock and seed', async () => {
      for (const changes of [[['90,3,0', 2]], [['0,0,0', 0]], [['0,4,0', 1], ['0,4,0', 2]]]) {
        assert.equal((await request(`/worlds/${world.id}/save`, { method: 'PUT', cookie: cookieA, body: { revision: 0, snapshot: { ...snapshot(), changes } } })).status, 400);
      }
      assert.equal((await request(`/worlds/${world.id}/save`, { method: 'PUT', cookie: cookieA, body: { revision: 0, snapshot: { ...snapshot(), seed: 900 } } })).status, 400);
      assert.equal((await request(`/worlds/${world.id}/save`, { method: 'PUT', cookie: cookieB, body: { revision: 0, snapshot: snapshot() } })).status, 404);
    });
    await t.test('save transactions persist block edits into PostgreSQL chunks', async () => {
      const result = await request(`/worlds/${world.id}/save`, { method: 'PUT', cookie: cookieA, body: { revision: 0, snapshot: snapshot() } });
      assert.equal(result.status, 200); assert.equal(result.data.revision, 1);
      const chunks = await db.worldChunk.findMany({ where: { worldId: world.id } });
      assert.equal(chunks.length, 2);
      const restored = await request(`/worlds/${world.id}`, { cookie: cookieA });
      assert.deepEqual(restored.data.snapshot.changes.sort(), snapshot().changes.sort());
      assert.deepEqual(restored.data.snapshot.position, snapshot().position);
    });
    await t.test('stale and concurrent writes cannot overwrite each other', async () => {
      assert.equal((await request(`/worlds/${world.id}/save`, { method: 'PUT', cookie: cookieA, body: { revision: 0, snapshot: snapshot() } })).status, 409);
      const results = await Promise.all([false, true].map(night => request(`/worlds/${world.id}/save`, { method: 'PUT', cookie: cookieA, body: { revision: 1, snapshot: { ...snapshot(), night } } })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal((await request(`/worlds/${world.id}`, { cookie: cookieA })).data.revision, 2);
    });
    await t.test('rename, delete and cascading chunk cleanup', async () => {
      assert.equal((await request(`/worlds/${world.id}`, { method: 'PATCH', cookie: cookieA, body: { name: 'Renamed world' } })).data.name, 'Renamed world');
      assert.equal((await request(`/worlds/${world.id}`, { method: 'DELETE', cookie: cookieA })).status, 200);
      assert.equal(await db.worldChunk.count({ where: { worldId: world.id } }), 0);
      assert.equal((await request(`/worlds/${world.id}`, { cookie: cookieA })).status, 404);
    });
    await t.test('logout invalidates session and login restores account access', async () => {
      await request('/auth/logout', { method: 'POST', cookie: cookieA });
      assert.equal((await request('/auth/me', { cookie: cookieA })).status, 401);
      const result = await request('/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(result.status, 201); cookieA = result.setCookie.split(';')[0];
      assert.equal((await request('/auth/me', { cookie: cookieA })).status, 200);
      await db.session.updateMany({ where: { userId: users[0] }, data: { expiresAt: new Date(0) } });
      assert.equal((await request('/auth/me', { cookie: cookieA })).status, 401);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
