import { randomUUID } from 'node:crypto';
import { AuthError } from '../../src/auth/application/authentication.js';
import type {
  Account,
  AccountRepository,
  ProfileRole,
} from '../../src/auth/application/authentication.js';

export class MemoryAccounts implements AccountRepository {
  readonly accounts = new Map<string, Account>();

  create(input: {
    email: string;
    name: string;
    lastname: string;
    role: ProfileRole;
    passwordHash: string;
  }): Promise<Account> {
    if (
      [...this.accounts.values()].some(
        (account) => account.email.toLowerCase() === input.email.toLowerCase()
      )
    ) {
      return Promise.reject(new AuthError('duplicate_email'));
    }
    const account: Account = { ...input, id: randomUUID(), authEpoch: 0, retired: false };
    this.accounts.set(account.id, account);
    return Promise.resolve(account);
  }

  findByEmail(email: string): Promise<Account | undefined> {
    return Promise.resolve(
      [...this.accounts.values()].find(
        (account) => account.email.toLowerCase() === email.toLowerCase()
      )
    );
  }

  findById(id: string): Promise<Account | undefined> {
    return Promise.resolve(this.accounts.get(id));
  }
}
