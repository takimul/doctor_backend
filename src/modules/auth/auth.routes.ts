import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { signToken } from '../../lib/jwt';
import { registerSchema, loginSchema } from './auth.schema';

const router = Router();

// router.post('/register', async (req, res) => {
//   const parsed = registerSchema.safeParse(req.body);

//   if (!parsed.success) {
//     return res.status(400).json({
//       message: 'Validation failed',
//       errors: parsed.error.flatten(),
//     });
//   }

//   const { name, email, password, role, phone } = parsed.data;
//   const normalizedPhone = phone?.trim();
//   const existingUserByEmail = await prisma.user.findUnique({ where: { email } });
//   const existingUserByPhone = normalizedPhone
//     ? await prisma.user.findUnique({ where: { phone: normalizedPhone } })
//     : null;

//   if (existingUserByEmail && existingUserByPhone && existingUserByEmail.id !== existingUserByPhone.id) {
//     return res.status(409).json({ message: 'Account conflict: email and phone already belong to different users' });
//   }

//   const hashedPassword = await bcrypt.hash(password, 10);
//   const targetUser = existingUserByEmail ?? existingUserByPhone;

//   const user = targetUser
//     ? await prisma.user.update({
//         where: { id: targetUser.id },
//         data: {
//           name: targetUser.name || name,
//           email,
//           password: hashedPassword,
//           role: targetUser.role === 'PATIENT' ? 'PATIENT' : (role ?? targetUser.role),
//           phone: normalizedPhone || targetUser.phone,
//         },
//       })
//     : await prisma.user.create({
//         data: {
//           name,
//           email,
//           phone: normalizedPhone || null,
//           password: hashedPassword,
//           role,
//         },
//       });

//   const token = signToken({
//     sub: user.id,
//     email: user.email,
//     role: user.role,
//     name: user.name,
//   });

//   return res.status(201).json({
//     message: 'User registered successfully',
//     user: {
//       id: user.id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//     },
//     token,
//   });
// });
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingUserByEmail = await tx.user.findUnique({
        where: { email },
      });

      const existingUserByPhone = normalizedPhone
        ? await tx.user.findUnique({
            where: { phone: normalizedPhone },
          })
        : null;

      if (
        existingUserByEmail &&
        existingUserByPhone &&
        existingUserByEmail.id !== existingUserByPhone.id
      ) {
        throw new Error(
          'Account conflict: email and phone already belong to different users'
        );
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const targetUser = existingUserByEmail ?? existingUserByPhone;

      const user = targetUser
        ? await tx.user.update({
            where: { id: targetUser.id },
            data: {
              name: targetUser.name || name,
              email,
              password: hashedPassword,

              // If this is a new doctor registration,
              // don't accidentally convert an existing patient.
              role:
                targetUser.role === 'PATIENT'
                  ? 'PATIENT'
                  : role ?? targetUser.role,

              phone: normalizedPhone || targetUser.phone,
            },
          })
        : await tx.user.create({
            data: {
              name,
              email,
              phone: normalizedPhone || null,
              password: hashedPassword,
              role,
            },
          });

      // ==========================================
      // CREATE DOCTOR PROFILE AUTOMATICALLY
      // ==========================================
      if (user.role === 'DOCTOR') {
        const existingDoctor = await tx.doctor.findUnique({
          where: { email: user.email },
        });

        if (!existingDoctor) {
          await tx.doctor.create({
            data: {
              name: user.name,
              email: user.email,
              phone: user.phone ?? '',

              // Initial/default profile values
              specialty: 'General Medicine',
              hospital: 'Not specified',
              fee: 0,
              experience: 0,

              bio: null,
              qualification: null,
              clinicAddress: null,
              consultationMode: null,
              profileImageUrl: null,
              clinicImageUrl: null,
            },
          });
        }
      }

      return user;
    });

    const token = signToken({
      sub: result.id,
      email: result.email,
      role: result.role,
      name: result.name,
    });

    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
        role: result.role,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);

    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Unable to register user',
    });
  }
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
