let audioCtx = null;

function getContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

/** Plays a short alarm-like beep pattern without needing an audio file. */
export function playAlarmBeeps(times = 3) {
  try {
    const ctx = getContext();
    if (ctx.state === 'suspended') ctx.resume();

    for (let i = 0; i < times; i++) {
      const start = ctx.currentTime + i * 0.6;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  } catch (err) {
    console.warn('Impossibile riprodurre il suono della sveglia:', err);
  }
}
