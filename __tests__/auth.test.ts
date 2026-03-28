import supertest from 'supertest';
import { BASE, uniqueEmail } from './helpers/setup';

const req = supertest(BASE);

describe('Auth - Register', () => {
  it('成功註冊，回傳 id + email', async () => {
    const email = uniqueEmail();
    const res = await req.post('/auth/register').send({ email, password: 'Pass1234!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('email', email);
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('重複 email → 400', async () => {
    const email = uniqueEmail();
    await req.post('/auth/register').send({ email, password: 'Pass1234!' });
    const res = await req.post('/auth/register').send({ email, password: 'Pass1234!' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('缺少 email 欄位 → 400', async () => {
    const res = await req.post('/auth/register').send({ password: 'Pass1234!' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('缺少 password 欄位 → 400', async () => {
    const res = await req.post('/auth/register').send({ email: uniqueEmail() });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('Auth - Login', () => {
  it('成功登入，回傳 token', async () => {
    const email = uniqueEmail();
    const password = 'Pass1234!';
    await req.post('/auth/register').send({ email, password });

    const res = await req.post('/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('錯誤密碼 → 401', async () => {
    const email = uniqueEmail();
    await req.post('/auth/register').send({ email, password: 'CorrectPass!' });

    const res = await req.post('/auth/login').send({ email, password: 'WrongPass!' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('缺少 email 欄位 → 400', async () => {
    const res = await req.post('/auth/login').send({ password: 'Pass1234!' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('缺少 password 欄位 → 400', async () => {
    const res = await req.post('/auth/login').send({ email: uniqueEmail() });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
