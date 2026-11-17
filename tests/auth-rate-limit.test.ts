import { describe, expect, it } from "vitest";
import { lockMessage, LOGIN_LOCK_MS, LoginRateLimiter } from "@/lib/auth-rate-limit";

function setup() {
  let now = 1_000_000;
  const limiter = new LoginRateLimiter(5, LOGIN_LOCK_MS, () => now);
  return { limiter, advance: (ms: number) => { now += ms; }, key: LoginRateLimiter.key("1.2.3.4", "Equipe@Oticas.com") };
}

describe("bloqueio de login por força bruta", () => {
  it("bloqueia após 5 falhas seguidas e libera depois de 15 min", () => {
    const { limiter, advance, key } = setup();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(limiter.recordFailure(key)).toBe(false);
      expect(limiter.retryAfterMs(key)).toBe(0);
    }
    expect(limiter.recordFailure(key)).toBe(true);
    expect(limiter.retryAfterMs(key)).toBe(LOGIN_LOCK_MS);
    advance(LOGIN_LOCK_MS - 60_000);
    expect(limiter.retryAfterMs(key)).toBe(60_000);
    advance(60_000);
    expect(limiter.retryAfterMs(key)).toBe(0);
    expect(limiter.failures(key)).toBe(0);
  });

  it("login certo zera o contador", () => {
    const { limiter, key } = setup();
    for (let attempt = 0; attempt < 4; attempt += 1) limiter.recordFailure(key);
    limiter.recordSuccess(key);
    expect(limiter.recordFailure(key)).toBe(false);
    expect(limiter.failures(key)).toBe(1);
  });

  it("conta por IP + e-mail (sem diferenciar maiúsculas)", () => {
    const { limiter, key } = setup();
    for (let attempt = 0; attempt < 5; attempt += 1) limiter.recordFailure(key);
    expect(limiter.retryAfterMs(LoginRateLimiter.key("1.2.3.4", "equipe@oticas.com"))).toBeGreaterThan(0);
    expect(limiter.retryAfterMs(LoginRateLimiter.key("5.6.7.8", "equipe@oticas.com"))).toBe(0);
    expect(limiter.retryAfterMs(LoginRateLimiter.key("1.2.3.4", "outra@oticas.com"))).toBe(0);
  });

  it("mensagem mostra o tempo restante", () => {
    expect(lockMessage(LOGIN_LOCK_MS)).toBe("Muitas tentativas de login sem sucesso. Tente novamente em 15 minutos.");
    expect(lockMessage(30_000)).toBe("Muitas tentativas de login sem sucesso. Tente novamente em 1 minuto.");
  });
});
