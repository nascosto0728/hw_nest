import * as boardRepo from '../repositories/board.repository';
import * as projectRepo from '../repositories/project.repository';
import { createError } from '../middleware/error.middleware';
import { BoardNested } from '../types';

export async function getBoardNested(
  boardId: number,
  userId: number
): Promise<BoardNested> {
  const board = await boardRepo.getBoardById(boardId);
  if (!board) {
    throw createError('Board not found', 404);
  }

  // Verify ownership through project
  const project = await projectRepo.getProjectById(board.project_id);
  if (!project || project.owner_id !== userId) {
    throw createError('Forbidden', 403);
  }

  const nested = await boardRepo.getBoardNested(boardId);
  if (!nested) {
    throw createError('Board not found', 404);
  }

  return nested;
}
