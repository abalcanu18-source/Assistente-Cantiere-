# Assistente Cantieri

App web per la gestione quotidiana degli operai in cantiere, con un **assistente vocale AI**:

- La mattina l'app "suona la sveglia" e l'assistente chiede all'operaio dove va a lavorare oggi.
- L'operaio risponde a voce (es. "Andiamo al cantiere di via Roma"), e l'app inizia automaticamente a registrare il tempo di lavoro.
- La sera l'app suona di nuovo, chiede cosa è stato fatto durante la giornata, e l'operaio risponde a voce.
- L'app genera automaticamente un **rapportino di lavoro in PDF** con tutti i dati della giornata e lo invia via email alla segreteria.
- Un pannello di amministrazione permette di gestire operai, mezzi di lavoro, cantieri e le impostazioni (orari sveglia, email segreteria).

## Come funziona (architettura)

Il progetto è diviso in due parti indipendenti:

- **`backend/`** — server Node.js (Express) che gestisce i dati (operai, mezzi, cantieri, rapportini), parla con l'intelligenza artificiale di OpenAI per capire le risposte vocali, genera i PDF, invia le email e manda le notifiche "sveglia" alle 6:30/17:00.
- **`frontend/`** — app web (React) pensata per essere usata dal telefono/tablet dell'operaio, tramite browser (Chrome consigliato). Può essere "installata" sulla schermata home come una app vera (PWA).

Il riconoscimento vocale (microfono → testo) e la voce dell'assistente (testo → voce) usano le funzioni **gratuite già integrate nel browser** (funzionano bene su Chrome). Il testo trascritto viene poi inviato al backend, che usa **OpenAI (GPT)** per capire davvero cosa ha detto l'operaio (a quale cantiere si riferisce, cosa ha fatto, ecc.) — questa è la parte "intelligente" dell'assistente.

## Cosa ti serve prima di iniziare

1. **Node.js** installato (versione 18 o superiore). Sul tuo PC hai già la versione 24, va benissimo.
2. Una **chiave API di OpenAI** (a pagamento, ma l'uso previsto qui è molto economico): [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. Le credenziali di un indirizzo email da cui inviare i rapportini (es. Gmail con una "Password per le app"), oppure un servizio SMTP aziendale.

## Installazione

Apri un terminale nella cartella `backend` e installa le dipendenze:

```bash
cd backend
npm install
```

Poi genera le chiavi per le notifiche push (la "sveglia" che funziona anche ad app chiusa):

```bash
npm run generate-vapid
```

Questo comando stampa due chiavi (`VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`). Tienile a portata di mano per il prossimo passo.

Ora crea il file di configurazione del backend copiando l'esempio:

```bash
copy .env.example .env
```

Apri `backend/.env` con un editor di testo e compila:

- `ADMIN_PASSWORD` — la password che userai tu per entrare nel pannello di amministrazione.
- `OPENAI_API_KEY` — la tua chiave OpenAI.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — le credenziali email per inviare i rapportini.
- `SECRETARY_EMAIL` — l'indirizzo email della segreteria che riceverà i PDF (puoi anche cambiarlo più tardi dal pannello admin).
- `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` — incolla le chiavi generate al passo precedente.

Ora passa al frontend:

```bash
cd ../frontend
npm install
copy .env.example .env
```

Apri `frontend/.env` e incolla la stessa `VAPID_PUBLIC_KEY` generata prima, nella variabile `VITE_VAPID_PUBLIC_KEY`.

## Avvio in locale (per provare l'app)

Servono **due terminali aperti contemporaneamente**:

**Terminale 1 — Backend:**

```bash
cd backend
npm run dev
```

Il server parte su `http://localhost:4000`.

**Terminale 2 — Frontend:**

```bash
cd frontend
npm run dev
```

L'app si apre su `http://localhost:5173`.

## Primo utilizzo

1. Apri `http://localhost:5173` nel browser (Chrome consigliato).
2. Nella schermata di login, clicca su **"Sono l'amministratore"** ed entra con la password scelta in `ADMIN_PASSWORD`.
3. Nel pannello admin aggiungi:
   - I **mezzi di lavoro** (furgoni, escavatori, ecc.)
   - I **cantieri** (nome + indirizzo)
   - Gli **operai** (nome + PIN a 4 cifre che useranno per accedere)
   - In **Impostazioni**, imposta gli orari della sveglia (default 06:30 e 17:00) e l'email della segreteria.
4. Torna all'app ed esci dall'area admin. Ogni operaio potrà selezionare il proprio nome e inserire il PIN per accedere.
5. Nella schermata principale, l'operaio può premere **"Attiva notifiche"** per ricevere la sveglia anche ad app chiusa.

## Usare l'app da telefono (fuori dal PC)

Per usarla su telefoni/tablet reali (non solo sul PC), devi rendere il backend raggiungibile dalla rete:

- Se i telefoni sono sulla **stessa rete Wi-Fi** del PC: trova l'indirizzo IP locale del PC (`ipconfig` su Windows, cerca "Indirizzo IPv4"), e imposta `VITE_API_URL=http://<IP-DEL-PC>:4000` nel file `frontend/.env`. Poi apri dal telefono `http://<IP-DEL-PC>:5173`.
- Per un uso reale in produzione (accessibile da internet, con sveglie affidabili anche fuori casa/ufficio), conviene pubblicare backend e frontend su un servizio di hosting (es. Render, Railway per il backend; Vercel, Netlify per il frontend) con un dominio HTTPS — necessario anche perché le notifiche push funzionano solo su connessioni sicure (HTTPS).

## Note importanti

- **Notifiche "sveglia"**: funzionano attivando il permesso di notifica dal telefono (pulsante "Attiva notifiche"). Su iPhone, le notifiche push funzionano solo se l'app viene prima "aggiunta alla schermata Home" (Safari → Condividi → Aggiungi a Home) grazie al supporto PWA. In più, finché l'app è aperta in primo piano, c'è anche una sveglia di riserva con suono e vibrazione che non richiede notifiche.
- **Dati salvati**: tutti i dati (operai, mezzi, cantieri, rapportini) sono salvati in un semplice file `backend/data/db.json`. Fai un backup periodico di questa cartella. Per un utilizzo con molti operai o su più server, in futuro si può migrare a un vero database (es. PostgreSQL).
- **Sicurezza**: questo progetto è pensato per un uso interno aziendale su una rete fidata. Il login degli operai è basato su PIN semplice: adatto per un piccolo team, ma non paragonabile a un sistema di autenticazione bancario.
- **Costi OpenAI**: ogni conversazione (mattina + sera) genera 1-2 piccole chiamate a GPT, con un costo tipicamente di pochi centesimi al mese per operaio.

## Struttura del progetto

```
tool azienda/
  backend/
    src/
      server.js          punto di ingresso del server
      db.js               gestione dati (file JSON)
      routes/             endpoint API (operai, mezzi, cantieri, voce, rapportini...)
      services/           logica AI, PDF, email, notifiche, scheduler
      middleware/         login operai/admin
    data/                 dati salvati (creato automaticamente, non versionato)
  frontend/
    src/
      pages/               schermate (Login, Assistant, History, Admin)
      api.js               chiamate al backend
      useVoice.js          gestione microfono/voce del browser
      push.js              notifiche push
    public/
      manifest.json, sw.js  configurazione PWA (installabile su telefono)
```
