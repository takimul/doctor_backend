import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import { env } from '../src/config/env';

describe('doctor profile setup with image uploads', () => {
  it('uploads profile and clinic images and stores them on the doctor profile', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Profile Setup',
        specialty: 'Neurology',
        hospital: 'Mind Care Hospital',
        email: `doctor-profile-${Date.now()}@example.com`,
        phone: `+91 ${5000000000 + Date.now() % 1000000000}`,
        fee: 1800,
        experience: 12,
        bio: 'Neurology specialist with a focus on patient care.',
      },
    });

    const token = jwt.sign(
      { sub: doctor.id, email: doctor.email, role: 'DOCTOR', name: doctor.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const response = await request(app)
      .post('/api/doctors/setup-profile')
      .set('Authorization', `Bearer ${token}`)
      .field('doctorId', doctor.id)
      .field('specialty', 'Neurology')
      .field('hospital', 'Mind Care Hospital')
      .field('fee', '1800')
      .field('experience', '12')
      .field('bio', 'Neurology specialist with a focus on patient care and long-term treatment.')
      .field('qualification', 'MD Neurology')
      .field('clinicAddress', '45 Wellness Avenue, New City')
      .field('consultationMode', 'In-person and online')
      .attach('profileImage', Buffer.from('profile-image-data'), 'profile.jpg')
      .attach('clinicImage', Buffer.from('clinic-image-data'), 'clinic.jpg');

    expect(response.status).toBe(201);
    expect(response.body.doctor.profileImageUrl).toContain('/uploads/doctors/');
    expect(response.body.doctor.clinicImageUrl).toContain('/uploads/doctors/');
    expect(response.body.doctor.qualification).toBe('MD Neurology');
    expect(response.body.doctor.clinicAddress).toBe('45 Wellness Avenue, New City');
  });

  it('returns the doctor profile and summary for the logged-in doctor dashboard', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Dashboard Profile',
        specialty: 'Cardiology',
        hospital: 'Heart Care Clinic',
        email: `doctor-dashboard-${Date.now()}@example.com`,
        phone: `+91 ${6000000000 + Date.now() % 1000000000}`,
        fee: 1500,
        experience: 10,
        bio: 'Cardiology specialist focused on preventive care.',
        qualification: 'MBBS, MD Cardiology',
        clinicAddress: '22 Heart Lane',
        consultationMode: 'Online and in person',
        profileImageUrl: '/uploads/doctors/dashboard-profile.jpg',
        clinicImageUrl: '/uploads/doctors/dashboard-clinic.jpg',
      },
    });

    const token = jwt.sign(
      { sub: doctor.id, email: doctor.email, role: 'DOCTOR', name: doctor.name },
      env.jwtSecret,
      { expiresIn: '1h' },
    );

    const response = await request(app)
      .get('/api/doctors/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.doctor.id).toBe(doctor.id);
    expect(response.body.doctor.profileImageUrl).toContain('/uploads/doctors/');
    expect(response.body.summary).toHaveProperty('doctorId');
  });

  it('returns the public doctor profile card for patient booking screens', async () => {
    const doctor = await prisma.doctor.create({
      data: {
        name: 'Dr. Public Card',
        specialty: 'Orthopedics',
        hospital: 'Bone Health Center',
        email: `doctor-public-${Date.now()}@example.com`,
        phone: `+91 ${7000000000 + Date.now() % 1000000000}`,
        fee: 1700,
        experience: 15,
        bio: 'Orthopedic specialist with a patient-first approach.',
        qualification: 'MS Orthopedics',
        clinicAddress: '88 Bone Road',
        consultationMode: 'Clinic visits only',
        profileImageUrl: '/uploads/doctors/public-profile.jpg',
        clinicImageUrl: '/uploads/doctors/public-clinic.jpg',
      },
    });

    const slot = await prisma.availability.create({
      data: {
        doctorId: doctor.id,
        date: new Date('2026-10-20T00:00:00.000Z'),
        startTime: '09:00',
        endTime: '09:30',
        isBooked: false,
      },
    });

    const response = await request(app).get(`/api/doctors/public/${doctor.id}`);

    expect(response.status).toBe(200);
    expect(response.body.doctor.id).toBe(doctor.id);
    expect(response.body.doctor.profileImageUrl).toContain('/uploads/doctors/');
    expect(response.body.doctor.specialty).toBe('Orthopedics');
    expect(Array.isArray(response.body.availability)).toBe(true);
    expect(response.body.availability.some((item: any) => item.id === slot.id)).toBe(true);
  });
});
