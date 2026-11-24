type AlertContext = Pick<AudioContext, "state" | "resume" | "close" | "createOscillator" | "createGain" | "destination" | "currentTime">;

export function createAlertSound(factory: () => AlertContext) {
  let context: AlertContext | null = null;
  let disposed = false;
  return {
    async unlock() {
      if (disposed) return false;
      context ??= factory();
      if (context.state !== "running") await context.resume();
      return !disposed && context.state === "running";
    },
    notify() {
      if (disposed || !context || context.state !== "running") return false;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.04, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      oscillator.start(); oscillator.stop(context.currentTime + 0.21);
      return true;
    },
    async dispose() { disposed = true; if (context && context.state !== "closed") await context.close(); },
  };
}
