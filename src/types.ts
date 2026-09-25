/** Client options. Only `apiKey` is required. */
export interface MakeAIVideoConfig {
  /** Your API key (starts with `mav_`). Create one at https://app.makeaivideo.ai/developers */
  apiKey: string
  /** Override the API origin (default https://app.makeaivideo.ai). */
  baseUrl?: string
  /** Per-request timeout in ms (default 120000; script writing can take a while). */
  timeout?: number
  /** Retries for 429 and 5xx responses (default 2, exponential backoff). */
  maxRetries?: number
  /** Custom fetch (defaults to the global fetch, Node 18+). */
  fetch?: typeof fetch
}

export type AspectRatio = "9:16" | "1:1" | "16:9"
export type VideoStatus =
  | "draft"
  | "idea"
  | "scripting"
  | "generating"
  | "scenes-ready"
  | "composing"
  | "ready"
  | "failed"
  | (string & {})

export interface Credits {
  plan: string
  subscription_status: string
  allowance: number
  bonus: number
  used: number
  remaining: number
}

export interface Me {
  api_key: {
    id: number
    name: string
    key_prefix: string
    scopes: string[]
    created_at: string
    last_used_at: string | null
    expires_at: string | null
  } | null
  scopes: string[]
  user: { id: string; email: string | null; role: string }
  organization: {
    id: string
    plan: string
    subscription_status: string
    trial_end: string | null
    entitled: boolean
    [key: string]: unknown
  }
  credits: Credits
}

export interface Workspace {
  id: string
  name: string
  slug: string
  description: string | null
  default_aspect_ratio: AspectRatio | null
  default_style: string | null
  default_character_id: number | null
  created_at: string
}

export interface ToolField {
  name: string
  label: string
  hint: string | null
  required: boolean
  multiline: boolean
  max_length: number | null
  [key: string]: unknown
}

/** A video tool (explainer, listicle, story, ugc, demo, article, spokesperson...). */
export interface Tool {
  id: string
  label: string
  title: string
  description: string
  fields: ToolField[]
  [key: string]: unknown
}

export interface ScriptScene {
  scene_number: number
  narration: string
  visual_description: string
  duration_seconds: number
  scene_type?: "character" | "scene"
  image_prompt?: string
  video_prompt?: string
}

export interface VideoScript {
  title: string
  hook: string
  visual_thread?: string
  total_duration_seconds: number
  hashtags?: string[]
  scenes: ScriptScene[]
}

interface CreateVideoCommon {
  title?: string
  topic?: string
  aspect_ratio?: AspectRatio
  language?: string
  voice_id?: string
  music_id?: string
  caption_style?: string
  character_id?: number | null
  video_model?: string
  /** Default true. `false` creates a draft you start later with `videos.generate()`. */
  start_generation?: boolean
  /** Re-sending the same key returns the same video instead of creating a second one. */
  idempotency_key?: string
}

/** Let MakeAIVideo write the script: pick a tool (see `tools.list()`) and answer its fields. */
export interface CreateVideoFromBrief extends CreateVideoCommon {
  tool: string
  fields: Record<string, string>
  duration_seconds?: number
}

/** Bring your own script: it is shot as written. */
export interface CreateVideoFromScript extends CreateVideoCommon {
  script: VideoScript
  mode?: "talking-head" | "cinematic" | "hybrid" | "stock-narrated" | "smart-mix"
  style?: string
}

export type CreateVideoParams = CreateVideoFromBrief | CreateVideoFromScript

export interface VideoCreated {
  video_id: string
  status: VideoStatus
  title: string | null
  scene_count: number | null
  poll_after_seconds: number | null
  next: string
}

export interface Video {
  video_id: string
  title: string | null
  status: VideoStatus
  progress: Record<string, unknown>
  duration_seconds: number | null
  aspect_ratio: AspectRatio | null
  credits_used: number | null
  error: string | null
  /** Direct MP4 URL once `status` is "ready". */
  download: string | null
  created_at: string | null
  updated_at: string | null
  poll_after_seconds: number | null
}

export interface VideoSummary {
  video_id: string | null
  title: string | null
  status: string | null
  created_at: string | null
  thumbnail_url: string | null
}

export type WebhookEvent =
  | "video.created"
  | "video.ready"
  | "video.failed"
  | "character.created"
  | (string & {})

export interface Webhook {
  id: string
  url: string
  events: WebhookEvent[]
  name: string | null
  description: string | null
  is_active: boolean
  consecutive_failures: number
  auto_disabled_at: string | null
  last_delivery_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  created_at: string
  updated_at: string
  /** Only returned once, on create. Store it to verify deliveries. */
  secret?: string
}

/** Loosely typed payloads for endpoints whose shape evolves (characters, voices, music, ideas...). */
export type JsonObject = Record<string, unknown>

export interface DownloadLink {
  video_id: string
  /** Signed MP4 URL, valid for `expires_in` seconds (15 minutes). */
  download_url: string
  expires_in: number
  [key: string]: unknown
}

export interface Estimate {
  tool: string
  duration_seconds: number
  aspect_ratio: string
  credits: number
  [key: string]: unknown
}

/** The JSON body of every webhook delivery. */
export interface WebhookEnvelope<T = Record<string, unknown>> {
  event: WebhookEvent
  /** Stable per event: use it to de-duplicate retries. */
  event_id: string
  created_at: string
  organization_id: string
  data: T
}
