import request from 'supertest';
import app from './src/app';
import prisma from './src/lib/prisma';

async function main() {
  await prisma.appointment.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();

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

  const booking = await request(app)
    .post('/api/appointments/guest-book')
    .send({ doctorId: doctor.id, availabilityId: slot.id, name: 'Guest Patient', phone: '+91 7777777777', reason: 'Chest discomfort checkup' });

  console.log('BOOKING', booking.status, JSON.stringify(booking.body));
  const guestPatientId = booking.body.appointment.patientId;

  const registration = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Guest Patient', email: 'guest.patient.real@example.com', phone: '+91 7777777777', password: 'secret123', role: 'PATIENT' });

  console.log('REGISTER', registration.status, JSON.stringify(registration.body));

  const patientAppointments = await request(app)
    .get(`/api/appointments/patient/${guestPatientId}`)
    .set('Authorization', `Bearer ${registration.body.token}`);

  console.log('PATIENT APPOINTMENTS', patientAppointments.status, JSON.stringify(patientAppointments.body));

  const userAfter = await prisma.user.findUnique({ where: { id: guestPatientId } });
  console.log('USER AFTER', userAfter);
  const dbAppointments = await prisma.appointment.findMany({ where: { patientId: guestPatientId } });
  console.log('DB APPOINTMENTS', dbAppointments);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
