import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('booking conflict prevention', () => {
  it('prevents booking the same slot twice for the same doctor', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Conflict Test',
        specialty: 'Neurology',
        hospital: 'Conflict Hospital',
        email: `conflict-doc-${Date.now()}@example.com`,
        phone: '+91 9222222222',
        fee: 1400,
        experience: 9,
        bio: 'Conflict prevention doctor',
      },
    });

    const patient1 = await prisma.user.create({
      data: {
        name: 'Patient One',
        email: `patient-one-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
      },
    });

    const patient2 = await prisma.user.create({
      data: {
        name: 'Patient Two',
        email: `patient-two-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
      },
    });

    const slot = await prisma.availability.create({
      data: {
        doctorId: doctor.id,
        date: new Date('2026-11-15T00:00:00.000Z'),
        startTime: '11:00',
        endTime: '12:00',
      },
    });

    const token1 = jwt.sign(
      { sub: patient1.id, email: patient1.email, role: 'PATIENT', name: patient1.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const token2 = jwt.sign(
      { sub: patient2.id, email: patient2.email, role: 'PATIENT', name: patient2.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const firstBooking = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        patientId: patient1.id,
        availabilityId: slot.id,
        reason: 'First booking attempt',
      });

    expect(firstBooking.status).toBe(201);

    const secondBooking = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        patientId: patient2.id,
        availabilityId: slot.id,
        reason: 'Second booking attempt',
      });

    expect(secondBooking.status).toBe(409);
    expect(secondBooking.body.message).toMatch(/already booked|occupied/i);
  });
});
