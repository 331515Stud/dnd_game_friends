const request = require('supertest');
const { app, server } = require('../server');
const { pool } = require('../config/database');

afterAll(async () => {
  await pool.end();
  server.close();
});

describe('Auth API', () => {
  it('should register new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: 'player'
      });
    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('id');
  });

  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'password123'
      });
    expect(res.status).toBe(200);
  });

  it('should reject invalid login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'wrongpassword'
      });
    expect(res.status).toBe(401);
  });
});