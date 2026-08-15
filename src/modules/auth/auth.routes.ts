import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { signToken } from '../../lib/jwt';
import { registerSchema, loginSchema } from './auth.schema';

const router = Router();

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const { name, email, password, role, phone } = parsed.data;
  const normalizedPhone = phone?.trim();
  const existingUserByEmail = await prisma.user.findUnique({ where: { email } });
  const existingUserByPhone = normalizedPhone
    ? await prisma.user.findUnique({ where: { phone: normalizedPhone } })
    : null;

  if (existingUserByEmail && existingUserByPhone && existingUserByEmail.id !== existingUserByPhone.id) {
    return res.status(409).json({ message: 'Account conflict: email and phone already belong to different users' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const targetUser = existingUserByEmail ?? existingUserByPhone;

  const user = targetUser
    ? await prisma.user.update({
        where: { id: targetUser.id },
        data: {
          name: targetUser.name || name,
          email,
          password: hashedPassword,
          role: targetUser.role === 'PATIENT' ? 'PATIENT' : (role ?? targetUser.role),
          phone: normalizedPhone || targetUser.phone,
        },
      })
    : await prisma.user.create({
        data: {
          name,
          email,
          phone: normalizedPhone || null,
          password: hashedPassword,
          role,
        },
      });

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  return res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  return res.status(200).json({
    message: 'Login successful',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  });
});

export default router;
