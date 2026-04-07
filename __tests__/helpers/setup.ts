/**
 * helpers/setup.ts
 * Utility functions for creating test users, projects, boards, columns, tasks.
 * All data creation is done via HTTP API (no direct DB connection).
 */

import supertest from 'supertest';

export const BASE = 'http://localhost:3000';
export const request = supertest;

let _userCounter = 0;

export function uniqueEmail(): string {
  _userCounter++;
  return `test_${Date.now()}_${_userCounter}_${Math.random().toString(36).slice(2)}@test.com`;
}

export interface AuthResult {
  token: string;
  email: string;
}

export async function registerAndLogin(email?: string, password = 'TestPass123!'): Promise<AuthResult> {
  const resolvedEmail = email ?? uniqueEmail();

  const regRes = await supertest(BASE)
    .post('/auth/register')
    .send({ email: resolvedEmail, password });

  if (regRes.status !== 201) {
    throw new Error(`Register failed: ${regRes.status} ${JSON.stringify(regRes.body)}`);
  }

  const loginRes = await supertest(BASE)
    .post('/auth/login')
    .send({ email: resolvedEmail, password });

  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  return { token: loginRes.body.token as string, email: resolvedEmail };
}

export interface ProjectResult {
  id: number;
  name: string;
  boardId: number;
}

export async function createProject(token: string, name = 'Test Project'): Promise<ProjectResult> {
  const res = await supertest(BASE)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });

  if (res.status !== 201) {
    throw new Error(`createProject failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as { id: number | string; name: string; boardId: number | string };
  return { id: Number(body.id), name: body.name, boardId: Number(body.boardId) };
}

export interface ColumnResult {
  id: number;
  board_id: number;
  name: string;
  position: number;
}

export async function createColumn(token: string, boardId: number, name = 'Test Column'): Promise<ColumnResult> {
  const res = await supertest(BASE)
    .post('/columns')
    .set('Authorization', `Bearer ${token}`)
    .send({ boardId, name });

  if (res.status !== 201) {
    throw new Error(`createColumn failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as { id: number | string; board_id: number | string; name: string; position: number };
  return { id: Number(body.id), board_id: Number(body.board_id), name: body.name, position: Number(body.position) };
}

export interface TaskResult {
  id: number;
  column_id: number;
  title: string;
  description: string;
  order: number;
}

export async function createTask(
  token: string,
  columnId: number,
  title = 'Test Task',
  description = ''
): Promise<TaskResult> {
  const res = await supertest(BASE)
    .post('/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({ columnId, title, description });

  if (res.status !== 201) {
    throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as { id: number | string; column_id: number | string; title: string; description: string; order: number };
  return {
    id: Number(body.id),
    column_id: Number(body.column_id),
    title: body.title,
    description: body.description,
    order: Number(body.order),
  };
}
