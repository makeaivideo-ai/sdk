/** Base error for every failed MakeAIVideo API call. */
export class MakeAIVideoError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string
  readonly details?: unknown
  readonly retryable: boolean

  constructor(
    message: string,
    opts: { status: number; code?: string; requestId?: string; details?: unknown; retryable?: boolean }
  ) {
    super(message)
    this.name = "MakeAIVideoError"
    this.status = opts.status
    this.code = opts.code
    this.requestId = opts.requestId
    this.details = opts.details
    this.retryable = opts.retryable ?? false
  }
}

/** 401: the API key is missing, malformed, expired or revoked. */
export class AuthenticationError extends MakeAIVideoError {
  constructor(message: string, requestId?: string) {
    super(message, { status: 401, code: "unauthorized", requestId })
    this.name = "AuthenticationError"
  }
}

/** 403: the key is valid but lacks a scope (read, write or ai). */
export class PermissionError extends MakeAIVideoError {
  constructor(message: string, requestId?: string, details?: unknown) {
    super(message, { status: 403, code: "forbidden", requestId, details })
    this.name = "PermissionError"
  }
}

/** 400: the request body failed validation. `details` names the fields. */
export class ValidationError extends MakeAIVideoError {
  constructor(message: string, requestId?: string, details?: unknown) {
    super(message, { status: 400, code: "invalid_request", requestId, details })
    this.name = "ValidationError"
  }
}

/** 402: not enough credits for this call. `details` carries required vs remaining. */
export class InsufficientCreditsError extends MakeAIVideoError {
  constructor(message: string, requestId?: string, details?: unknown) {
    super(message, { status: 402, code: "insufficient_credits", requestId, details })
    this.name = "InsufficientCreditsError"
  }
}

/** 404: the video, character, webhook or other resource does not exist. */
export class NotFoundError extends MakeAIVideoError {
  constructor(message: string, requestId?: string) {
    super(message, { status: 404, code: "not_found", requestId })
    this.name = "NotFoundError"
  }
}

/** 429: rate limited. The client already retried `maxRetries` times. */
export class RateLimitError extends MakeAIVideoError {
  readonly retryAfterSeconds?: number
  constructor(message: string, retryAfterSeconds?: number, requestId?: string) {
    super(message, { status: 429, code: "rate_limited", requestId, retryable: true })
    this.name = "RateLimitError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** A video reached a terminal "failed" state while waiting on it. */
export class VideoFailedError extends MakeAIVideoError {
  readonly videoId: string
  constructor(videoId: string, message: string) {
    super(message, { status: 422, code: "video_failed" })
    this.name = "VideoFailedError"
    this.videoId = videoId
  }
}
