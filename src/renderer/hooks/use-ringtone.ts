import { useCallback, useRef } from "react";

export function useRingtone() {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    // Already playing
    if (ctxRef.current) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.value = 0;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    ctxRef.current = ctx;
    oscRef.current = osc;
    gainRef.current = gain;

    // Pulse: 1s on, 2s off (3s cycle)
    const pulse = () => {
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.setValueAtTime(0, now + 1);
    };

    pulse();
    timerRef.current = setInterval(pulse, 3000);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (oscRef.current) {
      oscRef.current.stop();
      oscRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
  }, []);

  return { start, stop };
}
