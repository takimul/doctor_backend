import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import router from './routes';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'BookMyDoctor API',
    version: '1.0.0',
    status: 'running',
    routes: {
      health: '/health',
      auth: '/api/auth',
      pdf: '/api/pdf',
    },
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', router);

app.use((_req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: _req.originalUrl,
  });
});

export default app;
