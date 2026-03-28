import supertest from 'supertest';
import { BASE, registerAndLogin, createProject, createColumn, createTask, TaskResult } from './helpers/setup';

const req = supertest(BASE);

async function getTasksInColumn(
  token: string,
  boardId: number,
  columnId: number
): Promise<Array<{ id: number; column_id: number; order: number; title: string }>> {
  const res = await req
    .get(`/tasks?boardId=${boardId}`)
    .set('Authorization', `Bearer ${token}`);
  if (res.status !== 200) {
    throw new Error(`getTasksInColumn failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as Array<{ id: number; column_id: number; order: number; title: string }>)
    .filter(t => t.column_id === columnId)
    .sort((a, b) => a.order - b.order);
}

async function moveTask(
  token: string,
  taskId: number,
  toColumnId: number,
  newOrder: number
): Promise<supertest.Response> {
  return req
    .patch(`/tasks/${taskId}/move`)
    .set('Authorization', `Bearer ${token}`)
    .send({ toColumnId, newOrder });
}

describe('Move Task', () => {
  let token: string;
  let boardId: number;
  let col1Id: number;
  let col2Id: number;

  beforeEach(async () => {
    const auth = await registerAndLogin();
    token = auth.token;
    const project = await createProject(token, 'Move Test Project');
    boardId = project.boardId;
    const c1 = await createColumn(token, boardId, 'Source Col');
    const c2 = await createColumn(token, boardId, 'Target Col');
    col1Id = c1.id;
    col2Id = c2.id;
  });

  it('同欄往後移（1→3），中間 tasks order 正確 -1', async () => {
    const t1 = await createTask(token, col1Id, 'T1');
    const t2 = await createTask(token, col1Id, 'T2');
    const t3 = await createTask(token, col1Id, 'T3');

    // Move t1 from order 1 to order 3
    const res = await moveTask(token, t1.id, col1Id, 3);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order', 3);

    const tasks = await getTasksInColumn(token, boardId, col1Id);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t.order]));

    expect(byId[t1.id]).toBe(3);
    expect(byId[t2.id]).toBe(1); // shifted down
    expect(byId[t3.id]).toBe(2); // shifted down
  });

  it('同欄往前移（3→1），中間 tasks order 正確 +1', async () => {
    const t1 = await createTask(token, col1Id, 'T1');
    const t2 = await createTask(token, col1Id, 'T2');
    const t3 = await createTask(token, col1Id, 'T3');

    // Move t3 from order 3 to order 1
    const res = await moveTask(token, t3.id, col1Id, 1);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order', 1);

    const tasks = await getTasksInColumn(token, boardId, col1Id);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t.order]));

    expect(byId[t3.id]).toBe(1);
    expect(byId[t1.id]).toBe(2); // shifted up
    expect(byId[t2.id]).toBe(3); // shifted up
  });

  it('同欄 newOrder == oldOrder → no-op，直接回傳', async () => {
    const t1 = await createTask(token, col1Id, 'T1');
    const t2 = await createTask(token, col1Id, 'T2');

    const res = await moveTask(token, t1.id, col1Id, t1.order);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order', 1);

    // Orders unchanged
    const tasks = await getTasksInColumn(token, boardId, col1Id);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t.order]));
    expect(byId[t1.id]).toBe(1);
    expect(byId[t2.id]).toBe(2);
  });

  it('跨欄移動，source 欄補位，target 欄騰位，task columnId 更新', async () => {
    const t1 = await createTask(token, col1Id, 'Src T1');
    const t2 = await createTask(token, col1Id, 'Src T2');
    const t3 = await createTask(token, col1Id, 'Src T3');

    const d1 = await createTask(token, col2Id, 'Dst D1');
    const d2 = await createTask(token, col2Id, 'Dst D2');

    // Move t2 from col1 to col2 at position 1
    const res = await moveTask(token, t2.id, col2Id, 1);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('columnId', col2Id);
    expect(res.body).toHaveProperty('order', 1);

    // Source column should have t1, t3 with consecutive orders
    const srcTasks = await getTasksInColumn(token, boardId, col1Id);
    expect(srcTasks.length).toBe(2);
    const srcByTitle = Object.fromEntries(srcTasks.map(t => [t.title, t.order]));
    expect(srcByTitle['Src T1']).toBe(1);
    expect(srcByTitle['Src T3']).toBe(2);

    // Target column: t2 at 1, d1 at 2, d2 at 3
    const dstTasks = await getTasksInColumn(token, boardId, col2Id);
    expect(dstTasks.length).toBe(3);
    const dstByTitle = Object.fromEntries(dstTasks.map(t => [t.title, t.order]));
    expect(dstByTitle['Src T2']).toBe(1);
    expect(dstByTitle['Dst D1']).toBe(2);
    expect(dstByTitle['Dst D2']).toBe(3);
  });

  it('跨欄移到空欄（newOrder=1）', async () => {
    const t1 = await createTask(token, col1Id, 'Only Task');

    // col2 is empty
    const res = await moveTask(token, t1.id, col2Id, 1);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('columnId', col2Id);
    expect(res.body).toHaveProperty('order', 1);

    const srcTasks = await getTasksInColumn(token, boardId, col1Id);
    expect(srcTasks.length).toBe(0);

    const dstTasks = await getTasksInColumn(token, boardId, col2Id);
    expect(dstTasks.length).toBe(1);
    expect(dstTasks[0].id).toBe(t1.id);
    expect(dstTasks[0].order).toBe(1);
  });

  it('newOrder 超出上界 → 自動夾值到 max', async () => {
    const t1 = await createTask(token, col1Id, 'T1');
    const t2 = await createTask(token, col1Id, 'T2');
    const t3 = await createTask(token, col1Id, 'T3');

    // Move t1 with newOrder=9999 (clamped to 3)
    const res = await moveTask(token, t1.id, col1Id, 9999);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order', 3);

    const tasks = await getTasksInColumn(token, boardId, col1Id);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t.order]));
    expect(byId[t1.id]).toBe(3);
    expect(byId[t2.id]).toBe(1);
    expect(byId[t3.id]).toBe(2);
  });

  it('newOrder = 0 → 自動夾值到 1', async () => {
    const t1 = await createTask(token, col1Id, 'T1');
    const t2 = await createTask(token, col1Id, 'T2');

    // Move t2 with newOrder=0 (clamped to 1)
    const res = await moveTask(token, t2.id, col1Id, 0);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order', 1);

    const tasks = await getTasksInColumn(token, boardId, col1Id);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t.order]));
    expect(byId[t2.id]).toBe(1);
    expect(byId[t1.id]).toBe(2);
  });

  it('newOrder 負數 → 自動夾值到 1', async () => {
    const t1 = await createTask(token, col1Id, 'T1');
    const t2 = await createTask(token, col1Id, 'T2');

    const res = await moveTask(token, t2.id, col1Id, -5);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order', 1);

    const tasks = await getTasksInColumn(token, boardId, col1Id);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t.order]));
    expect(byId[t2.id]).toBe(1);
    expect(byId[t1.id]).toBe(2);
  });

  it('移到同欄最後（newOrder = count）', async () => {
    const t1 = await createTask(token, col1Id, 'T1');
    const t2 = await createTask(token, col1Id, 'T2');
    const t3 = await createTask(token, col1Id, 'T3');

    // Move t1 to order 3 (last)
    const res = await moveTask(token, t1.id, col1Id, 3);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order', 3);

    const tasks = await getTasksInColumn(token, boardId, col1Id);
    const sorted = tasks.sort((a, b) => a.order - b.order);
    expect(sorted[sorted.length - 1].id).toBe(t1.id);
  });

  it('併發 10 個 move 請求，最終 order 無重複且連續', async () => {
    // Create 10 tasks in col1
    const tasks: TaskResult[] = [];
    for (let i = 0; i < 10; i++) {
      const t = await createTask(token, col1Id, `ConcurrentTask${i + 1}`);
      tasks.push(t);
    }

    // Send 10 concurrent move requests, each moving to a different position in col1
    const moves = tasks.map((t, i) =>
      req
        .patch(`/tasks/${t.id}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({ toColumnId: col1Id, newOrder: i + 1 })
    );

    const results = await Promise.all(moves);

    // All should succeed (200)
    for (const r of results) {
      expect(r.status).toBe(200);
    }

    // Fetch final state
    const finalTasks = await getTasksInColumn(token, boardId, col1Id);
    expect(finalTasks.length).toBe(10);

    const orders = finalTasks.map(t => t.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // No duplicates
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(10);
  }, 30000);
});
