import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('patient report upload', () => {
  it('uploads a patient report and saves the record with the uploaded file metadata', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Upload Test',
        specialty: 'Radiology',
        hospital: 'Upload Hospital',
        email: `upload-doc-${Date.now()}@example.com`,
        phone: `+91 ${3000000000 + Date.now() % 1000000000}`,
        fee: 1300,
        experience: 14,
        bio: 'Upload test doctor',
      },
    });

    const patientPhone = `+91 ${4000000000 + Date.now() % 1000000000}`;

    const patient = await prisma.user.create({
      data: {
        name: 'Upload Patient',
        email: `upload-patient-${Date.now()}@example.com`,
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

    const response = await request(app)
      .post('/api/medical-records/upload-report')
      .set('Authorization', `Bearer ${doctorToken}`)
      .field('patientId', patient.id)
      .field('doctorId', doctor.id)
      .field('patientPhone', patient.phone)
      .field('diagnosis', 'Chest infection follow-up')
      .field('testsTaken', 'X-ray, CBC')
      .field('notes', 'Report uploaded by patient')
      .attach('reportFile', Buffer.from('x-ray report data'), 'xray-report.txt');

    expect(response.status).toBe(201);
    expect(response.body.record.reportUrl).toContain('/uploads/reports/');
    expect(response.body.record.reportName).toBe('xray-report.txt');
  });
});
