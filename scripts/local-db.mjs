import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const local = resolve(root, '.local');
const data = resolve(local, 'postgres');
const bin = process.env.PG_BIN ?? (existsSync('/opt/homebrew/opt/postgresql@17/bin/postgres') ? '/opt/homebrew/opt/postgresql@17/bin' : '/usr/lib/postgresql/17/bin');
function run(name, args, env = {}) {
  const result = spawnSync(resolve(bin, name), args, { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `${name} failed`);
  return result.stdout;
}
if (!existsSync(resolve(bin, 'postgres'))) throw new Error('PostgreSQL 17 not found. Set PG_BIN or use Docker Compose.');
mkdirSync(local, { recursive: true, mode: 0o700 });
const configFile = resolve(local, 'database.json');
if (!existsSync(configFile)) writeFileSync(configFile, JSON.stringify({ password: randomBytes(24).toString('hex'), port: 55432 }), { mode: 0o600 });
const config = JSON.parse(readFileSync(configFile, 'utf8'));
const envFile = resolve(root, '.env');
if (process.argv[2] === 'stop') {
  if (existsSync(resolve(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  console.log('Project PostgreSQL stopped.');
} else {
  if (!existsSync(envFile)) writeFileSync(envFile, `DATABASE_URL=postgresql://voxel:${config.password}@127.0.0.1:${config.port}/voxel_world?schema=public\nPOSTGRES_PASSWORD=${config.password}\nPORT=3001\nNODE_ENV=development\n`, { mode: 0o600 });
  if (!existsSync(resolve(data, 'PG_VERSION'))) {
    const passwordFile = resolve(local, 'pg-password');
    writeFileSync(passwordFile, config.password + '\n', { mode: 0o600 });
    run('initdb', ['-D', data, '-U', 'voxel', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', `--pwfile=${passwordFile}`]);
  }
  const status = spawnSync(resolve(bin, 'pg_ctl'), ['-D', data, 'status'], { encoding: 'utf8' });
  if (status.status !== 0) run('pg_ctl', ['-D', data, '-l', resolve(local, 'postgres.log'), '-o', `-p ${config.port} -h 127.0.0.1 -k ${local}`, '-w', 'start']);
  const conn = ['-h', '127.0.0.1', '-p', String(config.port), '-U', 'voxel'];
  const env = { PGPASSWORD: config.password };
  if (run('psql', [...conn, '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='voxel_world'"], env).trim() !== '1') run('createdb', [...conn, 'voxel_world'], env);
  console.log(`Project PostgreSQL ready on 127.0.0.1:${config.port}. Credentials are in .env (not printed).`);
}
