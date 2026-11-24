import { createHash, randomBytes } from 'node:crypto';
import type { InvitationTokens } from '../application/connections.js';

export class CryptoInvitationTokens implements InvitationTokens {
  generate() {
    return randomBytes(32).toString('hex');
  }
  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
