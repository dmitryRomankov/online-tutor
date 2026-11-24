import { ApiProperty } from '@nestjs/swagger';
import type {
  Connection,
  Invitation,
  InvitationPreview,
  Person,
} from '../application/connections.js';

export const exampleToken = '0123456789abcdef'.repeat(4);

class PersonResponse implements Person {
  @ApiProperty({ format: 'uuid', example: '9bde4480-bcc5-4159-8c74-304e887bbd67' })
  id!: string;

  @ApiProperty({ example: 'Alex' })
  name!: string;

  @ApiProperty({ example: 'Rivera' })
  lastname!: string;
}

export class ConnectionResponse implements Connection {
  @ApiProperty({ format: 'uuid', example: '34655f8e-098a-4850-9d61-77d23e80b730' })
  id!: string;

  @ApiProperty({ type: PersonResponse, description: 'Student for tutors, tutor for students.' })
  person!: PersonResponse;

  @ApiProperty({ format: 'date-time', example: '2026-11-24T12:30:00.000Z' })
  linkedAt!: string;
}

export class InvitationResponse implements Invitation {
  @ApiProperty({ format: 'uuid', example: '155c82f8-cc58-4ad4-818b-3620fd2b6593' })
  id!: string;

  @ApiProperty({ format: 'date-time', example: '2026-12-01T12:00:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'], example: 'pending' })
  status!: Invitation['status'];
}

export class CreatedInvitationResponse extends InvitationResponse {
  @ApiProperty({
    pattern: '^[a-f0-9]{64}$',
    example: exampleToken,
    description: 'Shareable token returned only on creation.',
  })
  token!: string;
}

export class InvitationPreviewResponse implements InvitationPreview {
  @ApiProperty({ type: PersonResponse })
  tutor!: PersonResponse;

  @ApiProperty({ format: 'date-time', example: '2026-12-01T12:00:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ example: false, description: 'Whether the signed-in student already accepted.' })
  accepted!: boolean;
}
