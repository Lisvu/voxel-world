import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.issues[0]?.message ?? '请求格式错误');
  return result.data;
}
