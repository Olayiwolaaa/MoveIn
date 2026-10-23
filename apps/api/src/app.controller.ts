import { Controller, Get } from '@nestjs/common';
import { PROPERTY_TYPES } from '@movein/shared';

@Controller()
export class AppController {
  @Get()
  root() {
    return { name: 'movein-api', propertyTypes: PROPERTY_TYPES.length };
  }
}
