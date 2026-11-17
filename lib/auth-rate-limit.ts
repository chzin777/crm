/** Bloqueio de login por força bruta: 5 falhas seguidas (IP + e-mail) bloqueiam por 15 min. */
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

type Entry = { failures: number; lockedUntil: number; lastFailureAt: number };

export class LoginRateLimiter {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures = MAX_LOGIN_FAILURES,
    private readonly lockMs = LOGIN_LOCK_MS,
    private readonly now: () => number = Date.now,
  ) {}

  static key(ip: string, email: string) {
    return `${ip.trim() || "?"}|${email.trim().toLowerCase()}`;
  }

  /** Milissegundos restantes de bloqueio (0 = liberado). */
  retryAfterMs(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const remaining = entry.lockedUntil - this.now();
    if (remaining > 0) return remaining;
    if (entry.lockedUntil > 0) this.entries.delete(key); // bloqueio venceu: recomeça do zero.
    return 0;
  }

  /** Registra uma falha; devolve true quando esta falha ativou o bloqueio. */
  recordFailure(key: string) {
    const now = this.now();
    const entry = this.entries.get(key) ?? { failures: 0, lockedUntil: 0, lastFailureAt: 0 };
    // Falhas espaçadas por mais que a janela de bloqueio não se acumulam.
    if (now - entry.lastFailureAt > this.lockMs) entry.failures = 0;
    entry.failures += 1;
    entry.lastFailureAt = now;
    const locked = entry.failures >= this.maxFailures;
    if (locked) entry.lockedUntil = now + this.lockMs;
    this.entries.set(key, entry);
    this.prune(now);
    return locked;
  }

  failures(key: string) {
    return this.entries.get(key)?.failures ?? 0;
  }

  recordSuccess(key: string) {
    this.entries.delete(key);
  }

  private prune(now: number) {
    if (this.entries.size < 5_000) return;
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil < now && now - entry.lastFailureAt > this.lockMs) this.entries.delete(key);
    }
  }
}

export function lockMessage(retryAfterMs: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `Muitas tentativas de login sem sucesso. Tente novamente em ${minutes} minuto${minutes === 1 ? "" : "s"}.`;
}
