const PRODUCTION_API = 'https://filevine-rag.onrender.com'

/**
 * Where the API lives.
 * - VITE_API_URL wins when set.
 * - In development we call /api, which Vite proxies to the backend (no CORS needed).
 * - A production build talks to the deployed backend directly; the backend must list
 *   this site's origin in ALLOWED_ORIGINS.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : PRODUCTION_API)
).replace(/\/+$/, '')

/** The backend runs on a free Render instance that sleeps; a cold start can take about a minute. */
export const REQUEST_TIMEOUT_MS = 120_000

/** After this long without an answer we tell the user the server may be waking up. */
export const SLOW_NOTICE_MS = 8_000
