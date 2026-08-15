import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('POST /api/appointments', () => {
  it('books a doctor slot and marks it as booked', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Booking Test',
        specialty: 'Neurology',
        hospital: 'Booking Hospital',
        email: `booking-${Date.now()}@example.com`,
        phone: '+91 9000000000',
        fee: 1500,
        experience: 10,
        bio: 'Booking test doctor',
      },
    });

    const patient = await prisma.user.create({
      data: {
        name: 'Booking Patient',
        email: `patient-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
      },
    });

    const slot = await prisma.availability.create({
      data: {
        doctorId: doctor.id,
        date: new Date('2026-09-15T00:00:00.000Z'),
        startTime: '14:00',
        endTime: '15:00',
      },
    });

    const token = jwt.sign(
      { sub: patient.id, email: patient.email, role: 'PATIENT', name: patient.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const response = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId: patient.id,
        availabilityId: slot.id,
        reason: 'Follow-up consultation for migraines',
      });

    expect(response.status).toBe(201);
    expect(response.body.appointment.status).toBe('CONFIRMED');
    expect(response.body.appointment.availabilityId).toBe(slot.id);

    const updatedSlot = await prisma.availability.findUnique({ where: { id: slot.id } });
    expect(updatedSlot?.isBooked).toBe(true);
  });
});
