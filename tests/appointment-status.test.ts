import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('appointment status and patient history', () => {
  it('updates appointment status and returns patient history', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Status Test',
        specialty: 'Cardiology',
        hospital: 'Status Hospital',
        email: `status-doc-${Date.now()}@example.com`,
        phone: '+91 9111111111',
        fee: 1200,
        experience: 12,
        bio: 'Status test doctor',
      },
    });

    const patient = await prisma.user.create({
      data: {
        name: 'Status Patient',
        email: `status-patient-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
      },
    });

    const slot = await prisma.availability.create({
      data: {
        doctorId: doctor.id,
        date: new Date('2026-10-15T00:00:00.000Z'),
        startTime: '16:00',
        endTime: '17:00',
      },
    });

    const patientToken = jwt.sign(
      { sub: patient.id, email: patient.email, role: 'PATIENT', name: patient.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const createResponse = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId: patient.id,
        availabilityId: slot.id,
        reason: 'Regular cardiac review',
      });

    expect(createResponse.status).toBe(201);

    const appointmentId = createResponse.body.appointment.id;

    const statusResponse = await request(app)
      .patch(`/api/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ status: 'CANCELLED' });

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.appointment.status).toBe('CANCELLED');

    const historyResponse = await request(app)
      .get(`/api/appointments/patient/${patient.id}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.length).toBeGreaterThanOrEqual(1);
    expect(historyResponse.body[0].patientId).toBe(patient.id);
  });
});
