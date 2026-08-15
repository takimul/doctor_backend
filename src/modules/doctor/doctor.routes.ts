import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';
import { doctorSchema, doctorUpdateSchema } from './doctor.schema';

const router = Router();
const doctorUploadDir = path.join(process.cwd(), 'uploads', 'doctors');

if (!fs.existsSync(doctorUploadDir)) {
  fs.mkdirSync(doctorUploadDir, { recursive: true });
}

const doctorUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, doctorUploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
});

const uploadDoctorFiles = multer({ storage: doctorUploadStorage });

const doctorProfileSetupSchema = z.object({
  doctorId: z.string().min(1, 'Doctor id is required'),
  specialty: z.string().trim().min(2).optional(),
  hospital: z.string().trim().min(2).optional(),
  fee: z.coerce.number().min(1).optional(),
  experience: z.coerce.number().min(0).optional(),
  bio: z.string().trim().min(10).optional(),
  qualification: z.string().trim().min(2).optional(),
  clinicAddress: z.string().trim().min(3).optional(),
  consultationMode: z.string().trim().min(2).optional(),
});

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
  const skip = (page - 1) * limit;
  const specialty = typeof req.query.specialty === 'string' ? req.query.specialty.trim() : undefined;
  const isAvailable = req.query.isAvailable === 'true' || req.query.isAvailable === 'false'
    ? req.query.isAvailable === 'true'
    : undefined;

  const where: Record<string, any> = {};
  if (specialty) where.specialty = { contains: specialty, mode: 'insensitive' };
  if (isAvailable !== undefined) where.isAvailable = isAvailable;

  const [doctors, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.doctor.count({ where }),
  ]);

  return res.status(200).json({
    data: doctors,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  });
});

router.get('/search', async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  const specialty = typeof req.query.specialty === 'string' ? req.query.specialty.trim() : undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {};

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { specialty: { contains: query, mode: 'insensitive' } },
      { hospital: { contains: query, mode: 'insensitive' } },
    ];
  }

  if (specialty) {
    where.specialty = { contains: specialty, mode: 'insensitive' };
  }

  const [doctors, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.doctor.count({ where }),
  ]);

  return res.status(200).json({
    data: doctors,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  });
});

router.get('/me', requireAuth, requireRole(['DOCTOR', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  const doctorEmail = req.user?.email;

  if (!doctorEmail) {
    return res.status(401).json({ message: 'Doctor identity is required' });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { email: doctorEmail },
  });

  if (!doctor) {
    return res.status(404).json({ message: 'Doctor profile not found' });
  }

  const [totalAppointments, totalAvailability, upcomingAppointments] = await Promise.all([
    prisma.appointment.count({ where: { doctorId: doctor.id } }),
    prisma.availability.count({ where: { doctorId: doctor.id } }),
    prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        appointmentDate: { gte: new Date() },
      },
    }),
  ]);

  return res.status(200).json({
    doctor,
    summary: {
      doctorId: doctor.id,
      totalAppointments,
      totalAvailability,
      upcomingAppointments,
    },
  });
});

router.get('/public/:id', async (req, res) => {
  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
  });

  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
  }

  const availability = await prisma.availability.findMany({
    where: { doctorId },
    orderBy: { date: 'asc' },
  });

  return res.status(200).json({
    doctor: {
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      hospital: doctor.hospital,
      fee: doctor.fee,
      experience: doctor.experience,
      bio: doctor.bio,
      qualification: doctor.qualification,
      clinicAddress: doctor.clinicAddress,
      consultationMode: doctor.consultationMode,
      profileImageUrl: doctor.profileImageUrl,
      clinicImageUrl: doctor.clinicImageUrl,
      isAvailable: doctor.isAvailable,
    },
    availability,
  });
});

router.get('/:id', async (req, res) => {
  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
  });

  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
  }

  return res.status(200).json(doctor);
});

router.post('/', requireAuth, requireRole(['ADMIN', 'DOCTOR']), async (req, res) => {
  const parsed = doctorSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const doctor = await prisma.doctor.create({
    data: parsed.data,
  });

  return res.status(201).json({
    message: 'Doctor created successfully',
    doctor,
  });
});

router.post(
  '/setup-profile',
  requireAuth,
  requireRole(['ADMIN', 'DOCTOR']),
  uploadDoctorFiles.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'clinicImage', maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest, res) => {
    const parsed = doctorProfileSetupSchema.safeParse({
      ...req.body,
      fee: req.body.fee,
      experience: req.body.experience,
    });

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
    }

    const { doctorId, specialty, hospital, fee, experience, bio, qualification, clinicAddress, consultationMode } = parsed.data;
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const files = req.files as { profileImage?: Express.Multer.File[]; clinicImage?: Express.Multer.File[] } | undefined;
    const profileImage = files?.profileImage?.[0];
    const clinicImage = files?.clinicImage?.[0];

    const updatedDoctor = await prisma.doctor.update({
      where: { id: doctorId },
      data: {
        specialty: specialty || doctor.specialty,
        hospital: hospital || doctor.hospital,
        fee: fee ?? doctor.fee,
        experience: experience ?? doctor.experience,
        bio: bio || doctor.bio || null,
        qualification: qualification || doctor.qualification || null,
        clinicAddress: clinicAddress || doctor.clinicAddress || null,
        consultationMode: consultationMode || doctor.consultationMode || null,
        profileImageUrl: profileImage ? `/uploads/doctors/${profileImage.filename}` : doctor.profileImageUrl || null,
        clinicImageUrl: clinicImage ? `/uploads/doctors/${clinicImage.filename}` : doctor.clinicImageUrl || null,
      },
    });

    return res.status(201).json({
      message: 'Doctor profile setup completed successfully',
      doctor: updatedDoctor,
    });
  },
);

router.put('/:id', requireAuth, requireRole(['ADMIN', 'DOCTOR']), async (req: AuthenticatedRequest, res) => {
  const parsed = doctorUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: parsed.data,
  });

  return res.status(200).json({
    message: 'Doctor updated successfully',
    doctor,
  });
});

router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await prisma.doctor.delete({
    where: { id: doctorId },
  });

  return res.status(200).json({ message: 'Doctor deleted successfully' });
});

export default router;
