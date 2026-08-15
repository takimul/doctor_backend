import { z } from 'zod';

export const doctorSchema = z.object({
  name: z.string().trim().min(2, 'Doctor name is required'),
  specialty: z.string().trim().min(2, 'Specialty is required'),
  hospital: z.string().trim().min(2, 'Hospital is required'),
  email: z.string().trim().email('Valid email is required'),
  phone: z.string().trim().min(8, 'Phone number is required'),
  fee: z.number().min(1, 'Fee must be positive'),
  experience: z.number().min(0),
  bio: z.string().trim().min(10).optional(),
  qualification: z.string().trim().min(2).optional(),
  clinicAddress: z.string().trim().min(3).optional(),
  consultationMode: z.string().trim().min(2).optional(),
  profileImageUrl: z.string().url().optional().or(z.literal('')),
  clinicImageUrl: z.string().url().optional().or(z.literal('')),
  isAvailable: z.boolean().optional().default(true),
});

export const doctorUpdateSchema = doctorSchema.partial();

export type DoctorInput = z.infer<typeof doctorSchema>;
