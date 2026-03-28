import { getClient } from '../db';
import * as columnRepo from '../repositories/column.repository';
import * as boardRepo from '../repositories/board.repository';
import * as projectRepo from '../repositories/project.repository';
import { createError } from '../middleware/error.middleware';
import { Column } from '../types';

async function verifyBoardOwnership(boardId: number, userId: number): Promise<void> {
  const board = await boardRepo.getBoardById(boardId);
  if (!board) throw createError('Board not found', 404);

  const project = await projectRepo.getProjectById(board.project_id);
  if (!project || project.owner_id !== userId) {
    throw createError('Forbidden', 403);
  }
}

async function verifyColumnOwnership(columnId: number, userId: number): Promise<Column> {
  const column = await columnRepo.getColumnById(columnId);
  if (!column) throw createError('Column not found', 404);

  await verifyBoardOwnership(column.board_id, userId);
  return column;
}

export async function createColumn(
  boardId: number,
  name: string,
  userId: number
): Promise<Column> {
  if (!name || name.trim() === '') {
    throw createError('Column name is required', 400);
  }

  await verifyBoardOwnership(boardId, userId);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const maxPosition = await columnRepo.getMaxPositionInBoard(boardId, client);
    const column = await columnRepo.createColumn(boardId, name.trim(), maxPosition + 1, client);

    await client.query('COMMIT');
    return column;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateColumn(
  columnId: number,
  name: string,
  userId: number
): Promise<Column> {
  if (!name || name.trim() === '') {
    throw createError('Column name is required', 400);
  }

  await verifyColumnOwnership(columnId, userId);

  const updated = await columnRepo.updateColumnName(columnId, name.trim());
  if (!updated) throw createError('Column not found', 404);
  return updated;
}

export async function deleteColumn(columnId: number, userId: number): Promise<void> {
  const column = await verifyColumnOwnership(columnId, userId);

  const hasTasks = await columnRepo.hasTasksInColumn(columnId);
  if (hasTasks) {
    throw createError('Cannot delete column with existing tasks', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await columnRepo.deleteColumn(columnId, client);
    await columnRepo.reorderColumnsAfterDelete(column.board_id, column.position, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
