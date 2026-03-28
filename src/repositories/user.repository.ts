import { query } from '../db';
import { User } from '../types';

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

export async function findUserById(id: number): Promise<User | null> {
  const result = await query<User>(
    'SELECT id, email, password_hash, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createUser(
  email: string,
  passwordHash: string
): Promise<{ id: number; email: string }> {
  const result = await query<{ id: number; email: string }>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, passwordHash]
  );
  return result.rows[0];
}
