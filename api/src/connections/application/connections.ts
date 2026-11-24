import type { UserIdentity } from '../../auth/application/authentication.js';

export interface Person {
  id: string;
  name: string;
  lastname: string;
}

export interface Connection {
  id: string;
  person: Person;
  linkedAt: string;
}

export interface Invitation {
  id: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

export interface InvitationPreview {
  tutor: Person;
  expiresAt: string;
  accepted: boolean;
}

export interface ConnectionRepository {
  create(tutorId: string, tokenHash: string): Promise<Invitation>;
  invitations(tutorId: string): Promise<Invitation[]>;
  revoke(tutorId: string, invitationId: string): Promise<void>;
  preview(studentId: string, tokenHash: string): Promise<InvitationPreview>;
  accept(studentId: string, tokenHash: string): Promise<Connection>;
  connections(actor: UserIdentity): Promise<Connection[]>;
}

export interface InvitationTokens {
  generate(): string;
  hash(token: string): string;
}

export class ConnectionError extends Error {
  constructor(
    readonly code: 'forbidden' | 'invitation_unavailable' | 'already_connected' | 'unavailable'
  ) {
    super(code);
  }
}

export class Connections {
  constructor(
    private readonly repository: ConnectionRepository,
    private readonly tokens: InvitationTokens
  ) {}

  async create(actor: UserIdentity) {
    this.requireRole(actor, 'TUTOR');
    const token = this.tokens.generate();
    const invitation = await this.repository.create(actor.id, this.tokens.hash(token));
    return { ...invitation, token };
  }

  invitations(actor: UserIdentity) {
    this.requireRole(actor, 'TUTOR');
    return this.repository.invitations(actor.id);
  }

  revoke(actor: UserIdentity, invitationId: string) {
    this.requireRole(actor, 'TUTOR');
    return this.repository.revoke(actor.id, invitationId);
  }

  preview(actor: UserIdentity, token: string) {
    this.requireRole(actor, 'STUDENT');
    return this.repository.preview(actor.id, this.tokenHash(token));
  }
  accept(actor: UserIdentity, token: string) {
    this.requireRole(actor, 'STUDENT');
    return this.repository.accept(actor.id, this.tokenHash(token));
  }
  list(actor: UserIdentity) {
    return this.repository.connections(actor);
  }

  private requireRole(actor: UserIdentity, role: UserIdentity['role']) {
    if (actor.role !== role) throw new ConnectionError('forbidden');
  }
  private tokenHash(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ConnectionError('invitation_unavailable');
    return this.tokens.hash(token);
  }
}
