import { Router } from 'express';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';
import { availabilitySchema } from './availability.schema';

const router = Router();

router.get('/', async (_req, res) => {
  const slots = await prisma.availability.findMany({
    orderBy: { date: 'asc' },
  });

  return res.status(200).json(slots);
});

router.post('/', requireAuth, requireRole(['DOCTOR', 'ADMIN']), async (req: AuthenticatedRequest, res) => {
  const parsed = availabilitySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const doctorExists = await prisma.doctor.findUnique({ where: { id: parsed.data.doctorId } });
  if (!doctorExists) {
    return res.status(404).json({ message: 'Doctor not found' });
  }

  if (parsed.data.startTime >= parsed.data.endTime) {
    return res.status(400).json({ message: 'End time must be after start time' });
  }

  try {
    const date = new Date(`${parsed.data.date}T00:00:00.000Z`);

    const overlappingSlot = await prisma.availability.findFirst({
      where: {
        doctorId: parsed.data.doctorId,
        date,
        OR: [
          {
            AND: [
              { startTime: { lt: parsed.data.endTime } },
              { endTime: { gt: parsed.data.startTime } },
            ],
          },
        ],
      },
    });

    if (overlappingSlot) {
      return res.status(409).json({
        message: 'This doctor already has an overlapping availability slot for the same date',
      });
    }

    const slot = await prisma.availability.create({
      data: {
        doctorId: parsed.data.doctorId,
        date,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        isBooked: parsed.data.isBooked,
      },
    });

    return res.status(201).json({
      message: 'Availability slot created successfully',
      slot,
    });
  } catch (error) {
    console.error('Availability creation error:', error);
    return res.status(500).json({
      message: 'Failed to create availability slot',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/doctor/:doctorId', async (req, res) => {
  const doctorId = Array.isArray(req.params.doctorId) ? req.params.doctorId[0] : req.params.doctorId;

  const slots = await prisma.availability.findMany({
    where: { doctorId },
    orderBy: { date: 'asc' },
  });

  return res.status(200).json(slots);
});

export default router;
