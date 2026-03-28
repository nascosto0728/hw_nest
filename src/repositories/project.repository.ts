import { query } from '../db';
import { Project } from '../types';
import { PoolClient } from 'pg';

export async function createProject(
  ownerId: number,
  name: string,
  client?: PoolClient
): Promise<Project> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    'INSERT INTO projects (owner_id, name) VALUES ($1, $2) RETURNING id, owner_id, name, created_at',
    [ownerId, name]
  );
  return result.rows[0];
}

export async function getProjectsByOwner(ownerId: number): Promise<Project[]> {
  const result = await query<Project>(
    'SELECT id, owner_id, name, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC',
    [ownerId]
  );
  return result.rows;
}

export async function getProjectById(id: number): Promise<Project | null> {
  const result = await query<Project>(
    'SELECT id, owner_id, name, created_at FROM projects WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}
