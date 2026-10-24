import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

async function controllerWith(queryRaw: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: vi.fn(queryRaw) } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('SYS-026: reports ok when the database answers', async () => {
    const controller = await controllerWith(async () => [{ '?column?': 1 }]);

    await expect(controller.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('SYS-026: responds 503 when the database is unreachable', async () => {
    const controller = await controllerWith(async () => {
      throw new Error('connection refused');
    });

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
