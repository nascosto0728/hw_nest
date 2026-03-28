import supertest from 'supertest';
import { BASE, registerAndLogin, createProject, createColumn, createTask } from './helpers/setup';

const req = supertest(BASE);

describe('Auth Guard', () => {
  describe('無 token → 401', () => {
    it('GET /projects 無 token', async () => {
      const res = await req.get('/projects');
      expect(res.status).toBe(401);
    });

    it('POST /projects 無 token', async () => {
      const res = await req.post('/projects').send({ name: 'x' });
      expect(res.status).toBe(401);
    });

    it('GET /boards/:id 無 token', async () => {
      const res = await req.get('/boards/1');
      expect(res.status).toBe(401);
    });

    it('POST /columns 無 token', async () => {
      const res = await req.post('/columns').send({ boardId: 1, name: 'x' });
      expect(res.status).toBe(401);
    });

    it('PUT /columns/:id 無 token', async () => {
      const res = await req.put('/columns/1').send({ name: 'x' });
      expect(res.status).toBe(401);
    });

    it('DELETE /columns/:id 無 token', async () => {
      const res = await req.delete('/columns/1');
      expect(res.status).toBe(401);
    });

    it('POST /tasks 無 token', async () => {
      const res = await req.post('/tasks').send({ columnId: 1, title: 'x' });
      expect(res.status).toBe(401);
    });

    it('GET /tasks 無 token', async () => {
      const res = await req.get('/tasks?boardId=1');
      expect(res.status).toBe(401);
    });

    it('PUT /tasks/:id 無 token', async () => {
      const res = await req.put('/tasks/1').send({ title: 'x' });
      expect(res.status).toBe(401);
    });

    it('DELETE /tasks/:id 無 token', async () => {
      const res = await req.delete('/tasks/1');
      expect(res.status).toBe(401);
    });

    it('PATCH /tasks/:id/move 無 token', async () => {
      const res = await req.patch('/tasks/1/move').send({ toColumnId: 1, newOrder: 1 });
      expect(res.status).toBe(401);
    });
  });

  describe('無效 token → 401', () => {
    const INVALID_TOKEN = 'Bearer invalid.token.here';

    it('GET /projects 無效 token', async () => {
      const res = await req.get('/projects').set('Authorization', INVALID_TOKEN);
      expect(res.status).toBe(401);
    });

    it('GET /boards/:id 無效 token', async () => {
      const res = await req.get('/boards/1').set('Authorization', INVALID_TOKEN);
      expect(res.status).toBe(401);
    });

    it('POST /tasks 無效 token', async () => {
      const res = await req.post('/tasks')
        .set('Authorization', INVALID_TOKEN)
        .send({ columnId: 1, title: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('跨用戶權限隔離 → 403', () => {
    it('user B 存取 user A 的 board → 403', async () => {
      const { token: tokenA } = await registerAndLogin();
      const { token: tokenB } = await registerAndLogin();

      const projA = await createProject(tokenA, 'User A Project');

      const res = await req
        .get(`/boards/${projA.boardId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
    });

    it('user B 存取 user A 的 column（PUT） → 403', async () => {
      const { token: tokenA } = await registerAndLogin();
      const { token: tokenB } = await registerAndLogin();

      const projA = await createProject(tokenA, 'User A Project');
      const colA = await createColumn(tokenA, projA.boardId, 'User A Col');

      const res = await req
        .put(`/columns/${colA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Hijacked' });

      expect(res.status).toBe(403);
    });

    it('user B 刪除 user A 的 column → 403', async () => {
      const { token: tokenA } = await registerAndLogin();
      const { token: tokenB } = await registerAndLogin();

      const projA = await createProject(tokenA, 'User A Project');
      const colA = await createColumn(tokenA, projA.boardId, 'User A Col');

      const res = await req
        .delete(`/columns/${colA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
    });

    it('user B 存取 user A 的 task（PUT） → 403', async () => {
      const { token: tokenA } = await registerAndLogin();
      const { token: tokenB } = await registerAndLogin();

      const projA = await createProject(tokenA, 'User A Project');
      const colA = await createColumn(tokenA, projA.boardId, 'User A Col');
      const taskA = await createTask(tokenA, colA.id, 'User A Task');

      const res = await req
        .put(`/tasks/${taskA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Hijacked' });

      expect(res.status).toBe(403);
    });

    it('user B 刪除 user A 的 task → 403', async () => {
      const { token: tokenA } = await registerAndLogin();
      const { token: tokenB } = await registerAndLogin();

      const projA = await createProject(tokenA, 'User A Project');
      const colA = await createColumn(tokenA, projA.boardId, 'User A Col');
      const taskA = await createTask(tokenA, colA.id, 'User A Task');

      const res = await req
        .delete(`/tasks/${taskA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
    });

    it('user B 移動 user A 的 task → 403', async () => {
      const { token: tokenA } = await registerAndLogin();
      const { token: tokenB } = await registerAndLogin();

      const projA = await createProject(tokenA, 'User A Project');
      const colA = await createColumn(tokenA, projA.boardId, 'User A Col');
      const taskA = await createTask(tokenA, colA.id, 'User A Task');

      const res = await req
        .patch(`/tasks/${taskA.id}/move`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ toColumnId: colA.id, newOrder: 1 });

      expect(res.status).toBe(403);
    });
  });
});
