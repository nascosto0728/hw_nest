import { getClient } from '../db';
import * as projectRepo from '../repositories/project.repository';
import * as boardRepo from '../repositories/board.repository';
import { createError } from '../middleware/error.middleware';
import { Project } from '../types';

export async function createProject(
  ownerId: number,
  name: string
): Promise<{ id: number; name: string; boardId: number }> {
  if (!name || name.trim() === '') {
    throw createError('Project name is required', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const project = await projectRepo.createProject(ownerId, name.trim(), client);
    const board = await boardRepo.createBoard(project.id, 'Default Board', client);

    await client.query('COMMIT');

    return { id: project.id, name: project.name, boardId: board.id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getProjectsByOwner(ownerId: number): Promise<Project[]> {
  return projectRepo.getProjectsByOwner(ownerId);
}

export async function getProjectById(id: number): Promise<Project | null> {
  return projectRepo.getProjectById(id);
}
