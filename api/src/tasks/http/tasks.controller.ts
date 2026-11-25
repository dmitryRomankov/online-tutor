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
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../auth/http/auth.guard.js';
import { apiError, invalidSession, rejectedOrigin } from '../../docs/error-response.js';
import { Tasks, taskTypes } from '../application/tasks.js';

class TaskBody {
  @ApiPropertyOptional({ enum: ['single_choice'], default: 'single_choice' })
  type?: 'single_choice';
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

class FillBlanksBody {
  @ApiProperty({ enum: ['fill_blanks'] }) type!: 'fill_blanks';
  @ApiProperty({ maxLength: 200 }) title!: string;
  @ApiProperty({ maxLength: 5000 }) prompt!: string;
  @ApiProperty({ maxLength: 5000, example: 'Yesterday I [1] home.' }) passage!: string;
  @ApiProperty({
    type: 'array',
    minItems: 1,
    maxItems: 50,
    items: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', maxLength: 500 } },
    example: [['went', 'walked']],
    description: 'One ordered list of accepted answers per numbered blank.',
  })
  blanks!: string[][];
}

class EditFillBlanksBody extends FillBlanksBody {
  @ApiProperty({ minimum: 1, type: 'integer' }) expectedVersion!: number;
}

class WrittenResponseBody {
  @ApiProperty({ enum: ['written_response'] }) type!: 'written_response';
  @ApiProperty({ maxLength: 200 }) title!: string;
  @ApiProperty({ maxLength: 5000, example: 'What did you do last weekend?' }) prompt!: string;
}

class EditWrittenResponseBody extends WrittenResponseBody {
  @ApiProperty({ minimum: 1, type: 'integer' }) expectedVersion!: number;
}

class TaskSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) version!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: [...taskTypes] }) type!: string;
}

class TaskResponse extends TaskBody {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) version!: number;
}

class FillBlanksResponse extends FillBlanksBody {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) version!: number;
}

class WrittenResponse extends WrittenResponseBody {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ minimum: 1, type: 'integer' }) version!: number;
}

const taskResponse = {
  oneOf: [
    { $ref: getSchemaPath(TaskResponse) },
    { $ref: getSchemaPath(FillBlanksResponse) },
    { $ref: getSchemaPath(WrittenResponse) },
  ],
};

const invalid = apiError(
  400,
  'Invalid task content or identifier.',
  {
    code: 'invalid_task',
    message: 'Check the task fields and its answer configuration.',
  },
  { error: 'Bad Request', message: 'Validation failed (uuid is expected)' }
);

const missing = apiError(404, 'The task is unavailable to this tutor.', {
  code: 'not_found',
  message: 'Task not found.',
});

@ApiTags('Tasks')
@ApiExtraModels(
  TaskBody,
  FillBlanksBody,
  EditTaskBody,
  EditFillBlanksBody,
  TaskResponse,
  FillBlanksResponse,
  WrittenResponseBody,
  EditWrittenResponseBody,
  WrittenResponse
)
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
    summary: 'List the current versions of your tasks without answer keys.',
  })
  @ApiResponse({ status: 200, type: TaskSummaryResponse, isArray: true })
  list(@Req() request: AuthenticatedRequest) {
    return this.tasks.list(request.user);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Open the current version of your task for editing.' })
  @ApiResponse({ status: 200, schema: taskResponse })
  @invalid
  @missing
  find(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.find(request.user, id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Save a complete task as an assignable version.' })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(TaskBody) },
        { $ref: getSchemaPath(FillBlanksBody) },
        { $ref: getSchemaPath(WrittenResponseBody) },
      ],
    },
  })
  @ApiResponse({ status: 201, schema: taskResponse })
  @invalid
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.tasks.create(request.user, body);
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Save a new version and preserve previous task versions.' })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(EditTaskBody) },
        { $ref: getSchemaPath(EditFillBlanksBody) },
        { $ref: getSchemaPath(EditWrittenResponseBody) },
      ],
    },
  })
  @ApiResponse({ status: 200, schema: taskResponse })
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
