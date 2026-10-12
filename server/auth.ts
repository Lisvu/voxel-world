import { Body, CanActivate, ConflictException, Controller, ExecutionContext, Get, Injectable, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
import { credentialsSchema, registerSchema, type User } from '../shared/contracts.js';
import { Database } from './database.js';
import { parse } from './validation.js';

const scrypt = promisify(scryptCallback);
const COOKIE = 'voxel_session';
const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/api' };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export type AuthRequest = Request & { user: User };
const publicUser = { id: true, name: true, email: true } as const;

@Injectable()
export class AuthService {
  constructor(private readonly db: Database) {}
  async register(input: unknown) {
    const data = parse(registerSchema, input);
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(data.password, salt, 64) as Buffer).toString('hex');
    try {
      return await this.db.user.create({ data: { name: data.name, email: data.email, passwordHash: `${salt}:${hash}` }, select: publicUser });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('这个邮箱已经注册');
      throw error;
    }
  }
  async login(input: unknown) {
    const data = parse(credentialsSchema, input);
    const user = await this.db.user.findUnique({ where: { email: data.email } });
    const [salt, expected] = user?.passwordHash.split(':') ?? ['00000000000000000000000000000000', '00'.repeat(64)];
    const actual = await scrypt(data.password, salt, 64) as Buffer;
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !user) throw new UnauthorizedException('邮箱或密码不正确');
    return { id: user.id, name: user.name, email: user.email };
  }
  async session(userId: string, response: Response, oldToken?: string) {
    const token = randomBytes(32).toString('hex');
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    await this.db.$transaction([
      this.db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, ...(oldToken ? [{ tokenHash: digest(oldToken) }] : [])] } }),
      this.db.session.create({ data: { tokenHash: digest(token), userId, expiresAt: new Date(Date.now() + maxAge) } }),
    ]);
    response.cookie(COOKIE, token, { ...cookieOptions, maxAge });
  }
  async resolve(token: unknown): Promise<User> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('请先登录');
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: { select: publicUser } } });
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException('登录已过期，请重新登录');
    return session.user;
  }
  async logout(token: unknown, response: Response) {
    if (typeof token === 'string') await this.db.session.deleteMany({ where: { tokenHash: digest(token) } });
    response.clearCookie(COOKIE, cookieOptions);
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.auth.resolve(request.cookies?.[COOKIE]);
    return true;
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async register(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const user = await this.auth.register(body); await this.auth.session(user.id, response, request.cookies?.[COOKIE]); return user;
  }
  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const user = await this.auth.login(body); await this.auth.session(user.id, response, request.cookies?.[COOKIE]); return user;
  }
  @Get('me') @UseGuards(AuthGuard)
  me(@Req() request: AuthRequest) { return request.user; }
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[COOKIE], response); return { ok: true };
  }
}
