// Medux brand + utility helpers
export const BRAND = {
  name: "Medux",
  tagline: "Connect. Clearly.",
};

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// Synthesized ringtone using Web Audio API — two alternating sine tones
export class Ringtone {
  private ctx?: AudioContext;
  private timer?: number;
  private playing = false;

  start() {
    if (this.playing || typeof window === "undefined") return;
    this.playing = true;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    let toggle = true;
    const beep = () => {
      if (!this.ctx || !this.playing) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = toggle ? 440 : 550;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.7);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.75);
      toggle = !toggle;
    };
    beep();
    this.timer = window.setInterval(beep, 1200);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = undefined;
    }
  }
}
