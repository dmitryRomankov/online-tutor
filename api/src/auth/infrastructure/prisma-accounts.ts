import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { AuthError } from '../application/authentication.js';
import type { Account, AccountRepository, ProfileRole } from '../application/authentication.js';

interface AccountRow {
  id: string;
  email: string;
  name: string;
  lastname: string;
  role_code: string;
  auth_epoch: number;
  retired_at: Date | null;
  password_hash?: string | null;
}

export class PrismaAccounts implements AccountRepository {
  private database?: PrismaClient;

  constructor(private readonly connectionString?: string) {}

  private get client(): PrismaClient {
    if (!this.connectionString) throw new AuthError('unavailable');
    this.database ??= new PrismaClient({
      adapter: new PrismaPg({
        connectionString: this.connectionString,
        max: 5,
        connectionTimeoutMillis: 10000,
      }),
    });
    return this.database;
  }

  async create(input: {
    email: string;
    name: string;
    lastname: string;
    role: ProfileRole;
    passwordHash: string;
  }): Promise<Account> {
    try {
      const row = await this.client.users.create({
        data: {
          email: input.email,
          name: input.name,
          lastname: input.lastname,
          role_code: input.role,
          user_credentials: { create: { password_hash: input.passwordHash } },
        },
      });
      return this.identity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AuthError('duplicate_email');
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<Account | undefined> {
    // Exact lower() equality follows the unique index, including literal '%' and '_'.
    const [row] = await this.client.$queryRaw<AccountRow[]>`
      SELECT u.id, u.email, u.name, u.lastname, u.role_code, u.auth_epoch, u.retired_at, c.password_hash
      FROM public.users u LEFT JOIN private.user_credentials c ON c.user_id=u.id
      WHERE lower(u.email)=lower(${email})`;
    if (!row) return undefined;
    return { ...this.identity(row), passwordHash: row.password_hash ?? undefined };
  }

  async findById(id: string): Promise<Account | undefined> {
    const row = await this.client.users.findUnique({ where: { id } });
    return row ? this.identity(row) : undefined;
  }

  private identity(row: AccountRow): Account {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      lastname: row.lastname,
      role: row.role_code as ProfileRole,
      authEpoch: row.auth_epoch,
      retired: row.retired_at !== null,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.database?.$disconnect();
  }
}
