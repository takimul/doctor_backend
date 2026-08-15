import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';

const router = Router();

const pdfSchema = z.object({
  title: z.string().min(2),
  content: z.string().min(10),
  fileName: z.string().min(3).optional(),
});

router.post('/generate', (req, res) => {
  const parsed = pdfSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: parsed.error.flatten(),
    });
  }

  const { title, content, fileName } = parsed.data;
  const safeFileName = fileName || `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`;

  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.status(201).send(pdfBuffer);
  });

  doc.fontSize(22).text(title, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(content, { align: 'left', lineGap: 6 });
  doc.end();
});

router.get('/download/:fileName', (req, res) => {
  const { fileName } = req.params;

  if (!fileName || !fileName.endsWith('.pdf')) {
    return res.status(400).json({ message: 'Invalid PDF file name' });
  }

  const doc = new PDFDocument();
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(pdfBuffer);
  });

  doc.fontSize(20).text('BookMyDoctor', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Download request for ${fileName}`, { align: 'left' });
  doc.end();
});

export default router;
