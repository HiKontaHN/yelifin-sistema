import { getClientIP, rateLimit, sharedRateLimit } from "@/lib/rate-limit";

const req = (headers: Record<string, string>) => new Request("http://x", { headers });

describe("getClientIP", () => {
  it("prefiere x-real-ip", () => {
    expect(getClientIP(req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("9.9.9.9");
  });
  it("sin x-real-ip usa el último salto, no el primero (spoofeable)", () => {
    expect(getClientIP(req({ "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("1.1.1.1");
  });
  it("sin cabeceras devuelve unknown", () => {
    expect(getClientIP(req({}))).toBe("unknown");
  });
});

describe("rateLimit", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it("en memoria bloquea al pasar el límite", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    const key = `mem:${Math.random()}`;
    expect((await rateLimit(key, 2, 1000)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 1000)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 1000)).allowed).toBe(false);
  });

  it("nunca llama a fetch aunque Upstash esté configurado", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    const fetchMock = jest.spyOn(global, "fetch");
    await rateLimit(`local:${Math.random()}`, 3, 60000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sharedRateLimit", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it("con Upstash usa el contador compartido", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ result: 4 }, { result: 0 }, { result: 30000 }])),
    );
    const r = await sharedRateLimit("k", 3, 60000);
    expect(fetchMock).toHaveBeenCalledWith("https://redis.test/pipeline", expect.anything());
    expect(r).toEqual({ allowed: false, remaining: 0, retryAfterSec: 30 });
  });

  it("si Redis falla degrada a memoria y avisa una sola vez sin incluir la IP", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("down"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const ip = "203.0.113.42";

    expect((await sharedRateLimit(`login:${ip}`, 2, 1000)).allowed).toBe(true);
    expect((await sharedRateLimit(`login:${ip}`, 2, 1000)).allowed).toBe(true);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[rate-limit] REDIS_FALLBACK"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("action=login"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("error=down"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain(ip);
  });
});
