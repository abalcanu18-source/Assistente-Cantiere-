import OpenAI, { toFile } from 'openai';

let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY non configurata. Aggiungila nel file .env del backend (vedi .env.example).'
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

async function askJson(systemPrompt, userPrompt) {
  const completion = await getClient().chat.completions.create({
    model: MODEL(),
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Interprets the operator's morning answer ("andiamo al cantiere via
 * roma..."). Many companies never provide a fixed list of job sites/vehicles
 * in advance, so this NEVER requires a match against `jobsites`/`vehicles`:
 * it always extracts the place/vehicle name exactly as spoken (free text).
 * If a matching entry happens to already exist in the provided lists, it
 * also links the corresponding id (useful for reporting), but that's a
 * bonus, not a requirement. It only asks to repeat if the operator didn't
 * actually say where they're going at all.
 */
export async function interpretMorning({ workerName, transcript, jobsites = [], vehicles = [] }) {
  const systemPrompt = `Sei un assistente vocale per operai edili in italiano, amichevole e diretto.
Il tuo compito la mattina è capire a QUALE cantiere/luogo di lavoro sta andando l'operaio e, se lo dice,
CON QUALE mezzo. L'operaio può nominare un cantiere QUALSIASI, anche uno mai sentito prima e non presente
negli elenchi qui sotto: in quel caso scrivi comunque il nome/luogo esattamente come lo ha detto (pulito,
senza inventare dettagli). Non rifiutare MAI una risposta solo perché il cantiere non è in elenco.
Se il nome corrisponde chiaramente a uno degli elenchi forniti, riporta anche l'id corrispondente (comodo
per i report), altrimenti lascialo null.
Rispondi SEMPRE in JSON con questa forma esatta:
{
  "jobsiteName": "<nome del cantiere/luogo di lavoro indicato dall'operaio>",
  "jobsiteId": "<id del cantiere in elenco se corrisponde, altrimenti null>",
  "vehicleName": "<nome/targa del mezzo se menzionato, altrimenti null>",
  "vehicleId": "<id del mezzo in elenco se corrisponde, altrimenti null>",
  "confident": true/false,
  "reply": "<breve frase parlata da dire all'operaio, in italiano, massimo 2 frasi>"
}
Metti "confident": false SOLO se l'operaio non ha detto affatto dove sta andando (frase incomprensibile,
vuota o fuori tema): in quel caso nella "reply" chiedi gentilmente di ripetere/specificare il cantiere.
Se ha nominato un posto qualsiasi (anche mai sentito prima), è sempre "confident": true. Tono breve, umano,
mai robotico.`;

  const userPrompt = `Operaio: ${workerName}
Frase detta dall'operaio: "${transcript}"

Cantieri già noti in azienda (id | nome | indirizzo) - usali solo per riconoscere un nome già esistente,
l'operaio può comunque nominarne uno nuovo che non è in questa lista:
${jobsites.map((j) => `${j.id} | ${j.name} | ${j.address}`).join('\n') || '(nessuno configurato ancora)'}

Mezzi già noti in azienda (id | nome):
${vehicles.map((v) => `${v.id} | ${v.name}`).join('\n') || '(nessuno configurato ancora)'}`;

  return askJson(systemPrompt, userPrompt);
}

/**
 * Interprets the operator's end-of-day answer and turns it into a clean,
 * professional summary suitable for the PDF report, plus a short spoken
 * reply to close out the day.
 */
export async function interpretEvening({ workerName, transcript, jobsiteName }) {
  const systemPrompt = `Sei un assistente vocale per operai edili in italiano.
Il tuo compito la sera è trasformare quello che l'operaio racconta a voce (informale, magari disordinato)
in un riassunto BREVE, chiaro e professionale delle attività svolte, adatto a un rapportino di lavoro
ufficiale che verrà letto in segreteria. Non inventare dettagli non detti dall'operaio.
Rispondi SEMPRE in JSON con questa forma esatta:
{
  "summary": "<riassunto professionale delle attività svolte, 1-4 frasi>",
  "reply": "<breve frase parlata di saluto/chiusura giornata per l'operaio, massimo 2 frasi>"
}`;

  const userPrompt = `Operaio: ${workerName}
Cantiere di oggi: ${jobsiteName || 'non specificato'}
Racconto dell'operaio a fine giornata: "${transcript}"`;

  return askJson(systemPrompt, userPrompt);
}

/**
 * Free-form chat: lets the operator ask the assistant literally anything
 * (not just the fixed morning/evening flow), the same way one would chat
 * with any AI assistant. Keeps a short back-and-forth using the message
 * history the frontend sends back each time (nothing persisted server-side).
 */
export async function chatReply({ workerName, history }) {
  const systemPrompt = `Sei l'assistente vocale dell'app "Assistente Cantieri", che parla in italiano con ${workerName},
un operaio edile. Sei disponibile, chiaro e diretto, e rispondi a QUALSIASI domanda ti venga fatta, anche non legata
al lavoro (un po' come faresti in una normale chat con un assistente AI). Se ti chiedono di timbrare l'inizio o la
fine della giornata, ricordagli di usare i pulsanti "Inizia giornata" / "Fine giornata" nella schermata principale
dell'app, perché questa chat libera non registra automaticamente gli orari. Rispondi in modo breve e naturale
(massimo 3-4 frasi), adatto a essere letto ad alta voce.`;

  const completion = await getClient().chat.completions.create({
    model: MODEL(),
    temperature: 0.6,
    messages: [{ role: 'system', content: systemPrompt }, ...history],
  });

  return completion.choices[0]?.message?.content?.trim() || 'Non ho capito, puoi ripetere?';
}

/**
 * Turns a short spoken recording (webm/mp4 from the phone) into Italian
 * text. Used when the browser's built-in SpeechRecognition is missing
 * (typical on iPhone) so the operator can still talk instead of typing.
 */
export async function transcribeAudio(buffer, filename = 'audio.webm') {
  const file = await toFile(buffer, filename);
  const result = await getClient().audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'it',
  });
  return result.text?.trim() || '';
}

export function isOpenAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}
