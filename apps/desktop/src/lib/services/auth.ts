import {
  auditLogs,
  newId,
  users,
} from '@repo/database';
import {
  assertPermission,
  type Role,
} from '@repo/shared';
import { type LoginInput, type UserInput } from '@repo/validation';
import { and, eq, isNull } from 'drizzle-orm';
import { getDatabaseClient } from '../bridge';
import { ipc } from '../ipc';

export interface UserSession {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
}

let activeSession: UserSession | null = null;

export class AuthError extends Error {
  override name = 'AuthError';
}

/**
 * Maps database string roles to application typed roles.
 */
function dbRoleToAppRole(roleStr: string): Role {
  if (roleStr === 'ADMIN') return 'OWNER';
  if (roleStr === 'OPERATOR') return 'SALES';
  if (roleStr === 'OWNER' || roleStr === 'ACCOUNTANT' || roleStr === 'SALES' || roleStr === 'VIEWER') {
    return roleStr as Role;
  }
  return 'VIEWER';
}

function appRoleToDbRole(role: Role): 'ADMIN' | 'ACCOUNTANT' | 'OPERATOR' | 'VIEWER' {
  if (role === 'OWNER') return 'ADMIN';
  if (role === 'SALES') return 'OPERATOR';
  return role as 'ACCOUNTANT' | 'VIEWER';
}

export async function loginUser(input: LoginInput): Promise<UserSession> {
  const client = getDatabaseClient();

  const [userRow] = await client.db
    .select()
    .from(users)
    .where(and(eq(users.username, input.username.trim()), isNull(users.deletedAt)));

  if (!userRow || !userRow.isActive) {
    throw new AuthError('Invalid username or password.');
  }

  // Verify Argon2id password hash via Rust IPC
  const matches = await ipc.verifyPassword(input.password, userRow.passwordHash);
  if (!matches) {
    throw new AuthError('Invalid username or password.');
  }

  const role = dbRoleToAppRole(userRow.role);
  const session: UserSession = {
    id: userRow.id,
    username: userRow.username,
    displayName: userRow.displayName,
    role,
  };

  activeSession = session;

  // Record audit log for login
  await client.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      userId: userRow.id,
      action: 'LOGIN',
      entity: 'users',
      entityId: userRow.id,
      afterJson: JSON.stringify({ username: userRow.username, at: Date.now() }),
      createdBy: userRow.id,
    });
    await tx
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userRow.id));
  });

  return session;
}

export async function createLocalUser(
  actor: UserSession,
  input: UserInput,
): Promise<UserSession> {
  assertPermission(actor.role, 'USERS_MANAGE');

  const client = getDatabaseClient();
  const passwordHash = await ipc.hashPassword(input.password);
  const id = newId();
  const dbRole = appRoleToDbRole(input.role);

  await client.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      username: input.username.trim(),
      displayName: input.displayName.trim(),
      passwordHash,
      role: dbRole,
      isActive: true,
      createdBy: actor.id,
    });

    await tx.insert(auditLogs).values({
      userId: actor.id,
      action: 'CREATE',
      entity: 'users',
      entityId: id,
      afterJson: JSON.stringify({
        username: input.username,
        displayName: input.displayName,
        role: input.role,
      }),
      createdBy: actor.id,
    });
  });

  return {
    id,
    username: input.username,
    displayName: input.displayName,
    role: input.role,
  };
}

export function getCurrentUser(): UserSession | null {
  return activeSession;
}

export function logoutUser(): void {
  activeSession = null;
}

/**
 * Seeds initial Owner user if users table is empty.
 */
export async function ensureDefaultOwnerUser(): Promise<UserSession> {
  const client = getDatabaseClient();
  const existing = await client.db.select({ count: users.id }).from(users);

  if (existing.length > 0) {
    const [first] = await client.db.select().from(users).limit(1);
    const session: UserSession = {
      id: first!.id,
      username: first!.username,
      displayName: first!.displayName,
      role: dbRoleToAppRole(first!.role),
    };
    activeSession = session;
    return session;
  }

  // Create default owner
  const defaultOwner: UserInput = {
    username: 'admin',
    displayName: 'Administrator',
    password: 'password123',
    role: 'OWNER',
  };

  const id = newId();
  const passwordHash = await ipc.hashPassword(defaultOwner.password);

  await client.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      username: defaultOwner.username,
      displayName: defaultOwner.displayName,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      createdBy: 'system',
    });
  });

  const session: UserSession = {
    id,
    username: defaultOwner.username,
    displayName: defaultOwner.displayName,
    role: 'OWNER',
  };
  activeSession = session;
  return session;
}
