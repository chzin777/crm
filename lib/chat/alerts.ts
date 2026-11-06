const STORAGE_KEY = "crm:chat-alerts";

let context: AudioContext | null = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  context ??= new window.AudioContext();
  return context;
}

export function alertsEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function store(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Sem armazenamento, a escolha vale só nesta aba.
  }
}

/** Precisa vir de um clique: é nele que o navegador libera o áudio e a permissão. */
export async function enableAlerts() {
  await audioContext()?.resume().catch(() => undefined);
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    await Notification.requestPermission().catch(() => undefined);
  }
  store(true);
}

export const disableAlerts = () => store(false);

function beep() {
  const ctx = audioContext();
  if (!ctx) return;
  const start = ctx.currentTime;
  [0, 0.16].forEach((delay, index) => {
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = index === 0 ? 880 : 1170;
    volume.gain.setValueAtTime(0.0001, start + delay);
    volume.gain.exponentialRampToValueAtTime(0.12, start + delay + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.14);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start(start + delay);
    oscillator.stop(start + delay + 0.16);
  });
}

export function alertUser(title: string, body: string) {
  if (!alertsEnabled()) return;
  beep();
  if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      const notification = new Notification(title, { body, tag: "crm-chat" });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Navegador que exige service worker: fica só o som.
    }
  }
}
