import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check that the API process is responding' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'api' },
      },
      required: ['status', 'service'],
    },
  })
  getHealth() {
    // Liveness only; database, Redis and cloud readiness checks will be added with those integrations.
    return { status: 'ok', service: 'api' };
  }
}
