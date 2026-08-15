import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';

describe('guest booking to registered patient merge', () => {
  it('allows a guest to book without login and preserves the history after registration with the same phone number', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Guest Merge',
        specialty: 'Cardiology',
        hospital: 'Guest Hospital',
        email: `guest-merge-${Date.now()}@example.com`,
        phone: `+91 ${5000000000 + (Date.now() % 1000000000)}`,
        fee: 1600,
        experience: 12,
        bio: 'Guest merge doctor',
      },
    });

    const slot = await prisma.availability.create({
      data: {
        doctorId: doctor.id,
        date: new Date('2026-10-15T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '10:30',
      },
    });

    const guestBooking = await request(app)
      .post('/api/appointments/guest-book')
      .send({
        doctorId: doctor.id,
        availabilityId: slot.id,
        name: 'Guest Patient',
        phone: '+91 7777777777',
        reason: 'Chest discomfort checkup',
      });

    expect(guestBooking.status).toBe(201);
    expect(guestBooking.body.appointment.patientId).toBeTruthy();

    const guestPatientId = guestBooking.body.appointment.patientId;

    const registration = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Guest Patient',
        email: 'guest.patient.real@example.com',
        phone: '+91 7777777777',
        password: 'secret123',
        role: 'PATIENT',
      });

    expect(registration.status).toBe(201);
    expect(registration.body.user.id).toBe(guestPatientId);

    const patientAppointments = await request(app)
      .get(`/api/appointments/patient/${guestPatientId}`)
      .set('Authorization', `Bearer ${registration.body.token}`);

    expect(patientAppointments.status).toBe(200);
    expect(patientAppointments.body.length).toBeGreaterThanOrEqual(1);
  });
});
