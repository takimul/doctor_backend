import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('doctor dashboard and cancellation release', () => {
  it('releases a slot when an appointment is cancelled and exposes doctor appointments', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Dashboard Test',
        specialty: 'Orthopedics',
        hospital: 'Dashboard Hospital',
        email: `dashboard-doc-${Date.now()}@example.com`,
        phone: '+91 9333333333',
        fee: 1600,
        experience: 15,
        bio: 'Dashboard doctor',
      },
    });

    const patient = await prisma.user.create({
      data: {
        name: 'Dashboard Patient',
        email: `dashboard-patient-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
      },
    });

    const slot = await prisma.availability.create({
      data: {
        doctorId: doctor.id,
        date: new Date('2026-12-20T00:00:00.000Z'),
        startTime: '09:00',
        endTime: '10:00',
      },
    });

    const patientToken = jwt.sign(
      { sub: patient.id, email: patient.email, role: 'PATIENT', name: patient.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const tokenDoctor = jwt.sign(
      { sub: doctor.id, email: doctor.email, role: 'DOCTOR', name: doctor.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const appointmentResponse = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId: patient.id,
        availabilityId: slot.id,
        reason: 'Joint pain evaluation',
      });

    expect(appointmentResponse.status).toBe(201);
    const appointmentId = appointmentResponse.body.appointment.id;

    const cancelResponse = await request(app)
      .patch(`/api/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ status: 'CANCELLED' });

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.appointment.status).toBe('CANCELLED');

    const refreshedSlot = await prisma.availability.findUnique({ where: { id: slot.id } });
    expect(refreshedSlot?.isBooked).toBe(false);

    const doctorAppointments = await request(app)
      .get(`/api/appointments/doctor/${doctor.id}`)
      .set('Authorization', `Bearer ${tokenDoctor}`);

    expect(doctorAppointments.status).toBe(200);
    expect(Array.isArray(doctorAppointments.body)).toBe(true);
  });
});
