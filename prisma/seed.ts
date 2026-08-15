import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma';

const daysFromToday = (days: number, hour: number, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
};

async function main() {
  // Keep this safe to run repeatedly while preparing a local/demo environment.
  await prisma.appointment.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash('demo123', 10);

  const [admin, patientOne, patientTwo] = await Promise.all([
    prisma.user.create({ data: { name: 'Demo Admin', email: 'admin@bookmydoctor.demo', phone: '01700000001', password, role: 'ADMIN' } }),
    prisma.user.create({ data: { name: 'Nusrat Jahan', email: 'nusrat@bookmydoctor.demo', phone: '01700000002', password, role: 'PATIENT' } }),
    prisma.user.create({ data: { name: 'Rahim Ahmed', email: 'rahim@bookmydoctor.demo', phone: '01700000003', password, role: 'PATIENT' } }),
  ]);

  const doctors = await Promise.all([
    prisma.doctor.create({ data: { name: 'Dr. Ayesha Rahman', specialty: 'Cardiology', hospital: 'Dhaka Heart Center', email: 'ayesha@bookmydoctor.demo', phone: '01700000101', fee: 1200, experience: 12, bio: 'Cardiologist focused on preventive care and hypertension management.', qualification: 'MBBS, MD (Cardiology)', clinicAddress: 'House 12, Road 7, Dhanmondi, Dhaka', consultationMode: 'In-person & Video', isAvailable: true } }),
    prisma.doctor.create({ data: { name: 'Dr. Tanvir Hasan', specialty: 'Dermatology', hospital: 'Square Hospital', email: 'tanvir@bookmydoctor.demo', phone: '01700000102', fee: 1000, experience: 9, bio: 'Dermatologist treating common skin, hair, and nail conditions.', qualification: 'MBBS, DDV', clinicAddress: 'Panthapath, Dhaka', consultationMode: 'In-person', isAvailable: true } }),
    prisma.doctor.create({ data: { name: 'Dr. Farzana Islam', specialty: 'Pediatrics', hospital: 'Popular Medical College Hospital', email: 'farzana@bookmydoctor.demo', phone: '01700000103', fee: 900, experience: 11, bio: 'Pediatrician dedicated to child health and family-centered care.', qualification: 'MBBS, DCH', clinicAddress: 'Shantinagar, Dhaka', consultationMode: 'In-person & Video', isAvailable: true } }),
    prisma.doctor.create({ data: { name: 'Dr. Mahmud Karim', specialty: 'Orthopedics', hospital: 'Evercare Hospital Dhaka', email: 'mahmud@bookmydoctor.demo', phone: '01700000104', fee: 1500, experience: 15, bio: 'Orthopedic specialist for joint pain, fractures, and sports injuries.', qualification: 'MBBS, MS (Orthopedics)', clinicAddress: 'Bashundhara R/A, Dhaka', consultationMode: 'In-person', isAvailable: true } }),
  ]);

  const [cardiologist, dermatologist, pediatrician, orthopedist] = doctors;
  const slots = await Promise.all([
    prisma.availability.create({ data: { doctorId: cardiologist.id, date: daysFromToday(1, 10), startTime: '10:00', endTime: '10:30' } }),
    prisma.availability.create({ data: { doctorId: cardiologist.id, date: daysFromToday(1, 11), startTime: '11:00', endTime: '11:30' } }),
    prisma.availability.create({ data: { doctorId: dermatologist.id, date: daysFromToday(2, 15), startTime: '15:00', endTime: '15:30' } }),
    prisma.availability.create({ data: { doctorId: pediatrician.id, date: daysFromToday(2, 17), startTime: '17:00', endTime: '17:30' } }),
    prisma.availability.create({ data: { doctorId: orthopedist.id, date: daysFromToday(3, 9), startTime: '09:00', endTime: '09:30' } }),
    prisma.availability.create({ data: { doctorId: orthopedist.id, date: daysFromToday(4, 16), startTime: '16:00', endTime: '16:30' } }),
  ]);

  await prisma.appointment.create({ data: { doctorId: cardiologist.id, patientId: patientOne.id, availabilityId: slots[0].id, appointmentDate: slots[0].date, reason: 'Recurring headaches and blood-pressure check', status: 'CONFIRMED' } });
  await prisma.availability.update({ where: { id: slots[0].id }, data: { isBooked: true } });
  await prisma.appointment.create({ data: { doctorId: dermatologist.id, patientId: patientTwo.id, availabilityId: slots[2].id, appointmentDate: slots[2].date, reason: 'Persistent skin rash consultation', status: 'PENDING' } });
  await prisma.availability.update({ where: { id: slots[2].id }, data: { isBooked: true } });

  await prisma.medicalRecord.create({ data: { doctorId: cardiologist.id, patientId: patientOne.id, patientPhone: patientOne.phone!, diagnosis: 'Mild hypertension', testsTaken: 'Blood pressure monitoring, ECG', notes: 'Reduce salt intake and follow up in four weeks.' } });
  await prisma.prescription.create({ data: { doctorId: cardiologist.id, patientId: patientOne.id, diagnosis: 'Mild hypertension', medicines: 'Amlodipine 5mg - once daily', instructions: 'Take after breakfast and monitor blood pressure twice weekly.' } });

  console.log(`Seeded ${doctors.length} doctors, 2 patients, 6 slots, 2 appointments, and demo medical data. Admin: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
