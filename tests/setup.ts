import prisma from '../src/lib/prisma';

beforeEach(async () => {
  await prisma.appointment.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();
});
