import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { isVoiceSupported, useVoice, getAvailableVoices, onVoicesReady, getSavedVoiceName, saveVoiceName } from '../useVoice.js';
import { setupPushNotifications } from '../push.js';
import { playAlarmBeeps } from '../beep.js';

function isNowNear(hhmm, windowMinutes = 5) {
  if (!hhmm) return false;
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  const diffMinutes = Math.abs(now - target) / 60000;
  return diffMinutes <= windowMinutes;
}

export default function Assistant({ workerName }) {
  const { listen, speak, isListening, interimTranscript } = useVoice();

  const [status, setStatus] = useState(null); // { openSession, lastCompletedSession }
  const [settings, setSettings] = useState({});
  const [phase, setPhase] = useState('idle'); // idle | speaking | listening | thinking | done | error
  const [conversationType, setConversationType] = useState(null); // morning | evening
  const [assistantMessage, setAssistantMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [micNotice, setMicNotice] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [alarmActive, setAlarmActive] = useState(null); // 'morning' | 'evening' | null
  const [pushEnabled, setPushEnabled] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(getSavedVoiceName());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const alarmFiredRef = useRef({ morning: null, evening: null });

  const refreshStatus = useCallback(() => {
    api.voiceStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = onVoicesReady(() => setVoices(getAvailableVoices()));
    return unsubscribe;
  }, []);

  function changeVoice(name) {
    setSelectedVoice(name);
    saveVoiceName(name);
  }

  function testVoice() {
    speak('Ciao, questa è la mia voce. Dove andiamo oggi?');
  }

  useEffect(() => {
    refreshStatus();
    api.getSettings().then(setSettings).catch(() => {});
  }, [refreshStatus]);

  // Foreground fallback "alarm": works even without push permission, as
  // long as the app is open. Checks every 20s if we've just crossed the
  // configured morning/evening time and haven't already fired today.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!settings.alarmMorning && !settings.alarmEvening) return;
      const todayKey = new Date().toISOString().slice(0, 10);

      if (isNowNear(settings.alarmMorning, 1) && alarmFiredRef.current.morning !== todayKey && !status?.openSession) {
        alarmFiredRef.current.morning = todayKey;
        triggerAlarm('morning');
      }
      if (
        isNowNear(settings.alarmEvening, 1) &&
        alarmFiredRef.current.evening !== todayKey &&
        status?.openSession
      ) {
        alarmFiredRef.current.evening = todayKey;
        triggerAlarm('evening');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 20000);
    return () => clearInterval(interval);
  }, [settings, status]);

  // Push notifications tapped while the app was closed/backgrounded.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'alarm-tapped') {
        triggerAlarm(event.data.alarmType === 'evening' ? 'evening' : 'morning');
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  function triggerAlarm(type) {
    setAlarmActive(type);
    playAlarmBeeps(4);
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  }

  async function enablePush() {
    const ok = await setupPushNotifications();
    setPushEnabled(ok);
  }

  async function dismissAlarmAndStart() {
    const type = alarmActive;
    setAlarmActive(null);
    await startConversation(type);
  }

  async function cancelShift() {
    if (!status?.openSession) return;
    if (!confirm('Annullare il turno di oggi? (es. hai sbagliato a dire il cantiere) Potrai ricominciare da capo.')) return;
    try {
      await api.deleteReport(status.openSession.id);
      refreshStatus();
    } catch (err) {
      setErrorMessage(err.message);
    }
  }

  async function startConversation(type) {
    setConversationType(type);
    setErrorMessage('');
    setMicNotice('');
    setTypedAnswer('');
    setLastResult(null);
    setPhase('speaking');

    const greeting =
      type === 'morning'
        ? `Ciao ${workerName}, dove andiamo oggi?`
        : `Ciao ${workerName}, hai finito la giornata di lavoro? Cosa hai fatto oggi?`;

    setAssistantMessage(greeting);
    await speak(greeting);
    enterAwaitingAnswer(type);
  }

  // Shows the "answer me" state (mic + text input) and, if a microphone is
  // available, tries to start listening automatically in the background.
  // A missing/denied microphone never blocks the flow: the operator can
  // always just type the answer instead.
  function enterAwaitingAnswer(type) {
    setPhase('listening');
    setMicNotice('');
    if (!isVoiceSupported()) return;

    listen()
      .then((transcript) => {
        if (transcript && transcript.trim()) {
          processAnswer(type, transcript.trim());
        }
      })
      .catch((err) => {
        setMicNotice(
          `Microfono non disponibile (${err.message}). Scrivi la risposta qui sotto.`
        );
      });
  }

  function submitTypedAnswer(e) {
    e.preventDefault();
    const text = typedAnswer.trim();
    if (!text) return;
    processAnswer(conversationType, text);
  }

  async function processAnswer(type, transcript) {
    setTypedAnswer('');
    setPhase('thinking');
    try {
      const result = type === 'morning' ? await api.startDay(transcript) : await api.endDay(transcript);

      if (result.needsClarification) {
        setAssistantMessage(result.reply);
        setPhase('speaking');
        await speak(result.reply);
        enterAwaitingAnswer(type);
        return;
      }

      setAssistantMessage(result.reply);
      setLastResult(result);
      setPhase('speaking');
      await speak(result.reply);
      setPhase('done');
      refreshStatus();
    } catch (err) {
      setErrorMessage(err.message);
      setPhase('error');
    }
  }

  // Free chat: "chiedi qualsiasi cosa all'assistente", separate from the
  // fixed morning/evening flow above. Talk to it just like any AI chat.
  function openChat() {
    setChatOpen(true);
    setChatInput('');
    const greeting = `Ciao ${workerName}, dimmi pure, chiedimi quello che vuoi.`;
    setChatMessages([{ role: 'assistant', content: greeting }]);
    speak(greeting);
  }

  function closeChat() {
    setChatOpen(false);
    setChatMessages([]);
    setChatInput('');
  }

  async function sendChat(text) {
    const trimmed = text.trim();
    if (!trimmed || chatBusy) return;
    const withUser = [...chatMessages, { role: 'user', content: trimmed }];
    setChatMessages(withUser);
    setChatInput('');
    setChatBusy(true);
    try {
      const { reply } = await api.chat(withUser);
      setChatMessages([...withUser, { role: 'assistant', content: reply }]);
      await speak(reply);
    } catch (err) {
      setChatMessages([...withUser, { role: 'assistant', content: `⚠️ ${err.message}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  function submitChat(e) {
    e.preventDefault();
    sendChat(chatInput);
  }

  function listenForChat() {
    if (!isVoiceSupported()) return;
    listen()
      .then((transcript) => {
        if (transcript && transcript.trim()) sendChat(transcript.trim());
      })
      .catch((err) => setMicNotice(`Microfono non disponibile (${err.message}).`));
  }

  function reset() {
    setPhase('idle');
    setConversationType(null);
    setAssistantMessage('');
    setErrorMessage('');
    setMicNotice('');
    setTypedAnswer('');
    setLastResult(null);
  }

  const hasOpenSession = Boolean(status?.openSession);

  return (
    <div className="assistant-screen">
      {alarmActive && (
        <div className="alarm-overlay">
          <div className="alarm-pulse">🔔</div>
          <h2>{alarmActive === 'morning' ? 'Buongiorno!' : 'Fine giornata!'}</h2>
          <p>
            {alarmActive === 'morning'
              ? "È ora di iniziare la giornata di lavoro."
              : 'È ora di raccontare cosa hai fatto oggi.'}
          </p>
          <button className="btn btn-primary btn-lg" onClick={dismissAlarmAndStart}>
            Rispondi
          </button>
        </div>
      )}

      {!pushEnabled && (
        <div className="card push-card">
          <p>🔔 Attiva la sveglia automatica su questo telefono (avvisa anche ad app chiusa).</p>
          <button className="btn btn-secondary" onClick={enablePush}>
            Attiva notifiche
          </button>
        </div>
      )}

      {voices.length > 0 && (
        <div className="card push-card">
          <p>🗣️ Voce dell'assistente (solo su questo telefono)</p>
          <select
            className="text-answer-input"
            style={{ width: '100%' }}
            value={selectedVoice}
            onChange={(e) => changeVoice(e.target.value)}
          >
            <option value="">Predefinita del telefono</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} {v.lang ? `(${v.lang})` : ''}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={testVoice}>
            🔊 Prova voce
          </button>
        </div>
      )}

      <div className="status-card">
        {hasOpenSession ? (
          <>
            <span className="status-dot status-dot-active" />
            <div>
              <strong>In turno</strong>
              <p>
                Cantiere: {status.openSession.jobsite?.name || 'N/D'}
                {status.openSession.vehicle ? ` · Mezzo: ${status.openSession.vehicle.name}` : ''}
              </p>
              <p className="muted">
                Iniziato alle {new Date(status.openSession.clockIn).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <button className="link-btn" onClick={cancelShift} style={{ padding: 0 }}>
                Ho sbagliato, annulla turno
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="status-dot" />
            <div>
              <strong>Nessun turno in corso</strong>
              <p className="muted">Premi "Inizia giornata" quando parti per il cantiere.</p>
            </div>
          </>
        )}
      </div>

      {phase === 'idle' && !chatOpen && (
        <div className="assistant-actions" style={{ flexDirection: 'column', gap: 14 }}>
          {!hasOpenSession && (
            <button className="btn btn-primary btn-round" onClick={() => startConversation('morning')}>
              🎙️ Inizia giornata
            </button>
          )}
          {hasOpenSession && (
            <button className="btn btn-primary btn-round" onClick={() => startConversation('evening')}>
              🎙️ Fine giornata
            </button>
          )}
          <button className="btn btn-secondary" onClick={openChat}>
            💬 Chiedi qualcosa all'assistente
          </button>
        </div>
      )}

      {chatOpen && (
        <div className="chat-card">
          <div className="chat-messages">
            {chatMessages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                {m.content}
              </div>
            ))}
            {chatBusy && <div className="chat-bubble chat-bubble-ai muted">Sto scrivendo...</div>}
          </div>

          {isListening && <p className="muted" style={{ textAlign: 'center' }}>🎙️ Ti ascolto... {interimTranscript && `"${interimTranscript}"`}</p>}
          {micNotice && <p className="muted">🎤 {micNotice}</p>}

          <form className="text-answer-form" onSubmit={submitChat}>
            <input
              type="text"
              className="text-answer-input"
              placeholder="Scrivi una domanda..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            {isVoiceSupported() && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={listenForChat} disabled={chatBusy}>
                🎙️
              </button>
            )}
            <button className="btn btn-primary btn-sm" type="submit" disabled={!chatInput.trim() || chatBusy}>
              Invia
            </button>
          </form>

          <button className="btn btn-secondary" onClick={closeChat}>
            Chiudi chat
          </button>
        </div>
      )}

      {phase !== 'idle' && (
        <div className="conversation-card">
          <p className="assistant-bubble">🤖 {assistantMessage}</p>

          {phase === 'listening' && (
            <div className="listening-box">
              {isListening && (
                <>
                  <div className="mic-pulse">🎙️</div>
                  <p className="muted">Ti ascolto... parla pure</p>
                  {interimTranscript && <p className="transcript-preview">"{interimTranscript}"</p>}
                </>
              )}
              {micNotice && <p className="muted">🎤 {micNotice}</p>}

              <form className="text-answer-form" onSubmit={submitTypedAnswer}>
                <input
                  type="text"
                  className="text-answer-input"
                  placeholder="Oppure scrivi qui la risposta..."
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" type="submit" disabled={!typedAnswer.trim()}>
                  Invia
                </button>
              </form>
            </div>
          )}

          {phase === 'thinking' && <p className="muted">Sto elaborando...</p>}

          {phase === 'error' && (
            <>
              <div className="alert alert-error">{errorMessage}</div>
              <button className="btn btn-secondary" onClick={() => enterAwaitingAnswer(conversationType)}>
                Riprova
              </button>
            </>
          )}

          {phase === 'done' && (
            <>
              {lastResult?.pdfDownloadUrl && (
                <div className="alert alert-success">
                  Rapportino generato
                  {lastResult.emailSent && ' e inviato alla segreteria ✅'}
                  {!lastResult.emailSent && lastResult.emailPending && ' — verrà inviato insieme agli altri rapportini di oggi 📧'}
                  {!lastResult.emailSent && !lastResult.emailPending && lastResult.emailError && ` (email non inviata: ${lastResult.emailError})`}
                  <br />
                  <a
                    className="link-btn"
                    href={`${api.API_URL}${lastResult.pdfDownloadUrl}?token=${localStorage.getItem('workerToken') || ''}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Scarica PDF
                  </a>
                </div>
              )}
              <button className="btn btn-secondary" onClick={reset}>
                Chiudi
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
