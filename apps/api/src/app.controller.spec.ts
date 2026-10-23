import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('T01: root reports the API name and the shared property-type list', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [AppController] }).compile();
    const controller = moduleRef.get(AppController);

    expect(controller.root()).toEqual({ name: 'movein-api', propertyTypes: 6 });
  });
});
