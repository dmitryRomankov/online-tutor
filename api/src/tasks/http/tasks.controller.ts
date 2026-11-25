import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../auth/http/auth.guard.js';
import { apiError, invalidSession, rejectedOrigin } from '../../docs/error-response.js';
import { Tasks } from '../application/tasks.js';

class TaskBody {
  @ApiProperty({ maxLength: 200 }) title!: string;
  @ApiProperty({ maxLength: 5000 }) prompt!: string;
  @ApiProperty({
    type: 'array',
    minItems: 2,
    maxItems: 50,
    items: { type: 'string', maxLength: 500 },
  })
  choices!: string[];
  @ApiProperty({ minimum: 0, type: 'integer', description: 'Zero-based index in choices.' })
  correctChoiceIndex!: number;
}

class EditTaskBody extends TaskBody {
  @ApiProperty({ minimum: 1, type: 'integer' }) expectedVersion!: number;
}

class TaskSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) version!: number;
  @ApiProperty() title!: string;
}

class TaskResponse extends TaskBody {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) version!: number;
}

const invalid = apiError(
  400,
  'Invalid task content or identifier.',
  {
    code: 'invalid_task',
    message: 'Enter a title, a prompt, at least two choices, and select one correct choice.',
  },
  { error: 'Bad Request', message: 'Validation failed (uuid is expected)' }
);

const missing = apiError(404, 'The task is unavailable to this tutor.', {
  code: 'not_found',
  message: 'Task not found.',
});

@ApiTags('Tasks')
@ApiCookieAuth()
@apiError(401, 'Sign in required.', invalidSession)
@apiError(
  403,
  'Tutor profile and allowed origin required.',
  { code: 'forbidden', message: 'Only tutors can manage tasks.' },
  rejectedOrigin
)
@apiError(503, 'Task storage unavailable.', {
  code: 'unavailable',
  message: 'Tasks are temporarily unavailable.',
})
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: Tasks) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List the current versions of your single-choice tasks without answer keys.',
  })
  @ApiResponse({ status: 200, type: TaskSummaryResponse, isArray: true })
  list(@Req() request: AuthenticatedRequest) {
    return this.tasks.list(request.user);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Open the current version of your task for editing.' })
  @ApiResponse({ status: 200, type: TaskResponse })
  @invalid
  @missing
  find(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.find(request.user, id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Save a complete single-choice task as an assignable version.' })
  @ApiBody({ type: TaskBody })
  @ApiResponse({ status: 201, type: TaskResponse })
  @invalid
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.tasks.create(request.user, body);
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Save a new version and preserve previous task versions.' })
  @ApiBody({ type: EditTaskBody })
  @ApiResponse({ status: 200, type: TaskResponse })
  @invalid
  @missing
  @apiError(409, 'A newer version already exists.', {
    code: 'version_conflict',
    message: 'A newer version of this task was saved.',
  })
  edit(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown
  ) {
    return this.tasks.edit(request.user, id, body);
  }
}
