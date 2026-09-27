function playTone(frequency, duration, type = 'sine') {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

export function playSuccessBeep() {
  playTone(1200, 0.1);
}

export function playErrorBeep() {
  playTone(300, 0.25, 'sawtooth');
}
