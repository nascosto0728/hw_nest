import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as userRepo from '../repositories/user.repository';
import { createError } from '../middleware/error.middleware';
import { JwtPayload } from '../types';

const SALT_ROUNDS = 12;

export async function register(
  email: string,
  password: string
): Promise<{ id: number; email: string }> {
  if (!email || !password) {
    throw createError('Email and password are required', 400);
  }

  const existingUser = await userRepo.findUserByEmail(email);
  if (existingUser) {
    throw createError('Email already in use', 400);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await userRepo.createUser(email, passwordHash);
  return { id: user.id, email: user.email };
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string }> {
  if (!email || !password) {
    throw createError('Email and password are required', 400);
  }

  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    throw createError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw createError('Invalid credentials', 401);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw createError('JWT secret not configured', 500);
  }

  const payload: JwtPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(payload, secret, { expiresIn: '7d' });
  return { token };
}
