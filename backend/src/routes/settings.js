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
  const {
    companyName,
    alarmMorning,
    alarmEvening,
    alarmEvening2,
    secretaryEmail,
    emailMode,
    digestSendTime,
    workDayStart,
    workDayEnd,
    weekdaysOnly,
  } = req.body;

  if (companyName !== undefined) db.data.settings.companyName = companyName;
  if (alarmMorning !== undefined) db.data.settings.alarmMorning = alarmMorning;
  if (alarmEvening !== undefined) db.data.settings.alarmEvening = alarmEvening;
  if (alarmEvening2 !== undefined) db.data.settings.alarmEvening2 = alarmEvening2;
  if (secretaryEmail !== undefined) db.data.settings.secretaryEmail = secretaryEmail;
  if (emailMode !== undefined) db.data.settings.emailMode = emailMode;
  if (digestSendTime !== undefined) db.data.settings.digestSendTime = digestSendTime;
  if (workDayStart !== undefined) db.data.settings.workDayStart = workDayStart;
  if (workDayEnd !== undefined) db.data.settings.workDayEnd = workDayEnd;
  if (weekdaysOnly !== undefined) db.data.settings.weekdaysOnly = weekdaysOnly;

  await db.write();
  rescheduleAlarms();
  res.json(db.data.settings);
});

export default router;
