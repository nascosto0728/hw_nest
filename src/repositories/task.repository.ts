import { query } from '../db';
import { Task } from '../types';
import { PoolClient } from 'pg';

export async function createTask(
  columnId: number,
  title: string,
  description: string,
  order: number
): Promise<Task> {
  const result = await query<Task>(
    `INSERT INTO tasks (column_id, title, description, "order")
     VALUES ($1, $2, $3, $4)
     RETURNING id, column_id, title, description, "order", created_at, updated_at`,
    [columnId, title, description, order]
  );
  return result.rows[0];
}

export async function getTaskById(id: number, client?: PoolClient): Promise<Task | null> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    `SELECT id, column_id, title, description, "order", created_at, updated_at
     FROM tasks WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getTaskByIdForUpdate(id: number, client: PoolClient): Promise<Task | null> {
  const result = await client.query(
    `SELECT id, column_id, title, description, "order", created_at, updated_at
     FROM tasks WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getMaxOrderInColumn(columnId: number, client?: PoolClient): Promise<number> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    `SELECT COALESCE(MAX("order"), 0) AS max_order FROM tasks WHERE column_id = $1`,
    [columnId]
  );
  return parseInt(result.rows[0].max_order, 10);
}

export async function getTaskCountInColumn(columnId: number, client?: PoolClient): Promise<number> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    'SELECT COUNT(*) AS count FROM tasks WHERE column_id = $1',
    [columnId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function updateTask(
  id: number,
  title: string,
  description: string
): Promise<Task | null> {
  const result = await query<Task>(
    `UPDATE tasks SET title = $1, description = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, column_id, title, description, "order", created_at, updated_at`,
    [title, description, id]
  );
  return result.rows[0] || null;
}

export async function deleteTask(id: number, client?: PoolClient): Promise<void> {
  const q = client ? client.query.bind(client) : query;
  await q('DELETE FROM tasks WHERE id = $1', [id]);
}

export async function reorderTasksAfterDelete(
  columnId: number,
  deletedOrder: number,
  client?: PoolClient
): Promise<void> {
  const q = client ? client.query.bind(client) : query;
  await q(
    `UPDATE tasks SET "order" = "order" - 1, updated_at = NOW()
     WHERE column_id = $1 AND "order" > $2`,
    [columnId, deletedOrder]
  );
}

export async function getTasksByBoardId(boardId: number): Promise<Task[]> {
  const result = await query<Task>(
    `SELECT t.id, t.column_id, t.title, t.description, t."order", t.created_at, t.updated_at
     FROM tasks t
     JOIN columns c ON c.id = t.column_id
     WHERE c.board_id = $1
     ORDER BY t.column_id ASC, t."order" ASC`,
    [boardId]
  );
  return result.rows;
}

// Move task: same column
export async function shiftTasksInColumnDown(
  columnId: number,
  fromOrder: number,
  toOrder: number,
  client: PoolClient
): Promise<void> {
  // newOrder > oldOrder: tasks in (oldOrder, newOrder] move down (-1)
  await client.query(
    `UPDATE tasks SET "order" = "order" - 1, updated_at = NOW()
     WHERE column_id = $1 AND "order" > $2 AND "order" <= $3`,
    [columnId, fromOrder, toOrder]
  );
}

export async function shiftTasksInColumnUp(
  columnId: number,
  fromOrder: number,
  toOrder: number,
  client: PoolClient
): Promise<void> {
  // newOrder < oldOrder: tasks in [newOrder, oldOrder) move up (+1)
  await client.query(
    `UPDATE tasks SET "order" = "order" + 1, updated_at = NOW()
     WHERE column_id = $1 AND "order" >= $2 AND "order" < $3`,
    [columnId, fromOrder, toOrder]
  );
}

// Move task: cross column
export async function shiftTasksInSourceColumnAfterRemove(
  columnId: number,
  removedOrder: number,
  client: PoolClient
): Promise<void> {
  // Original column: tasks with order > oldOrder shift down (-1)
  await client.query(
    `UPDATE tasks SET "order" = "order" - 1, updated_at = NOW()
     WHERE column_id = $1 AND "order" > $2`,
    [columnId, removedOrder]
  );
}

export async function shiftTasksInTargetColumnBeforeInsert(
  columnId: number,
  insertOrder: number,
  client: PoolClient
): Promise<void> {
  // Target column: tasks with order >= newOrder shift up (+1)
  await client.query(
    `UPDATE tasks SET "order" = "order" + 1, updated_at = NOW()
     WHERE column_id = $1 AND "order" >= $2`,
    [columnId, insertOrder]
  );
}

export async function moveTaskToColumn(
  taskId: number,
  toColumnId: number,
  newOrder: number,
  client: PoolClient
): Promise<Task | null> {
  const result = await client.query(
    `UPDATE tasks SET column_id = $1, "order" = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, column_id, title, description, "order", created_at, updated_at`,
    [toColumnId, newOrder, taskId]
  );
  return result.rows[0] || null;
}
