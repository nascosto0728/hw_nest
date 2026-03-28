import supertest from 'supertest';
import { BASE, registerAndLogin, createProject, createColumn, createTask } from './helpers/setup';

const req = supertest(BASE);

describe('Tasks', () => {
  it('POST /tasks，order 自動遞增', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Task Order Test');
    const col = await createColumn(token, boardId, 'Col');

    const t1 = await createTask(token, col.id, 'Task 1');
    const t2 = await createTask(token, col.id, 'Task 2');
    const t3 = await createTask(token, col.id, 'Task 3');

    expect(t1.order).toBeLessThan(t2.order);
    expect(t2.order).toBeLessThan(t3.order);
  });

  it('GET /tasks?boardId=... 按 column 分組，按 order 排序', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Task Grouped Test');
    const col = await createColumn(token, boardId, 'Col A');

    await createTask(token, col.id, 'Task First');
    await createTask(token, col.id, 'Task Second');
    await createTask(token, col.id, 'Task Third');

    const res = await req
      .get(`/tasks?boardId=${boardId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Find tasks in our column
    const tasks = (res.body as Array<{ column_id: number; order: number; title: string }>)
      .filter(t => t.column_id === col.id);

    expect(tasks.length).toBe(3);
    // Verify order is ascending
    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i].order).toBeGreaterThan(tasks[i - 1].order);
    }
  });

  it('GET /tasks 無 boardId → 400', async () => {
    const { token } = await registerAndLogin();
    const res = await req.get('/tasks').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('PUT /tasks/:id 更新 title/description', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Task Update Test');
    const col = await createColumn(token, boardId, 'Col');
    const task = await createTask(token, col.id, 'Old Title', 'Old Desc');

    const res = await req
      .put(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Title', description: 'New Desc' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('title', 'New Title');
    expect(res.body).toHaveProperty('description', 'New Desc');
  });

  it('DELETE /tasks/:id 後同欄 order 連續（驗證補齊）', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Task Delete Reorder');
    const col = await createColumn(token, boardId, 'Col');

    const t1 = await createTask(token, col.id, 'T1');
    const t2 = await createTask(token, col.id, 'T2');
    const t3 = await createTask(token, col.id, 'T3');

    // Delete t2
    const delRes = await req
      .delete(`/tasks/${t2.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    // Get tasks
    const listRes = await req
      .get(`/tasks?boardId=${boardId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);

    const remaining = (listRes.body as Array<{ id: number; column_id: number; order: number }>)
      .filter(t => t.column_id === col.id)
      .sort((a, b) => a.order - b.order);

    expect(remaining.length).toBe(2);
    expect(remaining.map(t => t.id)).toContain(t1.id);
    expect(remaining.map(t => t.id)).toContain(t3.id);
    expect(remaining.map(t => t.id)).not.toContain(t2.id);

    // Orders should be consecutive starting at 1
    expect(remaining[0].order).toBe(1);
    expect(remaining[1].order).toBe(2);
  });

  it('刪完欄裡最後一個 task 後不報錯', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Task Delete Last');
    const col = await createColumn(token, boardId, 'Only Col');
    const task = await createTask(token, col.id, 'Only Task');

    const res = await req
      .delete(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    // Verify column is empty (no error)
    const listRes = await req
      .get(`/tasks?boardId=${boardId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);

    const colTasks = (listRes.body as Array<{ column_id: number }>)
      .filter(t => t.column_id === col.id);
    expect(colTasks.length).toBe(0);
  });
});
