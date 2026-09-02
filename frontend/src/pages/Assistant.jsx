import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { isVoiceSupported, useVoice, getAvailableVoices, onVoicesReady, getSavedVoiceName, saveVoiceName, isBrowserSpeechReliable, canRecordAudio, blobToBase64 } from '../useVoice.js';
import { setupPushNotifications, restorePushIfGranted, isIosDevice, isStandalonePwa } from '../push.js';
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

// Gates the "Inizia giornata" button to the configured working window
// (by default Mon-Fri, 06:00-18:00), so the app doesn't invite people to
// clock in at 3am or on a Sunday.
function isWithinWorkWindow(settings) {
  const { workDayStart, workDayEnd, weekdaysOnly } = settings || {};
  if (!workDayStart || !workDayEnd) return true;

  const now = new Date();
  if (weekdaysOnly !== false) {
    const day = now.getDay(); // 0 = domenica, 6 = sabato
    if (day === 0 || day === 6) return false;
  }

  const [startH, startM] = workDayStart.split(':').map(Number);
  const [endH, endM] = workDayEnd.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= startH * 60 + startM && nowMinutes <= endH * 60 + endM;
}

export default function Assistant({ workerName }) {
  const { listen, speak, startRecording, stopRecording, isListening, isRecording, interimTranscript } = useVoice();

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
  const [pushError, setPushError] = useState('');
  const [pushOk, setPushOk] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(getSavedVoiceName());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [, setTick] = useState(0);
  const alarmFiredRef = useRef({ morning: null, evening: null, evening2: null });

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
    restorePushIfGranted().then((ok) => {
      if (ok) setPushEnabled(true);
    });
  }, [refreshStatus]);

  // Foreground fallback "alarm": works even without push permission, as
  // long as the app is open. Checks every 20s if we've just crossed the
  // configured morning/evening time and haven't already fired today. Also
  // used to force a re-render every 20s so the "Inizia giornata" button
  // enables/disables itself right when the working window opens/closes,
  // without needing a page refresh.
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);

      if (!settings.alarmMorning && !settings.alarmEvening && !settings.alarmEvening2) return;
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
      if (
        isNowNear(settings.alarmEvening2, 1) &&
        alarmFiredRef.current.evening2 !== todayKey &&
        status?.openSession
      ) {
        alarmFiredRef.current.evening2 = todayKey;
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
      if (event.data?.type === 'alarm-tapped' || event.data?.type === 'push-received') {
        const kind = event.data.alarmType;
        if (kind === 'test' || kind === 'generic') {
          triggerAlarm('test');
        } else {
          triggerAlarm(kind === 'evening' ? 'evening' : 'morning');
        }
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
    setPushError('');
    setPushOk('');
    try {
      await setupPushNotifications();
      setPushEnabled(true);
      await sendTestNotification();
    } catch (err) {
      setPushEnabled(false);
      setPushError(err.message);
    }
  }

  async function sendTestNotification() {
    setPushError('');
    setPushOk('');
    // Always ring inside the app: Android often hides the tray banner
    // while you're looking at the screen, which looked like "nothing arrived".
    triggerAlarm('test');
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Prova sveglia 🔔', {
          body: 'Se vedi anche questo, il telefono ha accettato le notifiche.',
          tag: `cantieri-test-${Date.now()}`,
        });
      }
    } catch {
      // some browsers block the Notification constructor from a PWA tab
    }
    try {
      await api.testPush();
      setPushOk('Prova inviata. Devi sentire il suono e vedere lo schermo arancione. Se l\'app è chiusa, arriva come notifica.');
    } catch (err) {
      setPushError(err.message);
    }
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
    setPhase('listening');
  }

  // The operator must tap "Parla" (a real tap) so iPhone/Android grant the
  // microphone. Starting listen() automatically after TTS always fails on
  // iOS and often on Android because the original tap is already "used up".
  async function tapToTalk() {
    setMicNotice('');
    if (isRecording) {
      setPhase('thinking');
      try {
        const { blob, mimeType } = await stopRecording();
        const audioBase64 = await blobToBase64(blob);
        const { text } = await api.transcribe(audioBase64, mimeType);
        if (text && text.trim()) {
          await processAnswer(conversationType, text.trim());
        } else {
          setMicNotice('Non ho capito, tocca di nuovo e parla più vicino al telefono.');
          setPhase('listening');
        }
      } catch (err) {
        setMicNotice(err.message);
        setPhase('listening');
      }
      return;
    }

    if (isBrowserSpeechReliable()) {
      listen()
        .then((transcript) => {
          if (transcript && transcript.trim()) processAnswer(conversationType, transcript.trim());
        })
        .catch((err) => {
          setMicNotice(`${err.message} Prova a toccare di nuovo "Parla", o scrivi qui sotto.`);
        });
      return;
    }

    if (!canRecordAudio()) {
      setMicNotice('Questo telefono non permette il microfono nel browser. Scrivi la risposta qui sotto.');
      return;
    }

    try {
      await startRecording();
    } catch (err) {
      setMicNotice('Consenti il microfono dalle impostazioni del telefono, poi tocca di nuovo Parla.');
    }
  }

  function enterAwaitingAnswer() {
    setPhase('listening');
    setMicNotice('');
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
    const greeting = `Ciao ${workerName}, racconta la giornata (cantiere, mezzo, cosa hai fatto) e ti compilo il rapportino, oppure chiedimi quello che vuoi.`;
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
      const result = await api.chat(withUser);
      const next = [...withUser, { role: 'assistant', content: result.reply }];
      if (result.compiled && result.pdfDownloadUrl) {
        next.push({
          role: 'assistant',
          content: 'Rapportino compilato. Tocca per aprire il PDF.',
          pdfUrl: `${api.API_URL}${result.pdfDownloadUrl}?token=${localStorage.getItem('workerToken') || ''}`,
        });
        refreshStatus();
      }
      setChatMessages(next);
      await speak(result.reply);
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
    if (isRecording || chatBusy) return;
    if (isBrowserSpeechReliable()) {
      listen()
        .then((transcript) => {
          if (transcript && transcript.trim()) sendChat(transcript.trim());
        })
        .catch((err) => setMicNotice(err.message));
      return;
    }
    startRecording().catch((err) => setMicNotice(err.message));
  }

  async function stopChatRecording() {
    if (!isRecording) return;
    try {
      const { blob, mimeType } = await stopRecording();
      const audioBase64 = await blobToBase64(blob);
      const { text } = await api.transcribe(audioBase64, mimeType);
      if (text && text.trim()) await sendChat(text.trim());
      else setMicNotice('Non ho capito, riprova.');
    } catch (err) {
      setMicNotice(err.message);
    }
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
  const withinWorkWindow = isWithinWorkWindow(settings);

  return (
    <div className="assistant-screen">
      {alarmActive && (
        <div className="alarm-overlay">
          <div className="alarm-pulse">🔔</div>
          <h2>
            {alarmActive === 'morning' ? 'Buongiorno!' : alarmActive === 'evening' ? 'Fine giornata!' : 'Prova sveglia'}
          </h2>
          <p>
            {alarmActive === 'morning'
              ? 'È ora di iniziare la giornata di lavoro.'
              : alarmActive === 'evening'
                ? 'È ora di raccontare cosa hai fatto oggi.'
                : 'Se vedi questa schermata e senti il suono, sul telefono le sveglie funzionano.'}
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              if (alarmActive === 'test') setAlarmActive(null);
              else dismissAlarmAndStart();
            }}
          >
            {alarmActive === 'test' ? 'Ok, l\'ho visto' : 'Rispondi'}
          </button>
        </div>
      )}

      {!pushEnabled && (
        <div className="card push-card">
          {isIosDevice() && !isStandalonePwa() && (
            <p>
              Su iPhone: apri questa pagina in <strong>Safari</strong>, tocca Condividi → <strong>Aggiungi a Home</strong>,
              poi apri l'icona e attiva le notifiche da lì. Altrimenti la sveglia non arriva.
            </p>
          )}
          {!(isIosDevice() && !isStandalonePwa()) && (
            <p>🔔 Attiva la sveglia automatica su questo telefono (avvisa anche ad app chiusa).</p>
          )}
          <button className="btn btn-secondary" onClick={enablePush}>
            Attiva notifiche
          </button>
          {pushError && <div className="alert alert-error">{pushError}</div>}
        </div>
      )}
      {pushEnabled && (
        <div className="card push-card">
          <p>🔔 Sveglie attive su questo telefono. Tocca il pulsante per una prova: deve suonare e apparire uno schermo arancione.</p>
          <button className="btn btn-secondary" onClick={sendTestNotification}>
            Prova sveglia ora
          </button>
          {pushOk && <div className="alert alert-success">{pushOk}</div>}
          {pushError && <div className="alert alert-error">{pushError}</div>}
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
          {!hasOpenSession && withinWorkWindow && (
            <button className="btn btn-primary btn-round" onClick={() => startConversation('morning')}>
              🎙️ Inizia giornata
            </button>
          )}
          {!hasOpenSession && !withinWorkWindow && (
            <p className="muted" style={{ textAlign: 'center', maxWidth: 260 }}>
              L'assistente è disponibile {settings.weekdaysOnly !== false ? 'dal lunedì al venerdì, ' : ''}
              dalle {settings.workDayStart} alle {settings.workDayEnd}.
            </p>
          )}
          {hasOpenSession && (
            <button className="btn btn-primary btn-round" onClick={() => startConversation('evening')}>
              🎙️ Fine giornata
            </button>
          )}
          <button className="btn btn-secondary" onClick={openChat}>
            💬 Parla e compila il rapportino
          </button>
        </div>
      )}

      {chatOpen && (
        <div className="chat-card">
          <div className="chat-messages">
            {chatMessages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                {m.content}
                {m.pdfUrl && (
                  <>
                    {' '}
                    <a className="link-btn" href={m.pdfUrl} target="_blank" rel="noreferrer">
                      Apri PDF
                    </a>
                  </>
                )}
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
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={isRecording ? stopChatRecording : listenForChat}
                disabled={chatBusy}
              >
                {isRecording ? 'Invia' : '🎙️'}
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
              {(isListening || isRecording) && (
                <>
                  <div className="mic-pulse">🎙️</div>
                  <p className="muted">{isRecording ? 'Ti ascolto... tocca di nuovo per inviare' : 'Ti ascolto... parla pure'}</p>
                  {interimTranscript && <p className="transcript-preview">"{interimTranscript}"</p>}
                </>
              )}
              {micNotice && <p className="muted">🎤 {micNotice}</p>}

              {!isListening && !isRecording && (
                <p className="muted">Tocca il pulsante e parla, poi tocca di nuovo per inviare.</p>
              )}

              {isVoiceSupported() && (
                <button className="btn btn-primary btn-round" type="button" onClick={tapToTalk}>
                  {isRecording ? 'Invia voce' : '🎙️ Parla'}
                </button>
              )}

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
              <button className="btn btn-secondary" onClick={() => enterAwaitingAnswer()}>
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
