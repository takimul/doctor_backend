import request from 'supertest';
import app from '../src/app';

describe('POST /api/pdf/generate', () => {
  it('returns a PDF file with the generated content', async () => {
    const response = await request(app)
      .post('/api/pdf/generate')
      .send({
        title: 'BookMyDoctor Testing Guide',
        content: `This document contains the backend testing instructions and completed work status for the BookMyDoctor project.\n\n1. Start the server with npm run dev\n2. Test the health route\n3. Register a user\n4. Login with the created user\n5. Create a doctor\n6. Book an appointment\n7. Verify the appointment response\n8. Review the PDF route output.`,
        fileName: 'bookmydoctor-testing-guide.pdf',
      });

    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment; filename="bookmydoctor-testing-guide.pdf"');
    expect(response.body).toBeInstanceOf(Buffer);
  });
});
