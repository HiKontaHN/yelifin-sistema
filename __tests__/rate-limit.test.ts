import { getClientIP, rateLimit } from "@/lib/rate-limit";

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

  it("con Upstash usa el contador compartido", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ result: 4 }, { result: 0 }, { result: 30000 }])),
    );
    const r = await rateLimit("k", 3, 60000);
    expect(fetchMock).toHaveBeenCalledWith("https://redis.test/pipeline", expect.anything());
    expect(r).toEqual({ allowed: false, remaining: 0, retryAfterSec: 30 });
  });

  it("si Redis falla degrada a memoria", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await rateLimit(`fb:${Math.random()}`, 1, 1000)).allowed).toBe(true);
  });
});
