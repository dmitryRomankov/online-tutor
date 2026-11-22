export type ProfileRole = 'TUTOR' | 'STUDENT';

export interface UserIdentity {
  id: string;
  email: string;
  name: string;
  lastname: string;
  role: ProfileRole;
}

export interface SessionIdentity extends UserIdentity {
  authEpoch: number;
}

export interface Registration extends Omit<UserIdentity, 'id'> {
  password: string;
}

export interface NewUser extends Omit<UserIdentity, 'id'> {
  passwordHash: string;
}

export interface Account extends SessionIdentity {
  retired: boolean;
  passwordHash?: string;
}

export interface AccountRepository {
  create(input: NewUser): Promise<Account>;
  findByEmail(email: string): Promise<Account | undefined>;
  findById(id: string): Promise<Account | undefined>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash?: string): Promise<boolean>;
}

export class AuthError extends Error {
  constructor(
    readonly reason: 'invalid_input' | 'invalid_credentials' | 'duplicate_email' | 'unavailable'
  ) {
    super(reason);
  }
}

export class Authentication {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly passwords: PasswordHasher
  ) {}

  async register(input: Registration): Promise<SessionIdentity> {
    const { password, role } = input;
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const lastname = input.lastname.trim();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
      email.length > 254 ||
      email.endsWith('@retired.invalid') ||
      !validName(name) ||
      !validName(lastname) ||
      [...password].length < 5 ||
      !['TUTOR', 'STUDENT'].includes(role)
    ) {
      throw new AuthError('invalid_input');
    }
    const account = await this.accounts.create({
      email,
      name,
      lastname,
      role,
      passwordHash: await this.passwords.hash(password),
    });
    return this.sessionIdentity(account);
  }

  async login(email: string, password: string): Promise<SessionIdentity> {
    const account = await this.accounts.findByEmail(email.trim().toLowerCase());
    const matches = await this.passwords.verify(password, account?.passwordHash);
    if (!account || account.retired || !matches) throw new AuthError('invalid_credentials');
    return this.sessionIdentity(account);
  }

  async authenticate(subject: { userId: string; authEpoch: number }): Promise<UserIdentity> {
    const account = await this.accounts.findById(subject.userId);
    if (!account || account.retired || account.authEpoch !== subject.authEpoch) {
      throw new AuthError('invalid_credentials');
    }
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      lastname: account.lastname,
      role: account.role,
    };
  }

  private sessionIdentity(account: Account): SessionIdentity {
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      lastname: account.lastname,
      role: account.role,
      authEpoch: account.authEpoch,
    };
  }
}

function validName(value: string): boolean {
  return (
    [...value].length >= 1 &&
    [...value].length <= 100 &&
    /[\p{L}]/u.test(value) &&
    /^[\p{L}\p{M} '’\p{Pd}]+$/u.test(value)
  );
}
