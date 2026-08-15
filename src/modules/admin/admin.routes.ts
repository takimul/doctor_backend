import { Router } from 'express';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';

const router = Router();

router.get('/dashboard', requireAuth, requireRole(['ADMIN']), async (_req: AuthenticatedRequest, res) => {
  const [
    totalDoctors,
    totalPatients,
    totalAppointments,
    pendingAppointments,
    confirmedAppointments,
    completedAppointments,
    cancelledAppointments,
    recentAppointments,
    recentRecords,
    recentPatients,
  ] = await Promise.all([
    prisma.doctor.count(),
    prisma.user.count({ where: { role: 'PATIENT' } }),
    prisma.appointment.count(),
    prisma.appointment.count({ where: { status: 'PENDING' } }),
    prisma.appointment.count({ where: { status: 'CONFIRMED' } }),
    prisma.appointment.count({ where: { status: 'COMPLETED' } }),
    prisma.appointment.count({ where: { status: 'CANCELLED' } }),
    prisma.appointment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: true,
        patient: true,
        availability: true,
      },
    }),
    prisma.medicalRecord.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: true,
        patient: true,
      },
    }),
    prisma.user.findMany({
      where: { role: 'PATIENT' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    }),
  ]);

  return res.status(200).json({
    summary: {
      totalDoctors,
      totalPatients,
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
    },
    recentAppointments,
    recentRecords,
    recentPatients,
  });
});

router.get('/doctors', requireAuth, requireRole(['ADMIN']), async (_req: AuthenticatedRequest, res) => {
  const doctors = await prisma.doctor.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      appointments: true,
      availability: true,
    },
  });

  return res.status(200).json(doctors);
});

router.get('/patients', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const skip = (page - 1) * limit;

  const where: Record<string, any> = { role: 'PATIENT' };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const hasListMode = Boolean(req.query.page || req.query.limit || req.query.search);

  if (!hasListMode) {
    const patients = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json(patients);
  }

  const [patients, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return res.status(200).json({
    data: patients,
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

router.patch('/doctors/:doctorId/toggle-availability', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res) => {
  const doctorId = Array.isArray(req.params.doctorId) ? req.params.doctorId[0] : req.params.doctorId;

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });

  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
  }

  const updatedDoctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: { isAvailable: !doctor.isAvailable },
  });

  return res.status(200).json({
    message: 'Doctor availability updated',
    doctor: updatedDoctor,
  });
});

export default router;
