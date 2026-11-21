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
  | "waiting_for_plan"
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
  /** Spendable balance in US dollars, rounded down. */
  balance_usd?: number | null
  credits_per_usd?: number
  plan: string
  subscription_status: string
  allowance: number
  bonus: number
  used: number
  remaining: number
  /** When the plan credits refill (ISO time): the renewal, or the plan start after a trial. Null when nothing refills. */
  resets_at?: string | null
  /** Plan credits granted at `resets_at`. */
  refill_credits?: number | null
  refill_kind?: "renewal" | "plan_start" | null
  /** `credits.low` fires once per credit period when `remaining` falls under this. */
  low_balance_threshold?: number
  /** A link the USER opens in a browser to add credits or start their plan. */
  top_up_url?: string
}

/** From `topUpLink()`: a link a person opens to pay on Stripe's page. The API never charges a card. */
export interface TopUpLink {
  url: string
  /** "checkout" for a set amount, or "get_more_credits" (the popup on Billing). */
  opens: "checkout" | "get_more_credits" | (string & {})
  amount_usd: number | null
  credits: number | null
  remaining: number
  note: string
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
  /** From `videos.script()`: send it back unchanged so the video follows the brief's rules. */
  brief_key?: string
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
  /** AI video quality: "best" (default) or "fast" (faster and cheaper, a bit less detail). */
  quality?: "best" | "fast"
  /** Optional, prefer `quality`. */
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
  /** Target length in seconds; also the ceiling for the finished video. */
  duration_seconds?: number
  /** Footage: AI scenes, stock footage, or AI stills with slow camera moves. */
  mode?: VideoMode
  /** Up to 5 keys from `uploads.reference()` / `uploads.referenceFromUrl()`: real product photos. */
  product_image_keys?: string[]
}

/** Bring your own script: it is shot as written. */
export type VideoMode = "talking-head" | "cinematic" | "hybrid" | "stock-narrated" | "smart-mix" | "ai-pictures"

export interface CreateVideoFromScript extends CreateVideoCommon {
  script: VideoScript
  mode?: VideoMode
  style?: string
  /** Length ceiling in seconds; defaults to the script's total_duration_seconds and can only lower it. */
  max_duration_seconds?: number
  /** Default true. false renders without narration and costs fewer credits (not for talking-head). */
  voiceover?: boolean
}

export type CreateVideoParams = CreateVideoFromBrief | CreateVideoFromScript

export interface VideoCreated {
  video_id: string
  status: VideoStatus
  /** true while the video waits for your other videos to finish (up to 5 render at once). It starts by itself. */
  waiting_for_slot?: boolean
  note?: string
  title: string | null
  scene_count: number | null
  poll_after_seconds: number | null
  next: string
}

export interface Video {
  video_id: string
  title: string | null
  status: VideoStatus
  progress: { note?: string; scenes_done?: number; scenes_total?: number | null } & Record<string, unknown>
  waiting_for_slot?: boolean
  duration_seconds: number | null
  aspect_ratio: AspectRatio | null
  /** What the video cost in US dollars, rounded up. */
  cost_usd?: number | null
  credits_used: number | null
  error: string | null
  /** Machine code for the failure, e.g. quota_exceeded, validation_failed. */
  error_code?: string | null
  /** scripting: no script was written (create it again). start: the script is saved but the render could not start. */
  failed_stage?: "scripting" | "start" | null
  retryable?: boolean | null
  /** Direct MP4 URL once `status` is "ready". */
  download: string | null
  created_at: string | null
  updated_at: string | null
  poll_after_seconds: number | null

  /** status "waiting_for_plan": asked for while the account had no plan or trial. It starts by itself once one is active, and expires after 24 hours (`expires_at`). */
  waiting_for_plan?: boolean
  /** waiting_for_plan only: the page the USER opens to start their trial or plan. */
  start_trial_url?: string
  /** waiting_for_plan only: words an agent can pass to the user. */
  say_to_user?: string
  expires_at?: string | null
  credits_estimate?: number | null

  /** A still of the video (lasting URL). */
  thumbnail_url?: string | null
  /** The owner's page for the video (needs sign-in). Not a public link: `videos.shareLink()` makes one. */
  web_url?: string
  /** The owner's editor page (needs sign-in). */
  editor_url?: string
  mode?: VideoMode | (string & {}) | null
  quality?: "best" | "fast" | (string & {}) | null
  /** Where an edit stands (a scene remake, a re-voice, the export after it). */
  edit?: VideoEditState

  // ── Only with `videos.get(id, { include: "scenes" })` ──
  voiceover?: boolean
  script?: { title: string | null; hook: string | null; hashtags: string[]; scenes_total: number }
  scenes?: VideoScene[]
  captions?: { style: string; alignment: string | null; on: boolean }
  music?: VideoMusic
  voice?: { voice_id: string | null; name: string | null; note: string | null }
  /** What the writer could not do from the brief, in words for the user. */
  plan_note?: string | null
  cannot_do?: string[]
  /** A scene that missed the brief, and the fix (`free` when the fix costs nothing). */
  brief_miss?: { note: string; fix: string | null; free: boolean } | null
  /** A free export is owed (e.g. after a free remake): `videos.renders.create()` costs nothing. */
  free_export_pending?: boolean
}

/** Where edits to a finished video stand. While `in_progress`, the download is the OLD file. */
export interface VideoEditState {
  in_progress: boolean
  stage: "remaking_scene" | "re_voicing" | "updating_file" | null
  /** Scenes being remade or re-voiced now. */
  scenes: number[]
  /** The last edit's export did not happen or failed: export again (`videos.renders.create()`) to put it in the file. */
  file_out_of_date: boolean
  note: string | null
}

/** One scene of a video, from `videos.get(id, { include: "scenes" })`. */
export interface VideoScene {
  scene_number: number
  narration: string
  visual_description: string
  /** Who is on screen or speaking: a cast member's name, "presenter", or null. */
  character: string | null
  scene_type: "character" | "scene" | "product_still" | (string & {}) | null
  duration_seconds: number | null
  quality: "best" | "fast" | (string & {})
  /** A still of the scene (lasting public URL) when one was made. */
  thumbnail_url: string | null
  clip_url: string | null
  /** Our clip check still fails this scene after its re-roll. */
  flagged: boolean
  /** A flagged scene can be remade once for free (`regenerateScene` with `use_free_remake: true`). */
  free_remake: boolean
  /** The mouth moves with the line: change the line with `regenerateScene({ narration })`, not `editSceneNarration` (that answers 409 lip_synced_scene). */
  lip_synced: boolean
}

export interface VideoMusic {
  track_id: string | null
  name: string | null
  volume: number | null
  source: "library" | "generated" | "upload" | "none"
}

/** A track from `music.library()`. */
export interface LibraryTrack {
  track_id: string
  name: string
  description: string
  mood: string
  duration_seconds: number
  preview_url: string
}

/** One row of the paged list (`videos.listPage()`). */
export interface VideoListItem {
  video_id: string
  title: string | null
  status: VideoStatus
  waiting_for_slot: boolean
  mode: string | null
  aspect_ratio: AspectRatio | null
  duration_seconds: number | null
  credits_used: number
  /** "app", "api", "mcp", ... */
  created_via: string
  created_at: string
  updated_at: string
  thumbnail_url: string | null
  web_url: string
}

export interface VideoListPage {
  videos: VideoListItem[]
  /** Pass to the next `listPage({ cursor })`; null on the last page. */
  next_cursor: string | null
  limit: number
}

/**
 * Price confirmation for paid edits. A paid edit needs `max_credits`
 * (without it: 409 `price_required` with the price; above it: 409
 * `price_over_limit`). Nothing is charged either way, and the charge never
 * passes `max_credits`. `dry_run: true` returns the price only.
 */
export interface PricedEditOptions {
  dry_run?: boolean
  max_credits?: number
  /** Export the video again when the edit is done (priced in). */
  auto_export?: boolean
  /** A retry with the same key gets the first answer instead of a second charge. Sent as the Idempotency-Key header. */
  idempotency_key?: string
}

/** Machine codes in `error.code` (`MakeAIVideoError.code`) worth branching on. */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "insufficient_credits"
  /** A paid edit without max_credits: details carry the price. Nothing charged. */
  | "price_required"
  /** The price is above max_credits (or a held create). Nothing charged. */
  | "price_over_limit"
  /** That scene is being remade now: wait for `edit.in_progress` to clear. Retryable. */
  | "already_running"
  /** The scene's mouth moves with its line: use `regenerateScene({ narration })`. */
  | "lip_synced_scene"
  | "conflict"
  | "publishing_unavailable"
  | "no_accounts"
  | "account_unavailable"
  | "video_too_large"
  | (string & {})

/** A row of `videos.list()` (the unpaged form: the newest 50). For paging use `videos.listPage()`. */
export interface VideoSummary {
  video_id: string | null
  title: string | null
  status: string | null
  waiting_for_slot?: boolean
  created_at: string | null
  thumbnail_url: string | null
}

export type WebhookEvent =
  | "video.created"
  | "video.ready"
  | "video.failed"
  | "character.created"
  | "post.published"
  | "post.partially_failed"
  | "post.failed"
  | "credits.low"
  | "credits.refilled"
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
  /** Set for a brief-tool quote. */
  tool?: string
  /** Set for a `kind` quote (prompt-to-video, image-to-video, talking-avatar, character-swap). */
  kind?: string
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
