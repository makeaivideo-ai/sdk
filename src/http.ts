import type { MakeAIVideoConfig } from "./types"
import {
  AuthenticationError,
  InsufficientCreditsError,
  MakeAIVideoError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
} from "./errors"
import { VERSION } from "./version"

const DEFAULT_BASE_URL = "https://app.makeaivideo.ai"
const DEFAULT_TIMEOUT = 120_000
const DEFAULT_MAX_RETRIES = 2

interface Envelope<T> {
  data: T | null
  error: { message?: string; code?: string; retryable?: boolean; details?: unknown } | null
  meta?: { request_id?: string }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** Sent as Idempotency-Key so a retried create never makes a second video. */
  idempotencyKey?: string
  signal?: AbortSignal
}

export class HttpClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeout: number
  private readonly maxRetries: number
  private readonly fetchImpl: typeof fetch

  constructor(config: MakeAIVideoConfig) {
    if (!config?.apiKey) {
      throw new Error(
        "MakeAIVideo API key is required. Create one at https://app.makeaivideo.ai/developers"
      )
    }
    if (!config.apiKey.startsWith("mav_")) {
      throw new Error('Invalid MakeAIVideo API key: keys start with "mav_".')
    }
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
    const f = config.fetch ?? globalThis.fetch
    if (!f) throw new Error("No fetch available: use Node 18+ or pass `fetch` in the config.")
    this.fetchImpl = f
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`)
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": `makeaivideo-sdk-js/${VERSION}`,
    }
    if (opts.body !== undefined) headers["Content-Type"] = "application/json"
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey

    let attempt = 0
    for (;;) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeout)
      opts.signal?.addEventListener("abort", () => controller.abort(), { once: true })
      let res: Response
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal,
        })
      } catch (err) {
        clearTimeout(timer)
        if (attempt < this.maxRetries && !opts.signal?.aborted) {
          await sleep(backoff(attempt++))
          continue
        }
        throw new MakeAIVideoError(
          `Network error calling ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
          { status: 0, code: "network_error", retryable: true }
        )
      }
      clearTimeout(timer)

      const retryAfter = Number(res.headers.get("retry-after")) || undefined
      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        await sleep(retryAfter ? retryAfter * 1000 : backoff(attempt))
        attempt++
        continue
      }

      let env: Envelope<T> | null = null
      try {
        env = (await res.json()) as Envelope<T>
      } catch {
        /* non-JSON body */
      }
      const requestId = env?.meta?.request_id ?? res.headers.get("x-request-id") ?? undefined
      if (res.ok && env && !env.error) return env.data as T

      const message = env?.error?.message ?? `Request failed with status ${res.status}`
      const details = env?.error?.details
      switch (res.status) {
        case 400:
          throw new ValidationError(message, requestId, details)
        case 401:
          throw new AuthenticationError(message, requestId)
        case 402:
          throw new InsufficientCreditsError(message, requestId, details)
        case 403:
          throw new PermissionError(message, requestId, details)
        case 404:
          throw new NotFoundError(message, requestId)
        case 429:
          throw new RateLimitError(message, retryAfter, requestId)
        default:
          throw new MakeAIVideoError(message, {
            status: res.status,
            code: env?.error?.code,
            requestId,
            details,
            retryable: env?.error?.retryable ?? res.status >= 500,
          })
      }
    }
  }
}

function backoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
