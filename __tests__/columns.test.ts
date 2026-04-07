import supertest from 'supertest';
import { BASE, registerAndLogin, createProject, createColumn, createTask } from './helpers/setup';

const req = supertest(BASE);

describe('Columns', () => {
  it('POST /columns，position 自動遞增', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Col Position Test');

    const col1 = await createColumn(token, boardId, 'Col 1');
    const col2 = await createColumn(token, boardId, 'Col 2');
    const col3 = await createColumn(token, boardId, 'Col 3');

    // Positions should be ascending (the project default board may already have columns,
    // so we just verify relative order)
    expect(col1.position).toBeLessThan(col2.position);
    expect(col2.position).toBeLessThan(col3.position);
  });

  it('PUT /columns/:id 改名', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Col Rename Test');
    const col = await createColumn(token, boardId, 'Original Name');

    const res = await req
      .put(`/columns/${col.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'New Name');
  });

  it('DELETE /columns/:id 有任務 → 400', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Col Delete With Task');
    const col = await createColumn(token, boardId, 'Has Tasks');

    // Add a task to the column
    await createTask(token, col.id, 'Blocker Task');

    const res = await req
      .delete(`/columns/${col.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('DELETE /columns/:id 無任務成功，其他 column position 重排連續', async () => {
    const { token } = await registerAndLogin();
    const { boardId } = await createProject(token, 'Col Delete Reorder');

    const col1 = await createColumn(token, boardId, 'Col 1');
    const col2 = await createColumn(token, boardId, 'Col 2');
    const col3 = await createColumn(token, boardId, 'Col 3');

    // Delete col2 (no tasks)
    const delRes = await req
      .delete(`/columns/${col2.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.status).toBe(200);

    // Get board to check remaining columns' positions
    const boardRes = await req
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(boardRes.status).toBe(200);
    const columns = boardRes.body.columns as Array<{ id: number | string; position: number }>;

    // Filter out any default board columns that came with the project
    const ourCols = columns.filter(c => Number(c.id) === col1.id || Number(c.id) === col3.id);
    expect(ourCols.length).toBe(2);

    // Positions should be consecutive integers
    const positions = ourCols.map(c => Number(c.position)).sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBe(1);
    }

    // col2 should be gone
    const deletedCol = columns.find(c => Number(c.id) === col2.id);
    expect(deletedCol).toBeUndefined();
  });
});
