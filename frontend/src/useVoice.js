import { useCallback, useRef, useState } from 'react';

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function isVoiceSupported() {
  return Boolean(SpeechRecognitionImpl) && 'speechSynthesis' in window;
}

const VOICE_PREF_KEY = 'assistantVoiceName';

// Voices are only reliably available after the browser fires
// 'voiceschanged' at least once (varies a lot by device/browser).
export function getAvailableVoices() {
  if (!('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices();
  const italian = all.filter((v) => v.lang?.toLowerCase().startsWith('it'));
  return italian.length > 0 ? italian : all;
}

export function onVoicesReady(callback) {
  if (!('speechSynthesis' in window)) return () => {};
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) callback(existing);
  const handler = () => callback(window.speechSynthesis.getVoices());
  window.speechSynthesis.addEventListener('voiceschanged', handler);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', handler);
}

export function getSavedVoiceName() {
  return localStorage.getItem(VOICE_PREF_KEY) || '';
}

export function saveVoiceName(name) {
  if (name) localStorage.setItem(VOICE_PREF_KEY, name);
  else localStorage.removeItem(VOICE_PREF_KEY);
}

/**
 * Thin wrapper around the browser's built-in speech APIs: SpeechRecognition
 * for listening (free, on-device/near-realtime, no server upload needed)
 * and SpeechSynthesis for the assistant's spoken replies. Keeping this
 * logic in one hook means the Assistant screen can just call listen()/speak()
 * without worrying about browser quirks.
 */
export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);

  const listen = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!SpeechRecognitionImpl) {
        reject(new Error('Il riconoscimento vocale non è supportato su questo browser. Prova con Chrome.'));
        return;
      }

      const recognition = new SpeechRecognitionImpl();
      recognition.lang = 'it-IT';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      let finalTranscript = '';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript('');
      };

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += chunk;
          } else {
            interim += chunk;
          }
        }
        setInterimTranscript(finalTranscript + interim);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        reject(new Error(`Errore microfono: ${event.error}`));
      };

      recognition.onend = () => {
        setIsListening(false);
        resolve(finalTranscript.trim());
      };

      recognition.start();
    });
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const speak = useCallback((text) => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !text) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'it-IT';
      utterance.rate = 1;

      const savedName = getSavedVoiceName();
      if (savedName) {
        const match = window.speechSynthesis.getVoices().find((v) => v.name === savedName);
        if (match) utterance.voice = match;
      }

      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  return { listen, stopListening, speak, isListening, isSpeaking, interimTranscript };
}
