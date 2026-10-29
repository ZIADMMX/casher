let sharedAudioCtx = null;

function getAudioContext() {
  try {
    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioContextClass) return null;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    return sharedAudioCtx;
  } catch (err) {
    console.warn('تعذر تهيئة AudioContext:', err);
    return null;
  }
}

function playTone(frequency, duration, type = 'sine') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);

    oscillator.onended = () => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {
        // Disconnect cleanup error ignored safely
      }
    };
  } catch (err) {
    console.warn('تعذر تشغيل الصوت:', err);
  }
}

export function playSuccessBeep() {
  playTone(1200, 0.1);
}

export function playErrorBeep() {
  playTone(300, 0.25, 'sawtooth');
}
