import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { rescheduleAlarms } from '../services/scheduler.js';

const router = Router();

// Public GET: the frontend needs alarm times + company name for the UI
// even before anyone logs in.
router.get('/', (req, res) => {
  res.json(db.data.settings);
});

router.put('/', requireAdmin, async (req, res) => {
  const { companyName, alarmMorning, alarmEvening, secretaryEmail, emailMode, digestSendTime } = req.body;

  if (companyName !== undefined) db.data.settings.companyName = companyName;
  if (alarmMorning !== undefined) db.data.settings.alarmMorning = alarmMorning;
  if (alarmEvening !== undefined) db.data.settings.alarmEvening = alarmEvening;
  if (secretaryEmail !== undefined) db.data.settings.secretaryEmail = secretaryEmail;
  if (emailMode !== undefined) db.data.settings.emailMode = emailMode;
  if (digestSendTime !== undefined) db.data.settings.digestSendTime = digestSendTime;

  await db.write();
  rescheduleAlarms();
  res.json(db.data.settings);
});

export default router;
