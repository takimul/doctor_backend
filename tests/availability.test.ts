import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('POST /api/availability', () => {
  it('creates a doctor availability slot for a valid doctor', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Slot Test',
        specialty: 'Dermatology',
        hospital: 'Slot Hospital',
        email: `slot-${Date.now()}@example.com`,
        phone: '+91 9999999999',
        fee: 900,
        experience: 8,
        bio: 'Availability testing doctor',
      },
    });

    const token = jwt.sign(
      { sub: doctor.id, email: doctor.email, role: 'DOCTOR', name: doctor.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const response = await request(app)
      .post('/api/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        doctorId: doctor.id,
        date: '2026-09-01',
        startTime: '10:00',
        endTime: '11:00',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('slot');
    expect(response.body.slot.doctorId).toBe(doctor.id);
  });
});
