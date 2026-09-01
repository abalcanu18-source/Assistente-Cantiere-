import { useCallback, useRef, useState } from 'react';
import { isIosDevice } from './push.js';

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function isVoiceSupported() {
  return Boolean(SpeechRecognitionImpl) || canRecordAudio();
}

export function canRecordAudio() {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined';
}

/** Chrome/Edge on Android and desktop: live speech-to-text. iPhone almost never supports it. */
export function isBrowserSpeechReliable() {
  return Boolean(SpeechRecognitionImpl) && !isIosDevice();
}

export function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const VOICE_PREF_KEY = 'assistantVoiceName';

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

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const listen = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!SpeechRecognitionImpl) {
        reject(new Error('Il riconoscimento vocale non è supportato su questo browser.'));
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

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mimeType = pickRecorderMime();
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = rec;
    rec.start();
    setIsRecording(true);
    setIsListening(true);
    return rec.mimeType || mimeType || 'audio/webm';
  }, []);

  const stopRecording = useCallback(() => {
    return new Promise((resolve, reject) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive') {
        setIsRecording(false);
        setIsListening(false);
        reject(new Error('Registrazione non attiva.'));
        return;
      }
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setIsRecording(false);
        setIsListening(false);
        const type = rec.mimeType || pickRecorderMime() || 'audio/webm';
        resolve({ blob: new Blob(chunksRef.current, { type }), mimeType: type });
      };
      rec.stop();
    });
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

  return {
    listen,
    stopListening,
    startRecording,
    stopRecording,
    speak,
    isListening,
    isSpeaking,
    isRecording,
    interimTranscript,
  };
}
