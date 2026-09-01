import 'dotenv/config';

import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import workersRoutes from './routes/workers.js';
import vehiclesRoutes from './routes/vehicles.js';
import jobsitesRoutes from './routes/jobsites.js';
import settingsRoutes from './routes/settings.js';
import voiceRoutes from './routes/voice.js';
import pushRoutes from './routes/push.js';
import reportsRoutes from './routes/reports.js';

import { rescheduleAlarms } from './services/scheduler.js';
import { isOpenAiConfigured } from './services/openai.js';
import { isEmailConfigured } from './services/email.js';
import { isPushConfigured } from './services/push.js';

const app = express();

// In local development Vite may pick a different port if 5173 is busy
// (5174, 5175, ...), so allow any localhost/127.0.0.1 origin. In
// production, allow the explicitly configured FRONTEND_ORIGIN plus any
// *.onrender.com subdomain as a convenience fallback (this app is only
// deployed there, so it's a safe, narrow allowance).
const allowedOrigin = process.env.FRONTEND_ORIGIN;
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/.test(origin) ||
        /^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)
      ) {
        return callback(null, true);
      }
      if (allowedOrigin && origin === allowedOrigin) {
        return callback(null, true);
      }
      callback(new Error('Origine non consentita da CORS'));
    },
  })
);
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    timezone: process.env.TZ || 'Europe/Rome',
    openAiConfigured: isOpenAiConfigured(),
    emailConfigured: isEmailConfigured(),
    pushConfigured: isPushConfigured(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/jobsites', jobsitesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/reports', reportsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server.' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`\nAssistente Cantieri - backend avviato su http://localhost:${PORT}`);
  if (!isOpenAiConfigured()) {
    console.warn('[avviso] OPENAI_API_KEY non configurata: l\'assistente vocale non funzionerà finché non la imposti nel file .env.');
  }
  if (!isEmailConfigured()) {
    console.warn('[avviso] Email non configurata: i rapportini PDF non verranno inviati automaticamente (SMTP_* mancanti nel file .env).');
  }
  rescheduleAlarms();
});
