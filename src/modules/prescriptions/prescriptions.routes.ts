import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest, requireAuth } from '../../middleware/auth';

const router = Router();

const prescriptionSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  diagnosis: z.string().min(3),
  medicines: z.string().min(3),
  instructions: z.string().min(3),
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = prescriptionSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const { patientId, doctorId, diagnosis, medicines, instructions } = parsed.data;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only create prescriptions for your own record' });
  }

  const patient = await prisma.user.findUnique({ where: { id: patientId } });
  if (!patient) {
    return res.status(404).json({ message: 'Patient not found' });
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
  }

  const prescription = await prisma.prescription.create({
    data: {
      patientId,
      doctorId,
      diagnosis,
      medicines,
      instructions,
    },
    include: {
      patient: true,
      doctor: true,
    },
  });

  return res.status(201).json({
    message: 'Prescription created successfully',
    prescription,
  });
});

router.get('/patient/:patientId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const patientId = Array.isArray(req.params.patientId) ? req.params.patientId[0] : req.params.patientId;

  if (req.user?.role === 'PATIENT' && req.user.sub !== patientId) {
    return res.status(403).json({ message: 'You can only view your own prescriptions' });
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { patientId },
    include: { patient: true, doctor: true },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json(prescriptions);
});

router.post('/:id/print', requireAuth, async (req: AuthenticatedRequest, res) => {
  const prescriptionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { patient: true, doctor: true },
  });

  if (!prescription) {
    return res.status(404).json({ message: 'Prescription not found' });
  }

  if (req.user?.role === 'PATIENT' && req.user.sub !== prescription.patientId) {
    return res.status(403).json({ message: 'You can only print your own prescriptions' });
  }

  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescription.id}.pdf"`);
    res.status(200).send(pdf);
  });

  doc.fontSize(20).text('Prescription', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Doctor: ${prescription.doctor.name}`);
  doc.text(`Hospital: ${prescription.doctor.hospital}`);
  doc.text(`Patient: ${prescription.patient.name}`);
  doc.text(`Diagnosis: ${prescription.diagnosis}`);
  doc.moveDown();
  doc.fontSize(13).text('Medicines');
  doc.fontSize(11).text(prescription.medicines);
  doc.moveDown();
  doc.fontSize(13).text('Instructions');
  doc.fontSize(11).text(prescription.instructions);
  doc.end();
});

export default router;
