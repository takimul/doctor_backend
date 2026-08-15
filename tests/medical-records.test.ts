import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('medical records and prescriptions', () => {
  it('stores diagnosis and reports by patient phone and creates a printable prescription', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Medical Test',
        specialty: 'General Medicine',
        hospital: 'Medical Hospital',
        email: `medical-doc-${Date.now()}@example.com`,
        phone: `+91 ${1000000000 + Date.now() % 1000000000}`,
        fee: 1100,
        experience: 11,
        bio: 'Medical records doctor',
      },
    });

    const patientPhone = `+91 ${2000000000 + Date.now() % 1000000000}`;

    const patient = await prisma.user.create({
      data: {
        name: 'Medical Patient',
        email: `medical-patient-${Date.now()}@example.com`,
        password: 'hashed-secret',
        role: 'PATIENT',
        phone: patientPhone,
      },
    });

    const doctorToken = jwt.sign(
      { sub: doctor.id, email: doctor.email, role: 'DOCTOR', name: doctor.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const patientToken = jwt.sign(
      { sub: patient.id, email: patient.email, role: 'PATIENT', name: patient.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const recordResponse = await request(app)
      .post('/api/medical-records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId: patient.id,
        doctorId: doctor.id,
        patientPhone: patient.phone,
        diagnosis: 'Seasonal flu with mild dehydration',
        testsTaken: 'CBC, blood pressure, urine routine',
        notes: 'Improving with hydration and rest.',
        reportUrl: 'https://example.com/report.pdf',
        reportName: 'lab-report.pdf',
      });

    expect(recordResponse.status).toBe(201);
    expect(recordResponse.body.record.patientPhone).toBe(patient.phone);

    const lookupResponse = await request(app)
      .get(`/api/medical-records/phone/${patient.phone}`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(lookupResponse.status).toBe(200);
    expect(Array.isArray(lookupResponse.body)).toBe(true);
    expect(lookupResponse.body[0].patientId).toBe(patient.id);

    const prescriptionResponse = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId: patient.id,
        doctorId: doctor.id,
        diagnosis: 'Seasonal flu',
        medicines: 'Paracetamol 500mg, ORS sachets',
        instructions: 'Take after meals and drink fluids',
      });

    expect(prescriptionResponse.status).toBe(201);
    expect(prescriptionResponse.body.prescription.patientId).toBe(patient.id);

    const printResponse = await request(app)
      .post(`/api/prescriptions/${prescriptionResponse.body.prescription.id}/print`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(printResponse.status).toBe(200);
    expect(printResponse.headers['content-type']).toContain('application/pdf');

    const patientHistory = await request(app)
      .get(`/api/medical-records/patient/${patient.id}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(patientHistory.status).toBe(200);
    expect(Array.isArray(patientHistory.body)).toBe(true);

    const patientSummary = await request(app)
      .get(`/api/medical-records/patient/${patient.id}/summary`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(patientSummary.status).toBe(200);
    expect(patientSummary.body.patient.id).toBe(patient.id);
    expect(Array.isArray(patientSummary.body.records)).toBe(true);
    expect(Array.isArray(patientSummary.body.prescriptions)).toBe(true);
    expect(patientSummary.body.totalRecords).toBeGreaterThanOrEqual(1);

    const doctorLookup = await request(app)
      .get(`/api/medical-records/phone/${patient.phone}/doctor-summary`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(doctorLookup.status).toBe(200);
    expect(doctorLookup.body.patient.id).toBe(patient.id);
    expect(Array.isArray(doctorLookup.body.records)).toBe(true);
    expect(Array.isArray(doctorLookup.body.appointments)).toBe(true);

    const dashboardResponse = await request(app)
      .get(`/api/medical-records/patient/${patient.id}/dashboard`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.patient.id).toBe(patient.id);
    expect(Array.isArray(dashboardResponse.body.records)).toBe(true);
    expect(Array.isArray(dashboardResponse.body.prescriptions)).toBe(true);
    expect(Array.isArray(dashboardResponse.body.appointments)).toBe(true);
  });
});
