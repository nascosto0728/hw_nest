import supertest from 'supertest';
import { BASE, uniqueEmail, registerAndLogin } from './helpers/setup';

const req = supertest(BASE);

describe('Projects', () => {
  it('建立專案，回傳 id + name + boardId', async () => {
    const { token } = await registerAndLogin();
    const res = await req
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Project' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', 'My Project');
    expect(res.body).toHaveProperty('boardId');
  });

  it('建立後自動有 Default Board（GET /boards/:id 可存取）', async () => {
    const { token } = await registerAndLogin();
    const projRes = await req
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Auto Board Project' });

    expect(projRes.status).toBe(201);
    const boardId = projRes.body.boardId as number;
    expect(boardId).toBeTruthy();

    const boardRes = await req
      .get(`/boards/${boardId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(boardRes.status).toBe(200);
    expect(boardRes.body).toHaveProperty('id', boardId);
    expect(boardRes.body).toHaveProperty('columns');
  });

  it('GET /projects 只回傳自己的專案', async () => {
    const { token: tokenA } = await registerAndLogin();
    const { token: tokenB } = await registerAndLogin();

    // User A creates a project
    await req
      .post('/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'User A Project' });

    // User B creates a project
    await req
      .post('/projects')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'User B Project' });

    const resA = await req.get('/projects').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);
    expect(Array.isArray(resA.body)).toBe(true);

    const names = (resA.body as Array<{ name: string }>).map(p => p.name);
    expect(names.some(n => n === 'User A Project')).toBe(true);
    // User A's list must NOT contain User B's project
    expect(names.some(n => n === 'User B Project')).toBe(false);
  });

  it('未登入 → 401', async () => {
    const res = await req.post('/projects').send({ name: 'No Auth' });
    expect(res.status).toBe(401);

    const res2 = await req.get('/projects');
    expect(res2.status).toBe(401);
  });
});
