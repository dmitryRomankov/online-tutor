import * as argon2 from 'argon2';
import type { PasswordHasher } from '../application/authentication.js';

export class ArgonPasswords implements PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(password: string, hash?: string): Promise<boolean> {
    const candidate =
      hash ?? (await (this.dummyHash ??= this.hash('authentication timing placeholder')));
    try {
      return await argon2.verify(candidate, password);
    } catch {
      return false;
    }
  }
}
