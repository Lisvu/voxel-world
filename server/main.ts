import 'dotenv/config';
import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from './database.js';
import { AuthController, AuthGuard, AuthService } from './auth.js';
import { WorldsController, WorldsService } from './worlds.js';

@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}
  @Get() async health() { await this.db.$queryRaw`SELECT 1`; return { status: 'ok', database: 'postgresql' }; }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 180 }])],
  controllers: [AuthController, WorldsController, HealthController],
  providers: [Database, AuthService, AuthGuard, WorldsService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class AppModule {}

async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'", "'wasm-unsafe-eval'"] } } }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-voxel-client'] !== 'web') {
      res.status(403).json({ message: '缺少请求校验标记' }); return;
    }
    next();
  });
  app.enableShutdownHooks();
  const dist = resolve('dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    const server = app.getHttpAdapter().getInstance();
    server.use(express.static(dist));
    server.get(/^(?!\/api(?:\/|$)).*/, (_: express.Request, res: express.Response) => res.sendFile(resolve(dist, 'index.html')));
  }
  await app.init();
  await app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
