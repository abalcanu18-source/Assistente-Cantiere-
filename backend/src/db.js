import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { Redis } from '@upstash/redis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const REDIS_KEY = 'cantieri:database';

const defaultData = {
  workers: [],
  vehicles: [],
  jobsites: [],
  sessions: [],
  pushSubscriptions: [],
  settings: {
    companyName: 'La Mia Azienda',
    alarmMorning: '06:30',
    alarmEvening: '17:00',
    secretaryEmail: '',
    // 'digest' = un'unica email al giorno con tutti i rapportini allegati
    // (consigliato). 'immediate' = una email separata ogni volta che un
    // operaio finisce il turno (comportamento precedente).
    emailMode: 'digest',
    digestSendTime: '19:00',
  },
};

// On most free hosting plans (Render, Railway free tiers, etc.) the local
// disk is wiped every time the service restarts or redeploys, which would
// silently erase every worker/vehicle/cantiere/rapportino. To survive that,
// production uses a small free Upstash Redis database (persists forever,
// reachable over plain HTTPS) as the storage backend instead of a local
// file. Local development keeps using a simple JSON file so nobody needs a
// cloud account just to run `npm run dev`.
// Stores the value as a JSON *string* explicitly (rather than relying on
// the client's own auto-serialization) so read()/write() behave exactly
// the same no matter which Upstash SDK version ends up installed.
class UpstashAdapter {
  constructor(url, token) {
    this.redis = new Redis({ url, token });
  }

  async read() {
    const raw = await this.redis.get(REDIS_KEY);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  async write(data) {
    await this.redis.set(REDIS_KEY, JSON.stringify(data));
  }
}

const usingCloud = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let adapter;
if (usingCloud) {
  adapter = new UpstashAdapter(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN);
  console.log('[db] Database cloud Upstash attivo: i dati sopravvivono ai riavvii del server.');
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  adapter = new JSONFile(DB_FILE);
  console.log(`[db] Modalità sviluppo: dati salvati nel file locale ${DB_FILE}`);
}

export const db = new Low(adapter, defaultData);
await db.read();
if (!db.data) {
  db.data = structuredClone(defaultData);
}
// Make sure new settings fields introduced after first deploy still exist.
db.data.settings = { ...defaultData.settings, ...db.data.settings };
await db.write();

export function newId() {
  return uuid();
}

export default db;
