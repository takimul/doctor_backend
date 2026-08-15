import { Router } from 'express';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';
import { appointmentSchema, appointmentUpdateSchema } from './appointment.schema';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const doctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined;
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;

  const where: Record<string, any> = isAdmin ? {} : {
    OR: [
      { patientId: req.user?.sub ?? '' },
      { doctorId: req.user?.sub ?? '' },
    ],
  };

  if (status) where.status = status;
  if (doctorId) where.doctorId = doctorId;
  if (patientId) where.patientId = patientId;

  if (search) {
    where.OR = [
      ...(where.OR ? where.OR : []),
      { reason: { contains: search, mode: 'insensitive' } },
      { doctor: { name: { contains: search, mode: 'insensitive' } } },
      { patient: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const hasListMode = Boolean(req.query.page || req.query.limit || req.query.status || req.query.search || req.query.doctorId || req.query.patientId);

  if (!hasListMode) {
    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        doctor: true,
        patient: true,
      },
      orderBy: { appointmentDate: 'asc' },
    });
    return res.status(200).json(appointments);
  }

  const skip = (page - 1) * limit;
  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
        doctor: true,
        patient: true,
      },
      skip,
      take: limit,
      orderBy: { appointmentDate: 'asc' },
    }),
    prisma.appointment.count({ where }),
  ]);

  return res.status(200).json({
    data: appointments,
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

router.post('/guest-book', async (req, res) => {
  const guestName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const guestPhone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const doctorId = typeof req.body?.doctorId === 'string' ? req.body.doctorId : '';
  const availabilityId = typeof req.body?.availabilityId === 'string' ? req.body.availabilityId : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

  if (!guestName || !guestPhone || !doctorId || !availabilityId || !reason) {
    return res.status(400).json({ message: 'name, phone, doctorId, availabilityId and reason are required' });
  }

  const slot = await prisma.availability.findUnique({ where: { id: availabilityId }, include: { doctor: true } });
  if (!slot) {
    return res.status(404).json({ message: 'Availability slot not found' });
  }

  if (slot.doctorId !== doctorId) {
    return res.status(400).json({ message: 'Availability does not match the selected doctor' });
  }

  if (slot.isBooked) {
    return res.status(409).json({ message: 'This time slot is already booked' });
  }

  const existingPatient = await prisma.user.findUnique({ where: { phone: guestPhone } });

  const patientId = existingPatient?.id ?? (await prisma.user.create({
    data: {
      name: guestName,
      email: `guest-${Date.now()}-${Math.random().toString(36).slice(2)}@bookmydoctor.local`,
      phone: guestPhone,
      password: `guest-${Date.now()}`,
      role: 'PATIENT',
    },
  })).id;

  const appointment = await prisma.$transaction(async (tx) => {
    const createdAppointment = await tx.appointment.create({
      data: {
        doctorId,
        patientId,
        availabilityId: slot.id,
        appointmentDate: slot.date,
        reason,
        status: 'CONFIRMED',
      },
      include: {
        doctor: true,
        patient: true,
        availability: true,
      },
    });

    await tx.availability.update({
      where: { id: slot.id },
      data: { isBooked: true },
    });

    return createdAppointment;
  });

  return res.status(201).json({
    message: 'Guest appointment booked successfully',
    appointment,
  });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = appointmentSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const { patientId, availabilityId, reason } = parsed.data;

  if (req.user && req.user.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only book for your own account' });
  }

  const patientExists = await prisma.user.findUnique({ where: { id: patientId } });
  if (!patientExists) {
    return res.status(404).json({ message: 'Patient not found' });
  }

  const slot = availabilityId
    ? await prisma.availability.findUnique({ where: { id: availabilityId } })
    : null;

  if (!slot) {
    return res.status(404).json({ message: 'Availability slot not found' });
  }

  if (slot.isBooked) {
    return res.status(409).json({ message: 'This time slot is already booked' });
  }

  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      availabilityId: slot.id,
    },
  });

  if (existingAppointment) {
    return res.status(409).json({ message: 'This time slot is already booked' });
  }

  if (slot.doctorId !== parsed.data.doctorId && parsed.data.doctorId) {
    return res.status(400).json({ message: 'Availability does not match provided doctor' });
  }

  const appointment = await prisma.$transaction(async (tx) => {
    const createdAppointment = await tx.appointment.create({
      data: {
        doctorId: slot.doctorId,
        patientId,
        availabilityId: slot.id,
        appointmentDate: slot.date,
        reason,
        status: 'CONFIRMED',
      },
      include: {
        doctor: true,
        patient: true,
        availability: true,
      },
    });

    await tx.availability.update({
      where: { id: slot.id },
      data: { isBooked: true },
    });

    return createdAppointment;
  });

  return res.status(201).json({
    message: 'Appointment created successfully',
    appointment,
  });
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = appointmentUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const appointmentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      ...parsed.data,
      appointmentDate: parsed.data.appointmentDate ? new Date(parsed.data.appointmentDate) : undefined,
    },
    include: {
      doctor: true,
      patient: true,
    },
  });

  return res.status(200).json({
    message: 'Appointment updated successfully',
    appointment,
  });
});

router.patch('/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  const allowedStatuses = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;
  const statusValue = typeof req.body?.status === 'string' ? req.body.status.toUpperCase() : undefined;

  if (!statusValue || !allowedStatuses.includes(statusValue as typeof allowedStatuses[number])) {
    return res.status(400).json({ message: 'Valid appointment status is required' });
  }

  const appointmentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existingAppointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { availability: true },
  });

  if (!existingAppointment) {
    return res.status(404).json({ message: 'Appointment not found' });
  }

  if (req.user?.role === 'PATIENT' && req.user.sub !== existingAppointment.patientId) {
    return res.status(403).json({ message: 'You can only manage your own appointments' });
  }

  const appointment = await prisma.$transaction(async (tx) => {
    const updatedAppointment = await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: statusValue as typeof allowedStatuses[number] },
      include: { doctor: true, patient: true, availability: true },
    });

    if (statusValue === 'CANCELLED' && updatedAppointment.availabilityId) {
      await tx.availability.update({
        where: { id: updatedAppointment.availabilityId },
        data: { isBooked: false },
      });
    }

    return updatedAppointment;
  });

  return res.status(200).json({
    message: 'Appointment status updated successfully',
    appointment,
  });
});

router.get('/patient/:patientId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const patientId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only view your own appointment history' });
  }

  const appointments = await prisma.appointment.findMany({
    where: { patientId },
    include: {
      doctor: true,
      patient: true,
      availability: true,
    },
    orderBy: { appointmentDate: 'asc' },
  });

  return res.status(200).json(appointments);
});

router.get('/doctor/:doctorId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const doctorId = Array.isArray(req.params.doctorId) ? req.params.doctorId[0] : req.params.doctorId;

  if (req.user?.role === 'DOCTOR' && req.user.sub !== doctorId) {
    return res.status(403).json({ message: 'You can only view your own appointment dashboard' });
  }

  const appointments = await prisma.appointment.findMany({
    where: { doctorId },
    include: {
      doctor: true,
      patient: true,
      availability: true,
    },
    orderBy: { appointmentDate: 'asc' },
  });

  return res.status(200).json(appointments);
});

router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req: AuthenticatedRequest, res) => {
  const appointmentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await prisma.appointment.delete({ where: { id: appointmentId } });

  return res.status(200).json({ message: 'Appointment deleted successfully' });
});

export default router;
