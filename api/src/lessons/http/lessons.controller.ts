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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ApiPropertyOptions } from '@nestjs/swagger';
import { Readable } from 'node:stream';
import type { AuthenticatedRequest } from '../../auth/http/auth.guard.js';
import { apiError, invalidSession, rejectedOrigin } from '../../docs/error-response.js';
import { LessonImages, maxImageBytes } from '../application/lesson-images.js';
import { Lessons } from '../application/lessons.js';

const blockSchema: ApiPropertyOptions = {
  type: 'array',
  minItems: 1,
  maxItems: 50,
  items: {
    oneOf: [
      {
        type: 'object',
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string', enum: ['text'] },
          text: { type: 'string', maxLength: 5000 },
        },
      },
      {
        type: 'object',
        required: ['kind', 'url'],
        properties: {
          kind: { type: 'string', enum: ['link'] },
          url: { type: 'string', format: 'uri', pattern: '^https://' },
        },
      },
      {
        type: 'object',
        required: ['kind', 'assetId'],
        properties: {
          kind: { type: 'string', enum: ['image'] },
          assetId: { type: 'string', format: 'uuid' },
        },
      },
      {
        type: 'object',
        required: ['kind', 'taskVersionId'],
        properties: {
          kind: { type: 'string', enum: ['task'] },
          taskVersionId: { type: 'string', format: 'uuid' },
          retainedItemId: {
            type: 'string',
            format: 'uuid',
            description:
              'Task block ID from the current lesson version. Omit for a new attachment.',
          },
        },
      },
    ],
  },
};

class LessonBody {
  @ApiProperty({ maxLength: 200 }) title!: string;
  @ApiProperty(blockSchema) items!: unknown[];
}

class EditLessonBody extends LessonBody {
  @ApiProperty({ type: 'integer', minimum: 1 }) expectedVersion!: number;
}

class LessonSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) version!: number;
  @ApiProperty() title!: string;
}

class LessonResponse extends LessonSummaryResponse {
  @ApiProperty(blockSchema) items!: unknown[];
}

class LatestTaskResponse {
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) version!: number;
  @ApiProperty() title!: string;
}

class TaskPreviewResponse {
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) version!: number;
  @ApiProperty() type!: string;
  @ApiProperty() prompt!: string;
  @ApiProperty({ type: 'string', nullable: true }) passage!: string | null;
  @ApiProperty({ type: [String] }) choices!: string[];
  @ApiProperty({ type: LatestTaskResponse, nullable: true }) latest!: LatestTaskResponse | null;
}

class ImageResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

const notFound = apiError(404, 'Resource unavailable.', {
  code: 'not_found',
  message: 'Lesson content not found.',
});
const invalid = apiError(400, 'Invalid lesson or inaccessible block.', {
  code: 'invalid_lesson',
  message: 'Check the title, blocks, and access to attached content.',
});

@ApiTags('Lessons')
@ApiCookieAuth()
@apiError(401, 'Sign in required.', invalidSession)
@apiError(
  403,
  'Tutor profile and allowed origin required.',
  { code: 'forbidden', message: 'Only tutors can manage lessons.' },
  rejectedOrigin
)
@apiError(503, 'Lesson storage unavailable.', {
  code: 'unavailable',
  message: 'Lesson storage is temporarily unavailable.',
})
@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly lessons: Lessons,
    private readonly images: LessonImages
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiResponse({ status: 200, type: [LessonSummaryResponse] })
  list(@Req() request: AuthenticatedRequest) {
    return this.lessons.list(request.user);
  }

  @Get('tasks/:versionId')
  @Header('Cache-Control', 'no-store')
  @ApiResponse({
    status: 200,
    type: TaskPreviewResponse,
    description: 'Published task preview without answer keys.',
  })
  @notFound
  taskPreview(@Req() request: AuthenticatedRequest, @Param('versionId', ParseUUIDPipe) id: string) {
    return this.lessons.taskPreview(request.user, id);
  }

  @Post('images')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxImageBytes + 1, files: 1, fields: 0 } })
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, type: ImageResponse })
  @apiError(400, 'Invalid image.', {
    code: 'invalid_image',
    message: 'Upload a valid PNG, JPEG or WebP image up to 2 MB.',
  })
  @ApiResponse({ status: 413, description: 'Image exceeds the 2 MB limit.' })
  upload(@Req() request: AuthenticatedRequest, @UploadedFile() file?: { buffer: Buffer }) {
    return this.images.upload(request.user, file?.buffer);
  }

  @Get('images/:id')
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({
    status: 200,
    content: Object.fromEntries(
      ['image/png', 'image/jpeg', 'image/webp'].map((type) => [
        type,
        { schema: { type: 'string', format: 'binary' } },
      ])
    ),
  })
  @notFound
  async image(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const { mediaType, stream } = await this.images.read(request.user, id);
    return new StreamableFile(Readable.from(stream), { type: mediaType });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiResponse({ status: 200, type: LessonResponse })
  @notFound
  find(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.find(request.user, id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: LessonBody })
  @ApiResponse({ status: 201, type: LessonResponse })
  @apiError(409, 'Selected task version changed.', {
    code: 'task_version_conflict',
    message: 'An attached task changed. Review the latest version.',
  })
  @invalid
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.lessons.create(request.user, body);
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @ApiBody({ type: EditLessonBody })
  @ApiResponse({ status: 200, type: LessonResponse })
  @apiError(
    409,
    'Lesson version changed.',
    {
      code: 'version_conflict',
      message: 'A newer version of this lesson was saved.',
    },
    {
      code: 'task_version_conflict',
      message: 'An attached task changed. Review the latest version.',
    }
  )
  @invalid
  @notFound
  edit(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown
  ) {
    return this.lessons.edit(request.user, id, body);
  }
}
