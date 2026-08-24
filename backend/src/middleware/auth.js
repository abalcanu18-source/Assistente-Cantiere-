import { newId } from '../db.js';

// Simple in-memory session store: token -> workerId. Good enough for a
// small internal crew app; if the server restarts, operators just log in
// again (one tap on their name + PIN).
const workerSessions = new Map();

export function createWorkerSession(workerId) {
  const token = newId();
  workerSessions.set(token, workerId);
  return token;
}

export function getWorkerIdFromToken(token) {
  return token ? workerSessions.get(token) || null : null;
}

export function requireWorker(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;
  const workerId = getWorkerIdFromToken(token);

  if (!workerId) {
    return res.status(401).json({ error: 'Sessione non valida. Effettua di nuovo il login.' });
  }

  req.workerId = workerId;
  next();
}

export function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Password amministratore non valida.' });
  }
  next();
}
