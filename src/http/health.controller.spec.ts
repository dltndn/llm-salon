import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('maps GET /health and returns ok', () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, HealthController);
    const methodPath = Reflect.getMetadata(
      PATH_METADATA,
      HealthController.prototype.getHealth,
    );
    const requestMethod = Reflect.getMetadata(
      METHOD_METADATA,
      HealthController.prototype.getHealth,
    );

    expect(controllerPath).toBe('health');
    expect(methodPath).toBe('/');
    expect(requestMethod).toBe(RequestMethod.GET);
    expect(new HealthController().getHealth()).toEqual({ status: 'ok' });
  });
});
