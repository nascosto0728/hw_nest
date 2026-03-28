import { query } from '../db';
import { Board, BoardNested } from '../types';
import { PoolClient } from 'pg';

export async function createBoard(
  projectId: number,
  name: string,
  client?: PoolClient
): Promise<Board> {
  const q = client ? client.query.bind(client) : query;
  const result = await q(
    'INSERT INTO boards (project_id, name) VALUES ($1, $2) RETURNING id, project_id, name, created_at',
    [projectId, name]
  );
  return result.rows[0];
}

export async function getBoardById(id: number): Promise<Board | null> {
  const result = await query<Board>(
    'SELECT id, project_id, name, created_at FROM boards WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getBoardNested(boardId: number): Promise<BoardNested | null> {
  // Fetch board
  const boardResult = await query<{ id: number; name: string }>(
    'SELECT id, name FROM boards WHERE id = $1',
    [boardId]
  );
  if (!boardResult.rows[0]) return null;

  const board = boardResult.rows[0];

  // Fetch columns with their tasks using a single join
  const result = await query<{
    col_id: number;
    col_name: string;
    position: number;
    task_id: number | null;
    task_title: string | null;
    task_description: string | null;
    task_order: number | null;
  }>(
    `SELECT
       c.id AS col_id,
       c.name AS col_name,
       c.position,
       t.id AS task_id,
       t.title AS task_title,
       t.description AS task_description,
       t."order" AS task_order
     FROM columns c
     LEFT JOIN tasks t ON t.column_id = c.id
     WHERE c.board_id = $1
     ORDER BY c.position ASC, t."order" ASC`,
    [boardId]
  );

  // Build nested structure
  const columnMap = new Map<
    number,
    { id: number; name: string; position: number; tasks: any[] }
  >();

  for (const row of result.rows) {
    if (!columnMap.has(row.col_id)) {
      columnMap.set(row.col_id, {
        id: row.col_id,
        name: row.col_name,
        position: row.position,
        tasks: [],
      });
    }
    if (row.task_id !== null) {
      columnMap.get(row.col_id)!.tasks.push({
        id: row.task_id,
        title: row.task_title,
        description: row.task_description,
        order: row.task_order,
      });
    }
  }

  return {
    id: board.id,
    name: board.name,
    columns: Array.from(columnMap.values()),
  };
}

export async function getBoardsByProjectId(projectId: number): Promise<Board[]> {
  const result = await query<Board>(
    'SELECT id, project_id, name, created_at FROM boards WHERE project_id = $1',
    [projectId]
  );
  return result.rows;
}
