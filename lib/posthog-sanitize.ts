const URL_KEYS = ["$current_url", "$referrer", "$pathname", "$initial_current_url", "$initial_referrer"] as const
const SENSITIVE_PARAMS = ["oobCode", "apiKey", "continueUrl", "mode", "lang"]
const AUTH_ACTION_PATH = /^\/auth\/action\/?$/

/** Quita query/hash sensibles de una URL (absoluta o relativa). En /auth/action quita toda la query. */
export function sanitizeUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value, "http://placeholder.invalid")
  } catch {
    // No se puede parsear: lo más seguro es descartar query y hash.
    return value.split(/[?#]/)[0]
  }

  const before = url.search + url.hash
  if (AUTH_ACTION_PATH.test(url.pathname)) {
    url.search = ""
    url.hash = ""
  } else {
    for (const param of SENSITIVE_PARAMS) url.searchParams.delete(param)
  }
  if (url.search + url.hash === before) return value

  return /^[a-z][a-z\d+.-]*:/i.test(value) ? url.toString() : url.pathname + url.search + url.hash
}

function sanitizeBag<T extends Record<string, unknown> | undefined>(bag: T): T {
  if (!bag) return bag
  const copy: Record<string, unknown> = { ...bag }
  for (const key of URL_KEYS) {
    const value = copy[key]
    if (typeof value === "string") copy[key] = sanitizeUrl(value)
  }
  return copy as T
}

type EventLike = {
  event?: string
  properties?: Record<string, any>
  $set?: Record<string, any>
  $set_once?: Record<string, any>
}

/** `before_send` de PostHog: limpia URLs sensibles y devuelve siempre el evento. */
export function sanitizePostHogEvent<T extends EventLike>(event: T | null): T | null {
  if (!event) return event
  const out = { ...event }
  if (event.properties) out.properties = sanitizeBag(event.properties)
  if (event.$set) out.$set = sanitizeBag(event.$set)
  if (event.$set_once) out.$set_once = sanitizeBag(event.$set_once)
  return out
}
