import { sanitizePostHogEvent, sanitizeUrl } from "@/lib/posthog-sanitize"

describe("posthog-sanitize", () => {
  test("quita toda la query en /auth/action", () => {
    expect(sanitizeUrl("https://hikonta.app/auth/action?mode=resetPassword&oobCode=SECRET&apiKey=K&lang=es&x=1#frag"))
      .toBe("https://hikonta.app/auth/action")
    expect(sanitizeUrl("/auth/action?oobCode=SECRET")).toBe("/auth/action")
  })

  test("en otras rutas quita solo parámetros sensibles", () => {
    expect(sanitizeUrl("https://hikonta.app/sales?page=2&oobCode=S&mode=x&continueUrl=http%3A%2F%2Fa&lang=es"))
      .toBe("https://hikonta.app/sales?page=2")
  })

  test("no altera URLs limpias", () => {
    expect(sanitizeUrl("https://hikonta.app")).toBe("https://hikonta.app")
    expect(sanitizeUrl("https://hikonta.app/sales?page=2")).toBe("https://hikonta.app/sales?page=2")
    expect(sanitizeUrl("/sales")).toBe("/sales")
  })

  test("URL no parseable pierde query y hash", () => {
    expect(sanitizeUrl("http://[bad?oobCode=SECRET")).toBe("http://[bad")
  })

  test("limpia properties, $set y $set_once y devuelve el evento", () => {
    const dirty = "https://hikonta.app/auth/action?oobCode=SECRET"
    const event = {
      event: "$pageview",
      properties: { $current_url: dirty, $referrer: dirty, $pathname: "/auth/action?oobCode=SECRET", other: 1 },
      $set: { $current_url: dirty },
      $set_once: { $initial_current_url: dirty, $initial_referrer: dirty },
    }
    const out = sanitizePostHogEvent(event)!
    expect(JSON.stringify(out)).not.toContain("SECRET")
    expect(out.event).toBe("$pageview")
    expect(out.properties.other).toBe(1)
    expect(JSON.stringify(event)).toContain("SECRET") // no muta el original
  })

  test("tolera eventos sin properties y null", () => {
    expect(sanitizePostHogEvent({ event: "x" })).toEqual({ event: "x" })
    expect(sanitizePostHogEvent(null)).toBeNull()
  })
})
