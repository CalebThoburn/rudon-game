// A small brass chime, synthesised: no audio assets.
let ctx: AudioContext | null = null;
let lastAt = 0;

export function chime(volume = 0.25): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  if (now - lastAt < 0.35) return;
  lastAt = now;
  for (const [freq, gain] of [[1318.5, 1], [2637, 0.35], [3951, 0.12]] as const) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(volume * gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    osc.connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.7);
  }
}
