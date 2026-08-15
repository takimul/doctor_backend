import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import pdfRoutes from '../modules/pdf/pdf.routes';
import doctorRoutes from '../modules/doctor/doctor.routes';
import appointmentRoutes from '../modules/appointment/appointment.routes';
import availabilityRoutes from '../modules/availability/availability.routes';
import medicalRecordsRoutes from '../modules/medical-records/medical-records.routes';
import prescriptionsRoutes from '../modules/prescriptions/prescriptions.routes';
import adminRoutes from '../modules/admin/admin.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/pdf', pdfRoutes);
router.use('/admin', adminRoutes);
router.use('/doctors', doctorRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/availability', availabilityRoutes);
router.use('/medical-records', medicalRecordsRoutes);
router.use('/prescriptions', prescriptionsRoutes);

export default router;
