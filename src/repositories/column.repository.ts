import { query } from '../db';
import { Column } from '../types';
import { PoolClient } from 'pg';

export interface ColumnOwnerInfo {
  id: number;
  boardId: number;
  ownerId: number;
}

export async function createColumn(
  boardId: number,
  name: string,
  position: number,
  client?: PoolClient
): Promise<Column> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    `INSERT INTO columns (board_id, name, position)
     VALUES ($1, $2, $3)
     RETURNING id, board_id, name, position, created_at`,
    [boardId, name, position]
  );
  return result.rows[0];
}

export async function getColumnById(id: number, client?: PoolClient): Promise<Column | null> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    'SELECT id, board_id, name, position, created_at FROM columns WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * 在 transaction 內取得 column 的 boardId 與 project ownerId，並對 column row 上寫鎖。
 * 用於 moveTask / deleteTask 在 transaction 內部完成授權驗證，避免 race condition。
 */
export async function getColumnWithBoardOwner(
  columnId: number,
  client: PoolClient
): Promise<ColumnOwnerInfo | null> {
  const result = await client.query(
    `SELECT c.id, c.board_id AS "boardId", p.owner_id AS "ownerId"
     FROM columns c
     JOIN boards b ON b.id = c.board_id
     JOIN projects p ON p.id = b.project_id
     WHERE c.id = $1
     FOR UPDATE OF c`,
    [columnId]
  );
  return result.rows[0] || null;
}

/**
 * 取得目前 board 內最大 position。
 * 注意：不使用 FOR UPDATE + aggregate（PostgreSQL 不支援）。
 * 並發衝突由 UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED 在 commit 時攔截。
 */
export async function getMaxPositionInBoard(boardId: number, client?: PoolClient): Promise<number> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    'SELECT COALESCE(MAX(position), 0) AS max_pos FROM columns WHERE board_id = $1',
    [boardId]
  );
  return parseInt(result.rows[0].max_pos, 10);
}

export async function updateColumnName(id: number, name: string): Promise<Column | null> {
  const result = await query<Column>(
    `UPDATE columns SET name = $1 WHERE id = $2
     RETURNING id, board_id, name, position, created_at`,
    [name, id]
  );
  return result.rows[0] || null;
}

export async function deleteColumn(id: number, client?: PoolClient): Promise<void> {
  const q = client ? client.query.bind(client) : query;
  await q('DELETE FROM columns WHERE id = $1', [id]);
}

export async function reorderColumnsAfterDelete(
  boardId: number,
  deletedPosition: number,
  client?: PoolClient
): Promise<void> {
  const q = client ? client.query.bind(client) : query;
  await q(
    `UPDATE columns SET position = position - 1
     WHERE board_id = $1 AND position > $2`,
    [boardId, deletedPosition]
  );
}

export async function hasTasksInColumn(columnId: number): Promise<boolean> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM tasks WHERE column_id = $1',
    [columnId]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

export async function getColumnsByBoardId(boardId: number): Promise<Column[]> {
  const result = await query<Column>(
    'SELECT id, board_id, name, position, created_at FROM columns WHERE board_id = $1 ORDER BY position ASC',
    [boardId]
  );
  return result.rows;
}
