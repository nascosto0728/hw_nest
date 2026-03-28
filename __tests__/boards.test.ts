import supertest from 'supertest';
import { BASE, registerAndLogin, createProject, createColumn, createTask } from './helpers/setup';

const req = supertest(BASE);

describe('Boards', () => {
  it('GET /boards/:id 回傳巢狀 columns + tasks', async () => {
    const { token } = await registerAndLogin();
    const project = await createProject(token, 'Board Test Project');
    const { boardId } = project;

    // Add a column
    const col = await createColumn(token, boardId, 'Col 1');
    // Add a task
    await createTask(token, col.id, 'Task 1');

    const res = await req
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', boardId);
    expect(res.body).toHaveProperty('columns');
    expect(Array.isArray(res.body.columns)).toBe(true);

    // Find our column
    const foundCol = (res.body.columns as Array<{ id: number; tasks: Array<{ title: string }> }>)
      .find(c => c.id === col.id);
    expect(foundCol).toBeDefined();
    expect(Array.isArray(foundCol!.tasks)).toBe(true);
    expect(foundCol!.tasks.some(t => t.title === 'Task 1')).toBe(true);
  });

  it('他人 board → 403', async () => {
    const { token: tokenA } = await registerAndLogin();
    const { token: tokenB } = await registerAndLogin();

    const projectA = await createProject(tokenA, 'User A Board');
    const { boardId } = projectA;

    // User B tries to access User A's board
    const res = await req
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
  });

  it('不存在 board → 404', async () => {
    const { token } = await registerAndLogin();

    const res = await req
      .get('/boards/99999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
