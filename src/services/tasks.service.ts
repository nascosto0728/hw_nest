import { getClient } from '../db';
import * as taskRepo from '../repositories/task.repository';
import * as columnRepo from '../repositories/column.repository';
import * as boardRepo from '../repositories/board.repository';
import * as projectRepo from '../repositories/project.repository';
import { createError } from '../middleware/error.middleware';
import { Task } from '../types';

// ─── Ownership helpers ────────────────────────────────────────────────────────

async function verifyColumnOwnership(columnId: number, userId: number): Promise<void> {
  const column = await columnRepo.getColumnById(columnId);
  if (!column) throw createError('Column not found', 404);

  const board = await boardRepo.getBoardById(column.board_id);
  if (!board) throw createError('Board not found', 404);

  const project = await projectRepo.getProjectById(board.project_id);
  if (!project || project.owner_id !== userId) {
    throw createError('Forbidden', 403);
  }
}

async function verifyTaskOwnership(taskId: number, userId: number): Promise<Task> {
  const task = await taskRepo.getTaskById(taskId);
  if (!task) throw createError('Task not found', 404);

  await verifyColumnOwnership(task.column_id, userId);
  return task;
}

// ─── Service Methods ──────────────────────────────────────────────────────────

export async function createTask(
  columnId: number,
  title: string,
  description: string = '',
  userId: number
): Promise<Task> {
  if (!title || title.trim() === '') {
    throw createError('Task title is required', 400);
  }

  await verifyColumnOwnership(columnId, userId);

  const maxOrder = await taskRepo.getMaxOrderInColumn(columnId);
  return taskRepo.createTask(columnId, title.trim(), description, maxOrder + 1);
}

export async function getTasksByBoard(boardId: number, userId: number): Promise<Task[]> {
  const board = await boardRepo.getBoardById(boardId);
  if (!board) throw createError('Board not found', 404);

  const project = await projectRepo.getProjectById(board.project_id);
  if (!project || project.owner_id !== userId) {
    throw createError('Forbidden', 403);
  }

  return taskRepo.getTasksByBoardId(boardId);
}

export async function updateTask(
  taskId: number,
  title: string,
  description: string,
  userId: number
): Promise<Task> {
  if (!title || title.trim() === '') {
    throw createError('Task title is required', 400);
  }

  await verifyTaskOwnership(taskId, userId);

  const updated = await taskRepo.updateTask(taskId, title.trim(), description);
  if (!updated) throw createError('Task not found', 404);
  return updated;
}

export async function deleteTask(taskId: number, userId: number): Promise<void> {
  const task = await verifyTaskOwnership(taskId, userId);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await taskRepo.deleteTask(taskId, client);
    await taskRepo.reorderTasksAfterDelete(Number(task.column_id), Number(task.order), client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function moveTask(
  taskId: number,
  toColumnId: number,
  newOrder: number,
  userId: number
): Promise<{ id: number; columnId: number; order: number }> {
  // Verify task exists and user owns it
  await verifyTaskOwnership(taskId, userId);
  // Verify target column belongs to same user
  await verifyColumnOwnership(toColumnId, userId);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock the task row
    const task = await taskRepo.getTaskByIdForUpdate(taskId, client);
    if (!task) throw createError('Task not found', 404);

    const oldOrder = Number(task.order);
    const oldColumnId = Number(task.column_id);
    const isSameColumn = oldColumnId === toColumnId;

    if (isSameColumn) {
      // Clamp newOrder to 1..task_count
      const taskCount = await taskRepo.getTaskCountInColumn(oldColumnId, client);
      const clampedOrder = Math.max(1, Math.min(newOrder, taskCount));

      if (clampedOrder === oldOrder) {
        // No change needed
        await client.query('COMMIT');
        return { id: task.id, columnId: oldColumnId, order: oldOrder };
      }

      if (clampedOrder > oldOrder) {
        // Shift tasks in (oldOrder, clampedOrder] down by 1
        await taskRepo.shiftTasksInColumnDown(oldColumnId, oldOrder, clampedOrder, client);
      } else {
        // Shift tasks in [clampedOrder, oldOrder) up by 1
        await taskRepo.shiftTasksInColumnUp(oldColumnId, clampedOrder, oldOrder, client);
      }

      const updated = await taskRepo.moveTaskToColumn(taskId, oldColumnId, clampedOrder, client);
      await client.query('COMMIT');

      return { id: updated!.id, columnId: updated!.column_id, order: updated!.order };
    } else {
      // Cross-column move
      const targetCount = await taskRepo.getTaskCountInColumn(toColumnId, client);
      const clampedOrder = Math.max(1, Math.min(newOrder, targetCount + 1));

      // Shift source column: tasks with order > oldOrder shift down
      await taskRepo.shiftTasksInSourceColumnAfterRemove(oldColumnId, oldOrder, client);

      // Shift target column: tasks with order >= clampedOrder shift up
      await taskRepo.shiftTasksInTargetColumnBeforeInsert(toColumnId, clampedOrder, client);

      // Move the task itself
      const updated = await taskRepo.moveTaskToColumn(taskId, toColumnId, clampedOrder, client);
      await client.query('COMMIT');

      return { id: updated!.id, columnId: updated!.column_id, order: updated!.order };
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
