import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest, requireAuth } from '../../middleware/auth';

const router = Router();
const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
});
const upload = multer({ storage });

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const medicalRecordSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  patientPhone: z.string().min(8),
  diagnosis: z.string().min(3),
  testsTaken: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  reportUrl: z.string().url().optional().or(z.literal('')),
  reportName: z.string().optional().or(z.literal('')),
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = medicalRecordSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const { patientId, doctorId, patientPhone, diagnosis, testsTaken, notes, reportUrl, reportName } = parsed.data;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only add records for your own patient profile' });
  }

  const patient = await prisma.user.findUnique({ where: { id: patientId } });
  if (!patient) {
    return res.status(404).json({ message: 'Patient not found' });
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
  }

  const record = await prisma.medicalRecord.create({
    data: {
      patientId,
      doctorId,
      patientPhone,
      diagnosis,
      testsTaken: testsTaken || '',
      notes: notes || '',
      reportUrl: reportUrl || '',
      reportName: reportName || '',
    },
    include: {
      patient: true,
      doctor: true,
    },
  });

  return res.status(201).json({
    message: 'Medical record created successfully',
    record,
  });
});

router.post('/upload-report', requireAuth, upload.single('reportFile'), async (req: AuthenticatedRequest, res) => {
  const patientId = typeof req.body?.patientId === 'string' ? req.body.patientId : '';
  const doctorId = typeof req.body?.doctorId === 'string' ? req.body.doctorId : '';
  const patientPhone = typeof req.body?.patientPhone === 'string' ? req.body.patientPhone : '';
  const diagnosis = typeof req.body?.diagnosis === 'string' ? req.body.diagnosis : '';
  const testsTaken = typeof req.body?.testsTaken === 'string' ? req.body.testsTaken : '';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';

  if (!patientId || !doctorId || !patientPhone || !diagnosis) {
    return res.status(400).json({ message: 'patientId, doctorId, patientPhone and diagnosis are required' });
  }

  const file = req.file;
  const fileName = file?.originalname || 'uploaded-report.txt';
  const reportUrl = file ? `/uploads/reports/${file.filename}` : '';

  const patient = await prisma.user.findUnique({ where: { id: patientId } });
  if (!patient) {
    return res.status(404).json({ message: 'Patient not found' });
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
  }

  const record = await prisma.medicalRecord.create({
    data: {
      patientId,
      doctorId,
      patientPhone,
      diagnosis,
      testsTaken,
      notes,
      reportUrl,
      reportName: fileName,
    },
    include: {
      patient: true,
      doctor: true,
    },
  });

  return res.status(201).json({
    message: 'Report uploaded successfully',
    record,
  });
});

router.get('/phone/:phone', requireAuth, async (req: AuthenticatedRequest, res) => {
  const phone = Array.isArray(req.params.phone) ? req.params.phone[0] : req.params.phone;

  const records = await prisma.medicalRecord.findMany({
    where: { patientPhone: phone },
    include: {
      patient: true,
      doctor: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json(records);
});

router.get('/patient/:patientId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const patientId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only view your own medical history' });
  }

  const records = await prisma.medicalRecord.findMany({
    where: { patientId },
    include: {
      patient: true,
      doctor: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json(records);
});

router.get('/patient/:patientId/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const patientId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only view your own medical summary' });
  }

  const [patient, records, prescriptions] = await Promise.all([
    prisma.user.findUnique({ where: { id: patientId } }),
    prisma.medicalRecord.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (!patient) {
    return res.status(404).json({ message: 'Patient not found' });
  }

  return res.status(200).json({
    patient: {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
    },
    records,
    prescriptions,
    totalRecords: records.length,
    totalPrescriptions: prescriptions.length,
  });
});

router.get('/phone/:phone/doctor-summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const phone = Array.isArray(req.params.phone) ? req.params.phone[0] : req.params.phone;

  const patient = await prisma.user.findUnique({
    where: { phone },
  });

  if (!patient) {
    return res.status(404).json({ message: 'Patient not found by phone number' });
  }

  if (req.user?.role === 'PATIENT' && req.user.sub !== patient.id) {
    return res.status(403).json({ message: 'You can only view your own medical summary' });
  }

  const [records, prescriptions, appointments] = await Promise.all([
    prisma.medicalRecord.findMany({
      where: { patientId: patient.id },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.prescription.findMany({
      where: { patientId: patient.id },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.appointment.findMany({
      where: { patientId: patient.id },
      include: { doctor: true },
      orderBy: { appointmentDate: 'desc' },
    }),
  ]);

  return res.status(200).json({
    patient: {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
    },
    records,
    prescriptions,
    appointments,
    totalRecords: records.length,
    totalPrescriptions: prescriptions.length,
    totalAppointments: appointments.length,
  });
});

router.get('/patient/:patientId/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
  const patientId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only view your own dashboard' });
  }

  const [patient, records, prescriptions, appointments] = await Promise.all([
    prisma.user.findUnique({ where: { id: patientId } }),
    prisma.medicalRecord.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.appointment.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { appointmentDate: 'desc' },
    }),
  ]);

  if (!patient) {
    return res.status(404).json({ message: 'Patient not found' });
  }

  return res.status(200).json({
    patient: {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
    },
    records,
    prescriptions,
    appointments,
    totalRecords: records.length,
    totalPrescriptions: prescriptions.length,
    totalAppointments: appointments.length,
  });
});

router.get('/patient/:patientId/encounter-summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const patientId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only view your own encounter summary' });
  }

  const [patient, records, prescriptions, appointments] = await Promise.all([
    prisma.user.findUnique({ where: { id: patientId } }),
    prisma.medicalRecord.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.appointment.findMany({
      where: { patientId },
      include: { doctor: true },
      orderBy: { appointmentDate: 'desc' },
    }),
  ]);

  if (!patient) {
    return res.status(404).json({ message: 'Patient not found' });
  }

  const latestRecord = records[0] ?? null;
  const latestPrescription = prescriptions[0] ?? null;
  const latestAppointment = appointments[0] ?? null;

  return res.status(200).json({
    patient: {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
    },
    latestRecord,
    latestPrescription,
    latestAppointment,
    records,
    prescriptions,
    appointments,
    summary: {
      totalRecords: records.length,
      totalPrescriptions: prescriptions.length,
      totalAppointments: appointments.length,
      lastDiagnosis: latestRecord?.diagnosis ?? null,
      lastMedicine: latestPrescription?.medicines ?? null,
      lastVisit: latestAppointment?.appointmentDate ?? null,
    },
  });
});

export default router;
