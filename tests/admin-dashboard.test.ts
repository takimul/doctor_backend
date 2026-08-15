import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('admin dashboard', () => {
  it('returns summary stats and recent records for admin', async () => {
    const admin = await prisma.user.create({
      data: {
        name: 'Admin Dashboard User',
        email: `admin-dashboard-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'ADMIN',
        phone: `+91 ${9000000000 + (Date.now() % 1000000000)}`,
      },
    });

    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Admin Dashboard',
        specialty: 'Cardiology',
        hospital: 'City Care Hospital',
        email: `admin-dashboard-doc-${Date.now()}@example.com`,
        phone: `+91 ${9100000000 + (Date.now() % 1000000000)}`,
        fee: 1200,
        experience: 10,
        bio: 'Admin dashboard doctor',
      },
    });

    const patientOne = await prisma.user.create({
      data: {
        name: 'Patient One',
        email: `admin-patient-one-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
        phone: `+91 ${9200000000 + (Date.now() % 1000000000)}`,
      },
    });

    const patientTwo = await prisma.user.create({
      data: {
        name: 'Patient Two',
        email: `admin-patient-two-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
        phone: `+91 ${9300000000 + (Date.now() % 1000000000)}`,
      },
    });

    await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patientOne.id,
        appointmentDate: new Date(),
        reason: 'Chest pain checkup',
        status: 'PENDING',
      },
    });

    await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patientTwo.id,
        appointmentDate: new Date(Date.now() + 60 * 60 * 1000),
        reason: 'Follow-up consultation',
        status: 'CONFIRMED',
      },
    });

    await prisma.medicalRecord.create({
      data: {
        patientId: patientOne.id,
        doctorId: doctor.id,
        patientPhone: patientOne.phone ?? '+91 9200000000',
        diagnosis: 'Hypertension follow-up',
        testsTaken: 'Blood pressure test',
        notes: 'Needs regular monitoring',
      },
    });

    const adminToken = jwt.sign(
      { sub: admin.id, email: admin.email, role: 'ADMIN', name: admin.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.summary.totalDoctors).toBeGreaterThanOrEqual(1);
    expect(response.body.summary.totalPatients).toBeGreaterThanOrEqual(2);
    expect(response.body.summary.totalAppointments).toBeGreaterThanOrEqual(2);
    expect(response.body.summary.pendingAppointments).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(response.body.recentAppointments)).toBe(true);
    expect(Array.isArray(response.body.recentRecords)).toBe(true);
  });

  it('allows admin to list doctors, list patients, and toggle doctor availability', async () => {
    const admin = await prisma.user.create({
      data: {
        name: 'Admin Management User',
        email: `admin-management-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'ADMIN',
        phone: `+91 ${9400000000 + (Date.now() % 1000000000)}`,
      },
    });

    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Management',
        specialty: 'Neurology',
        hospital: 'NeuroCare Hospital',
        email: `admin-management-doc-${Date.now()}@example.com`,
        phone: `+91 ${9500000000 + (Date.now() % 1000000000)}`,
        fee: 1400,
        experience: 9,
        bio: 'Doctor management test',
        isAvailable: true,
      },
    });

    const patient = await prisma.user.create({
      data: {
        name: 'Patient Management',
        email: `admin-management-patient-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
        phone: `+91 ${9600000000 + (Date.now() % 1000000000)}`,
      },
    });

    const adminToken = jwt.sign(
      { sub: admin.id, email: admin.email, role: 'ADMIN', name: admin.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const doctorsResponse = await request(app)
      .get('/api/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(doctorsResponse.status).toBe(200);
    expect(Array.isArray(doctorsResponse.body)).toBe(true);

    const patientsResponse = await request(app)
      .get('/api/admin/patients')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(patientsResponse.status).toBe(200);
    expect(Array.isArray(patientsResponse.body)).toBe(true);
    expect(patientsResponse.body.some((item: any) => item.id === patient.id)).toBe(true);

    const toggleResponse = await request(app)
      .patch(`/api/admin/doctors/${doctor.id}/toggle-availability`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(toggleResponse.status).toBe(200);
    expect(toggleResponse.body.doctor.isAvailable).toBe(false);
  });

  it('supports doctor search with pagination metadata', async () => {
    const doctorA = await prisma.doctor.create({
      data: {
        name: 'Dr. Search Cardiology',
        specialty: 'Cardiology',
        hospital: 'Heart Center',
        email: `search-cardiology-${Date.now()}@example.com`,
        phone: `+91 ${9700000000 + (Date.now() % 1000000000)}`,
        fee: 1500,
        experience: 12,
        bio: 'Search test cardiology doctor',
        isAvailable: true,
      },
    });

    await prisma.doctor.create({
      data: {
        name: 'Dr. Search Dermatology',
        specialty: 'Dermatology',
        hospital: 'Skin Care Clinic',
        email: `search-dermatology-${Date.now()}@example.com`,
        phone: `+91 ${9800000000 + (Date.now() % 1000000000)}`,
        fee: 1300,
        experience: 8,
        bio: 'Search test dermatology doctor',
        isAvailable: true,
      },
    });

    const searchResponse = await request(app)
      .get('/api/doctors/search')
      .query({ query: 'cardio', page: 1, limit: 10 });

    expect(searchResponse.status).toBe(200);
    expect(Array.isArray(searchResponse.body.data)).toBe(true);
    expect(searchResponse.body.pagination).toBeDefined();
    expect(searchResponse.body.pagination.page).toBe(1);
    expect(searchResponse.body.pagination.limit).toBe(10);
    expect(searchResponse.body.data.some((doctor: any) => doctor.id === doctorA.id)).toBe(true);
  });
});
