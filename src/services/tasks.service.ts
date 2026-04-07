import { getClient } from '../db';
import * as taskRepo from '../repositories/task.repository';
import * as columnRepo from '../repositories/column.repository';
import * as boardRepo from '../repositories/board.repository';
import * as projectRepo from '../repositories/project.repository';
import { createError } from '../middleware/error.middleware';
import { Task, TaskGrouped } from '../types';

// ─── Ownership helpers (used by createTask, updateTask, getTasksByBoard) ──────

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

/**
 * Fix #8: 回傳 PRD §6.5 要求的分組格式 { columnId, tasks }[]，每組 tasks 按 order 升序排列。
 */
export async function getTasksByBoard(boardId: number, userId: number): Promise<TaskGrouped[]> {
  const board = await boardRepo.getBoardById(boardId);
  if (!board) throw createError('Board not found', 404);

  const project = await projectRepo.getProjectById(board.project_id);
  if (!project || project.owner_id !== userId) {
    throw createError('Forbidden', 403);
  }

  const flatTasks = await taskRepo.getTasksByBoardId(boardId);

  // Group by column_id, preserving column order (sorted by column_id for consistency)
  const map = new Map<number, Task[]>();
  for (const task of flatTasks) {
    const colId = Number(task.column_id);
    if (!map.has(colId)) map.set(colId, []);
    map.get(colId)!.push(task);
  }

  return Array.from(map.entries()).map(([columnId, tasks]) => ({
    columnId,
    tasks: tasks.sort((a, b) => Number(a.order) - Number(b.order)),
  }));
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

/**
 * deleteTask: 全部在 transaction 內完成，消除授權查詢與刪除之間的 race condition。
 * 鎖定順序：task row → source column row（Spec §6）
 */
export async function deleteTask(taskId: number, userId: number): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Lock task row（防止並發 delete/move 同一 task）
    const task = await taskRepo.getTaskByIdForUpdate(taskId, client);
    if (!task) throw createError('Task not found', 404);

    // 2. 在 transaction 內驗證擁有權（消除 auth 與 delete 之間的 race window）
    const colInfo = await columnRepo.getColumnWithBoardOwner(Number(task.column_id), client);
    if (!colInfo) throw createError('Column not found', 404);
    if (colInfo.ownerId !== userId) throw createError('Forbidden', 403);

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

/**
 * moveTask: 所有步驟（授權、board 比對、排序更新）全部在單一 transaction 內完成。
 * 鎖定順序：task → source column → target column（Spec §6，固定順序避免 deadlock）
 * newOrder < 1 由 controller 提前攔截（回 400），此處 clamp 為防禦性保護。
 *
 * 修復清單：
 * - Fix #1: 加入跨 board 驗證（sourceInfo.boardId !== targetInfo.boardId → 400）
 * - Fix #2: 所有授權查詢移入 transaction 內，消除 race condition 窗口
 */
export async function moveTask(
  taskId: number,
  toColumnId: number,
  newOrder: number,
  userId: number
): Promise<{ id: number; columnId: number; order: number }> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // ── Step 1: Lock task row（Spec §6 鎖定順序：task first）─────────────────
    const task = await taskRepo.getTaskByIdForUpdate(taskId, client);
    if (!task) throw createError('Task not found', 404);

    const fromColumnId = Number(task.column_id);
    const oldOrder = Number(task.order);

    // ── Step 2: 驗證 source column 擁有權（在 transaction 內，消除 race window）─
    const sourceInfo = await columnRepo.getColumnWithBoardOwner(fromColumnId, client);
    if (!sourceInfo) throw createError('Column not found', 404);
    if (sourceInfo.ownerId !== userId) throw createError('Forbidden', 403);

    // ── Step 3: 驗證 target column 擁有權（同時鎖定 target column row）─────────
    const targetInfo = await columnRepo.getColumnWithBoardOwner(toColumnId, client);
    if (!targetInfo) throw createError('Target column not found', 404);
    if (targetInfo.ownerId !== userId) throw createError('Forbidden', 403);

    // ── Step 4: 驗證 source 與 target 屬於同一個 board（Spec §4.5）────────────
    if (sourceInfo.boardId !== targetInfo.boardId) {
      throw createError('Cross-board move not allowed', 400);
    }

    const isSameColumn = fromColumnId === toColumnId;

    if (isSameColumn) {
      // ── 同欄位移動 ────────────────────────────────────────────────────────
      const taskCount = await taskRepo.getTaskCountInColumn(fromColumnId, client);
      const clampedOrder = Math.max(1, Math.min(newOrder, taskCount));

      if (clampedOrder === oldOrder) {
        await client.query('COMMIT');
        return { id: task.id, columnId: fromColumnId, order: oldOrder };
      }

      if (clampedOrder > oldOrder) {
        // 區間 (oldOrder, clampedOrder] 的 tasks order - 1
        await taskRepo.shiftTasksInColumnDown(fromColumnId, oldOrder, clampedOrder, client);
      } else {
        // 區間 [clampedOrder, oldOrder) 的 tasks order + 1
        await taskRepo.shiftTasksInColumnUp(fromColumnId, clampedOrder, oldOrder, client);
      }

      const updated = await taskRepo.moveTaskToColumn(taskId, fromColumnId, clampedOrder, client);
      await client.query('COMMIT');

      return { id: updated!.id, columnId: updated!.column_id, order: updated!.order };
    } else {
      // ── 跨欄位移動 ────────────────────────────────────────────────────────
      const targetCount = await taskRepo.getTaskCountInColumn(toColumnId, client);
      const clampedOrder = Math.max(1, Math.min(newOrder, targetCount + 1));

      // Source 欄位：order > oldOrder 的 tasks order - 1（補位）
      await taskRepo.shiftTasksInSourceColumnAfterRemove(fromColumnId, oldOrder, client);

      // Target 欄位：order >= clampedOrder 的 tasks order + 1（騰位）
      await taskRepo.shiftTasksInTargetColumnBeforeInsert(toColumnId, clampedOrder, client);

      // 更新 task 本身
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
