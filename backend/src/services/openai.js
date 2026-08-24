import OpenAI from 'openai';

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
 * roma...") against the real list of job sites/vehicles, and produces a
 * short spoken confirmation. If it can't confidently match a job site, it
 * asks the operator to repeat/clarify instead of guessing.
 */
export async function interpretMorning({ workerName, transcript, jobsites, vehicles }) {
  const systemPrompt = `Sei un assistente vocale per operai edili in italiano, amichevole e diretto.
Il tuo compito la mattina è capire a QUALE cantiere e con QUALE mezzo (se menzionato) sta andando l'operaio,
scegliendo SOLO tra gli elenchi forniti (non inventare nomi nuovi).
Rispondi SEMPRE in JSON con questa forma esatta:
{
  "jobsiteId": "<id del cantiere scelto oppure null>",
  "vehicleId": "<id del mezzo scelto oppure null>",
  "confident": true/false,
  "reply": "<breve frase parlata da dire all'operaio, in italiano, massimo 2 frasi>"
}
Se non riesci a capire con certezza il cantiere, metti "confident": false e nella "reply" chiedi di ripetere
in modo semplice, elencando magari 2-3 opzioni plausibili. Se capisci il cantiere ma non il mezzo, va bene
comunque "confident": true con "vehicleId": null. Usa un tono breve, umano, mai robotico.`;

  const userPrompt = `Operaio: ${workerName}
Frase detta dall'operaio: "${transcript}"

Cantieri disponibili (id | nome | indirizzo):
${jobsites.map((j) => `${j.id} | ${j.name} | ${j.address}`).join('\n') || '(nessuno configurato)'}

Mezzi disponibili (id | nome):
${vehicles.map((v) => `${v.id} | ${v.name}`).join('\n') || '(nessuno configurato)'}`;

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

export function isOpenAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}
