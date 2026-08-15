import { z } from 'zod';

export const appointmentSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required').optional(),
  patientId: z.string().min(1, 'Patient ID is required'),
  availabilityId: z.string().min(1, 'Availability ID is required').optional(),
  appointmentDate: z.string().datetime({ offset: true }).or(z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')).optional(),
  reason: z.string().trim().min(5, 'Reason is required'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional().default('CONFIRMED'),
});

export const appointmentUpdateSchema = appointmentSchema.partial();

export type AppointmentInput = z.infer<typeof appointmentSchema>;
