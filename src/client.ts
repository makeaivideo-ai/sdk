import { HttpClient, sleep } from "./http"
import { VideoFailedError, MakeAIVideoError } from "./errors"
import type {
  CreateVideoParams,
  Credits,
  TopUpLink,
  DownloadLink,
  Estimate,
  JsonObject,
  MakeAIVideoConfig,
  Me,
  Tool,
  Video,
  VideoCreated,
  VideoScript,
  VideoSummary,
  Webhook,
  WebhookEvent,
  Workspace,
  AspectRatio,
  VideoListPage,
  VideoListItem,
  VideoStatus,
  VideoMode,
  PricedEditOptions,
  LibraryTrack,
  VideoMusic,
} from "./types"
import type { ApiPost } from "./schemas.generated"

/** A file to upload: a Blob or File (Node 18+ and browsers), with an optional name. */
export type UploadFile = Blob | { data: Blob; name: string }

function formWith(field: string, files: UploadFile[]): FormData {
  const form = new FormData()
  for (const f of files) {
    if (f instanceof Blob) form.append(field, f, (f as Blob & { name?: string }).name ?? "upload")
    else form.append(field, f.data, f.name)
  }
  return form
}

const TERMINAL_OK = new Set(["ready"])
const TERMINAL_FAIL = new Set(["failed"])

export interface WaitOptions {
  /** Give up after this many ms (default 15 minutes). */
  timeoutMs?: number
  /** Minimum poll interval in ms (default 5000; the API's poll_after_seconds wins when larger). */
  intervalMs?: number
  /** Called after every poll, e.g. to print progress. */
  onProgress?: (video: Video) => void
  signal?: AbortSignal
}

/**
 * The MakeAIVideo API client.
 *
 * ```ts
 * import { MakeAIVideo } from "@makeaivideo/sdk"
 * const mav = new MakeAIVideo({ apiKey: process.env.MAKEAIVIDEO_API_KEY! })
 * const { video_id } = await mav.videos.create({ tool: "explainer", fields: { topic: "Why octopuses have three hearts" } })
 * const video = await mav.videos.waitForReady(video_id)
 * console.log(video.download)
 * ```
 */
export class MakeAIVideo {
  private readonly http: HttpClient

  constructor(config: MakeAIVideoConfig) {
    this.http = new HttpClient(config)
  }

  /** Who this key belongs to, its scopes, and the credit balance. */
  me(): Promise<Me> {
    return this.http.request("GET", "/me")
  }

  /** Credit balance for the current billing period, when it refills, and the add-credits link. */
  credits(): Promise<Credits> {
    return this.http.request("GET", "/credits")
  }

  /**
   * A link the USER opens in a browser to add credits (they pay on Stripe's
   * page; nothing is charged from the API). Pass `credits` (e.g. an
   * `InsufficientCreditsError`'s `shortfall`) or `amount_usd` (whole dollars,
   * 5-500) to open checkout for that amount; with neither it opens the
   * Get more credits popup.
   */
  topUpLink(params: { credits?: number; amount_usd?: number } = {}): Promise<TopUpLink> {
    return this.http.request("GET", "/credits/top-up-link", { query: params })
  }

  readonly tools = {
    /** Every video tool with the brief fields it asks for. */
    list: async (): Promise<Tool[]> =>
      (await this.http.request<{ tools: Tool[] }>("GET", "/tools")).tools,
  }

  readonly templates = {
    /** Finished example videos you can remix. */
    list: (): Promise<JsonObject> => this.http.request("GET", "/templates"),
  }

  readonly workspace = {
    get: (): Promise<Workspace> => this.http.request("GET", "/workspace"),
    update: (
      patch: Partial<Pick<Workspace, "name" | "description" | "default_aspect_ratio" | "default_style" | "default_character_id">>
    ): Promise<Workspace> => this.http.request("PATCH", "/workspace", { body: patch }),
  }

  readonly videos = {
    /** Recent videos in the workspace (the newest 50). For older videos use `listPage()` or `iterate()`. */
    list: async (): Promise<VideoSummary[]> =>
      (await this.http.request<{ videos: VideoSummary[] }>("GET", "/videos")).videos,

    /**
     * One page of videos, newest first. Pass `next_cursor` back as `cursor`
     * for the next page (null on the last). `status` filters.
     */
    listPage: (
      params: { limit?: number; cursor?: string; status?: Exclude<VideoStatus, "idea" | "waiting_for_plan"> } = {}
    ): Promise<VideoListPage> =>
      this.http.request("GET", "/videos", { query: { limit: params.limit ?? 20, cursor: params.cursor, status: params.status } }),

    /** Every video, newest first, page by page: `for await (const v of mav.videos.iterate()) ...` */
    iterate: (
      params: { pageSize?: number; status?: Exclude<VideoStatus, "idea" | "waiting_for_plan"> } = {}
    ): AsyncGenerator<VideoListItem> => this.iterateVideos(params),

    /**
     * Create a video. Either name a tool + fields (we write the script) or
     * pass your own `script`. Generation starts immediately unless
     * `start_generation: false`.
     */
    create: (params: CreateVideoParams): Promise<VideoCreated> =>
      this.http.request("POST", "/videos", {
        body: params,
        idempotencyKey: params.idempotency_key,
      }),

    /**
     * Status and progress. Always has `edit` (a change still being made),
     * `thumbnail_url`, `web_url` and `editor_url`. With `{ include: "scenes" }`
     * also the script, `scenes` (each with `lip_synced`, `flagged`,
     * `free_remake`, still and clip URLs), captions, music, voice and `brief_miss`.
     */
    get: (videoId: string, opts: { include?: "scenes" } = {}): Promise<Video> =>
      this.http.request("GET", `/videos/${encodeURIComponent(videoId)}`, { query: { include: opts.include } }),

    update: (videoId: string, patch: { title?: string } & JsonObject): Promise<Video> =>
      this.http.request("PATCH", `/videos/${encodeURIComponent(videoId)}`, { body: patch }),

    delete: (videoId: string): Promise<JsonObject> =>
      this.http.request("DELETE", `/videos/${encodeURIComponent(videoId)}`),

    /** Start rendering a draft created with `start_generation: false`. */
    generate: (videoId: string): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/generate`, { body: {} }),

    cancel: (videoId: string): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/cancel`, { body: {} }),

    /** A signed MP4 URL, valid 15 minutes. */
    download: (videoId: string): Promise<DownloadLink> =>
      this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/download`),

    /**
     * Free price quote in credits. Send exactly one of `tool` (a brief tool),
     * `script`, or `kind` (prompt-to-video, image-to-video, talking-avatar,
     * character-swap; with `text` for the prompt, narration or words said).
     */
    estimate: (
      params: {
        tool?: string
        kind?: "prompt-to-video" | "image-to-video" | "talking-avatar" | "character-swap"
        text?: string
        duration_seconds?: number
        mode?: string
        aspect_ratio?: AspectRatio
        quality?: "best" | "fast"
      } & JsonObject
    ): Promise<Estimate> => this.http.request("POST", "/videos/estimate", { body: params }),

    /**
     * Prompt to video: a video from a prompt in your own words (an idea, a
     * skit, an ad, a story, a finished script), written as the web app's
     * Prompt to video writes it. Answers with status `scripting`; poll
     * `get()` or use `waitForReady()`. `max_credits` holds the create
     * (nothing made, 409 price_over_limit) when the price is above it.
     */
    createFromPrompt: (params: {
      topic: string
      duration_seconds?: number
      mode?: Extract<VideoMode, "cinematic" | "stock-narrated" | "ai-pictures">
      quality?: "best" | "fast"
      aspect_ratio?: AspectRatio
      language?: string
      voiceover?: boolean
      voice_id?: string
      music_id?: string
      caption_style?: string
      title?: string
      /** A template id from `templates.list()`: its look, your words. */
      template_id?: string
      start_generation?: boolean
      max_credits?: number
      idempotency_key?: string
    }): Promise<VideoCreated> =>
      this.http.request("POST", "/videos/prompt-to-video", { body: params, idempotencyKey: params.idempotency_key }),

    /** Write a script without creating a video. */
    script: (params: { topic?: string; brief?: { tool: string; fields: Record<string, string>; duration_seconds?: number; aspect_ratio?: AspectRatio; language?: string }; mode?: string; target_duration?: number; language?: string; character_name?: string }): Promise<{ script: VideoScript; credits: number | null }> =>
      this.http.request("POST", "/videos/script", { body: params }),

    /** Turn your own prose into a scene-by-scene script. */
    scriptify: (params: { text: string; mode?: string; target_duration?: number }): Promise<JsonObject> =>
      this.http.request("POST", "/videos/scriptify", { body: params }),

    /** Fetch an article's text to use as a brief. */
    fetchUrl: (url: string): Promise<JsonObject> =>
      this.http.request("POST", "/videos/fetch-url", { body: { url } }),

    renders: {
      list: (videoId: string): Promise<{ renders: JsonObject[] }> =>
        this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/renders`),
      /** Export again (after edits). `dry_run` returns the most it costs; `max_credits` refuses above it. */
      create: (videoId: string, params: { dry_run?: boolean; max_credits?: number } = {}): Promise<JsonObject> =>
        this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/renders`, { body: params }),
      progress: (videoId: string): Promise<JsonObject> =>
        this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/renders/progress`),
    },

    /**
     * Remake one scene (new picture), optionally with a new line
     * (`narration`) or new picture direction (`visual_description`).
     * Paid: send `max_credits` (see `PricedEditOptions`), or
     * `use_free_remake: true` for a flagged scene's free remake.
     * 409 `already_running` while that scene is being remade.
     */
    regenerateScene: (
      videoId: string,
      sceneNumber: number,
      params: {
        narration?: string
        visual_description?: string
        /** "best": remake a scene of a Fast video in Best quality, at the Best price. */
        quality?: "best"
        use_free_remake?: boolean
      } & PricedEditOptions = {}
    ): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/scenes/${sceneNumber}/regenerate`, {
        body: params,
        idempotencyKey: params.idempotency_key,
      }),

    /**
     * Change one scene's line and re-record only that scene; the picture is
     * kept. A lip-synced scene answers 409 `lip_synced_scene` (use
     * `regenerateScene({ narration })`). Needs `max_credits` when priced.
     */
    editSceneNarration: (
      videoId: string,
      sceneNumber: number,
      params: { narration: string } & PricedEditOptions
    ): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/scenes/${sceneNumber}/narration`, {
        body: params,
        idempotencyKey: params.idempotency_key,
      }),

    /**
     * Change or remove the background music (`track_id` from
     * `music.library()` or `music.list()`, or "none"). Free; export again
     * (`renders.create()`) to put it in the file.
     */
    setMusic: (videoId: string, params: { track_id?: string; volume?: number }): Promise<{ video_id: string; music: VideoMusic; next_step: string }> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/music`, { body: params }),

    voice: {
      get: (videoId: string): Promise<JsonObject> =>
        this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/voice`),
      /**
       * Re-voice a video with another voice; `scenes` also changes lines.
       * Needs `max_credits` when priced (see `PricedEditOptions`).
       */
      set: (
        videoId: string,
        params: {
          voice_id: string
          voice_stability?: "stable" | "balanced" | "expressive"
          scenes?: Array<{ scene_number: number; narration: string }>
        } & PricedEditOptions
      ): Promise<JsonObject> =>
        this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/voice`, { body: params, idempotencyKey: params.idempotency_key }),
    },

    captions: (videoId: string): Promise<JsonObject> =>
      this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/captions`),

    shareLink: (videoId: string, params: { expires_in_seconds?: number } = {}): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/share-link`, { body: params }),

    /** Flag a generated video for review. */
    report: (
      videoId: string,
      params: { reason: string; category?: "nsfw" | "violence" | "trademark" | "harassment" | "other" }
    ): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/report`, { body: params }),

    /**
     * Animate one image into a 5, 10 or 15 s clip. Optional `narration` makes
     * the subject speak it (voice + lip sync). `image_key` comes from
     * `uploads.reference()` or `uploads.referenceFromUrl()`.
     */
    imageToVideo: (params: {
      image_key: string
      duration_seconds?: 5 | 10 | 15
      animation_prompt?: string
      narration?: string
      voice_id?: string
      title?: string
      quality?: "best" | "fast"
      idempotency_key?: string
    }): Promise<VideoCreated> =>
      this.http.request("POST", "/videos/image-to-video", { body: params, idempotencyKey: params.idempotency_key }),

    /**
     * Your own filmed video speaks a new script (voice + lip sync onto your
     * clip). `avatar_video_key` comes from `uploads.videoAvatar()` or
     * `uploads.videoFromUrl()`. For an AI presenter, use `create` with mode talking-head.
     */
    talkingAvatar: (params: {
      avatar_video_key: string
      script: string
      voice_id: string
      add_broll?: boolean
      title?: string
      idempotency_key?: string
    }): Promise<VideoCreated> =>
      this.http.request("POST", "/videos/talking-avatar", { body: params, idempotencyKey: params.idempotency_key }),

    /**
     * Character Swap: the person in your 3-60 s video becomes a character
     * (`character_id`) or the person in 1-4 photos (`photo_keys`). Motion,
     * camera, room and the original audio are kept. `rights_confirmed` must
     * be true: you own the video (or have permission) and may use the likeness.
     */
    characterSwap: (params: {
      source_video_key: string
      duration_seconds: number
      rights_confirmed: true
      character_id?: number
      photo_keys?: string[]
      direction?: string
      title?: string
      idempotency_key?: string
    }): Promise<VideoCreated> =>
      this.http.request("POST", "/videos/character-swap", { body: params, idempotencyKey: params.idempotency_key }),

    /**
     * Poll until the video is ready (returns it, with `download` set) or
     * failed (throws VideoFailedError). Respects the API's poll_after_seconds.
     */
    waitForReady: async (videoId: string, opts: WaitOptions = {}): Promise<Video> => {
      const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000)
      const minInterval = opts.intervalMs ?? 5000
      for (;;) {
        if (opts.signal?.aborted) throw new MakeAIVideoError("Aborted", { status: 0, code: "aborted" })
        const video = await this.videos.get(videoId)
        opts.onProgress?.(video)
        if (TERMINAL_OK.has(video.status)) return video
        if (TERMINAL_FAIL.has(video.status)) {
          throw new VideoFailedError(videoId, video.error ?? "Video generation failed")
        }
        if (Date.now() > deadline) {
          throw new MakeAIVideoError(`Timed out waiting for video ${videoId} (last status: ${video.status})`, {
            status: 0,
            code: "timeout",
            retryable: true,
          })
        }
        await sleep(Math.max(minInterval, (video.poll_after_seconds ?? 0) * 1000))
      }
    },
  }

  private async *iterateVideos(params: { pageSize?: number; status?: Exclude<VideoStatus, "idea" | "waiting_for_plan"> }): AsyncGenerator<VideoListItem> {
    let cursor: string | undefined
    for (;;) {
      const page = await this.videos.listPage({ limit: params.pageSize ?? 100, cursor, status: params.status })
      for (const v of page.videos) yield v
      if (!page.next_cursor) return
      cursor = page.next_cursor
    }
  }

  readonly ideas = {
    /** Brainstorm scored video ideas for a niche. */
    generate: (params: { niche: string; audience?: string; tone?: string; count?: number }): Promise<JsonObject> =>
      this.http.request("POST", "/ideas", { body: params }),
  }

  readonly ai = {
    enhancePrompt: (params: { topic: string; mode?: string }): Promise<JsonObject> =>
      this.http.request("POST", "/ai/enhance-prompt", { body: params }),
  }

  readonly characters = {
    list: (): Promise<JsonObject> => this.http.request("GET", "/characters"),
    get: (id: number | string): Promise<JsonObject> =>
      this.http.request("GET", `/characters/${encodeURIComponent(String(id))}`),
    create: (params: {
      name: string
      description?: string
      style?: string
      tags?: string[]
      portrait_temp_key?: string
      voice_preview_temp_key?: string
      reference_temp_keys?: string[]
      voice_id?: string
      voice_settings?: JsonObject
      generation_prompt?: string
    }): Promise<JsonObject> => this.http.request("POST", "/characters", { body: params }),
    update: (id: number | string, patch: JsonObject): Promise<JsonObject> =>
      this.http.request("PATCH", `/characters/${encodeURIComponent(String(id))}`, { body: patch }),
    delete: (id: number | string): Promise<JsonObject> =>
      this.http.request("DELETE", `/characters/${encodeURIComponent(String(id))}`),
    /** Generate portrait options for a new character. */
    variations: (params: { prompt: string; style?: string; reference_image_urls?: string[]; count?: number }): Promise<JsonObject> =>
      this.http.request("POST", "/characters/variations", { body: params }),
    voicePreviews: (params: JsonObject): Promise<JsonObject> =>
      this.http.request("POST", "/characters/voice-previews", { body: params }),
  }

  readonly voices = {
    list: (filters: { gender?: string; accent?: string; age?: string; use_case?: string } = {}): Promise<JsonObject> =>
      this.http.request("GET", "/voices", { query: filters }),
    preview: (params: JsonObject): Promise<JsonObject> =>
      this.http.request("POST", "/voices/preview", { body: params }),
    /** The stock sample line of one voice. */
    sample: (voiceId: string): Promise<JsonObject> =>
      this.http.request("GET", `/voices/${encodeURIComponent(voiceId)}/preview`),
  }

  readonly music = {
    list: (): Promise<JsonObject> => this.http.request("GET", "/music"),
    /** Generate an original background track. */
    generate: (params: { prompt: string; duration?: number; mood?: string }): Promise<JsonObject> =>
      this.http.request("POST", "/music", { body: params }),
    /** The background music library the editor offers (free). Use a `track_id` with `videos.setMusic()` or as `music_id` on a create. */
    library: (
      params: { mood?: "calm" | "upbeat" | "cinematic" | "emotional" | "curious" | "adventure" | "electronic" | "inspirational" | "tense" | "quirky" } = {}
    ): Promise<{ tracks: LibraryTrack[]; total: number; moods: unknown[]; note?: string }> =>
      this.http.request("GET", "/music/library", { query: params }),
  }

  readonly uploads = {
    /** Import a reference image (product photo, face) by URL. */
    referenceFromUrl: (imageUrl: string): Promise<JsonObject> =>
      this.http.request("POST", "/uploads/reference-from-url", { body: { image_url: imageUrl } }),
    /** Upload reference images (up to 25 MB each): product photos, faces, an image to animate. */
    reference: (files: UploadFile | UploadFile[]): Promise<JsonObject> =>
      this.http.request("POST", "/uploads/reference", { body: formWith("files", Array.isArray(files) ? files : [files]) }),
    /** Import a video (MP4/MOV/WebM, up to 100 MB) by URL, for `talkingAvatar` or `characterSwap`. */
    videoFromUrl: (videoUrl: string): Promise<JsonObject> =>
      this.http.request("POST", "/uploads/video-from-url", { body: { video_url: videoUrl } }),
    /** Upload a short video of a person, for `talkingAvatar` or `characterSwap`. */
    videoAvatar: (file: UploadFile): Promise<JsonObject> =>
      this.http.request("POST", "/uploads/video-avatar", { body: formWith("file", [file]) }),
  }

  readonly brandKit = {
    get: (): Promise<JsonObject> => this.http.request("GET", "/brand-kit"),
    update: (patch: { show_watermark?: boolean; remove_watermark?: boolean }): Promise<JsonObject> =>
      this.http.request("PATCH", "/brand-kit", { body: patch }),
    /** Upload a watermark image (a PNG with transparency works best). */
    watermark: (file: UploadFile): Promise<JsonObject> =>
      this.http.request("POST", "/brand-kit/watermark", { body: formWith("file", [file]) }),
    /** Import the watermark image from a public URL (PNG, WebP or JPEG, up to 5 MB). */
    watermarkFromUrl: (imageUrl: string): Promise<{ watermark_url: string | null }> =>
      this.http.request("POST", "/brand-kit/watermark-from-url", { body: { image_url: imageUrl } }),
  }

  /**
   * Post finished videos to the social accounts connected to this workspace:
   * TikTok, Instagram, YouTube, Facebook Pages, LinkedIn, X, Threads,
   * Pinterest, Bluesky, Telegram and Discord.
   */
  readonly publishing = {
    accounts: {
      /** Connected accounts (acc_... ids), the plan's account limit, and every platform. */
      list: (): Promise<JsonObject> => this.http.request("GET", "/publishing/accounts"),
      /** A short-lived link a PERSON opens in a browser to connect one OAuth account. */
      connect: (platform: string): Promise<JsonObject> =>
        this.http.request("POST", "/publishing/accounts/connect", { body: { platform } }),
    },
    /** Post a finished video now, or schedule it with `scheduled_for`. Async: poll posts.get or use post.* webhooks. */
    publish: (
      videoId: string,
      params: {
        account_ids: string[]
        caption: string
        caption_overrides?: Record<string, string>
        youtube_title?: string | null
        scheduled_for?: string | null
        timezone?: string
        idempotency_key?: string
      },
    ): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/publish`, { body: params, idempotencyKey: params.idempotency_key }),
    /** A ready-to-post caption with hashtags, written from the video's script (free; saved on the video). */
    suggestCaption: (
      videoId: string,
      params: { refresh?: boolean } = {}
    ): Promise<{ video_id: string; caption: string; per_platform: Record<string, string> | null; youtube_title: string; fallback: boolean; cached: boolean }> =>
      this.http.request("POST", "/publishing/caption-suggest", { body: { video_id: videoId, ...params } }),
    posts: {
      /** Publish history, newest first. */
      list: (params: { limit?: number; cursor?: string; video_id?: string } = {}): Promise<JsonObject> =>
        this.http.request("GET", "/publishing/posts", { query: params }),
      /** One post: status and per-destination results. */
      get: (postId: string): Promise<JsonObject> =>
        this.http.request("GET", `/publishing/posts/${encodeURIComponent(postId)}`),
      /** Move a scheduled post (while scheduled and more than about 2 minutes away). ISO 8601 with an offset. */
      reschedule: (postId: string, scheduledFor: string): Promise<ApiPost> =>
        this.http.request("PATCH", `/publishing/posts/${encodeURIComponent(postId)}`, { body: { scheduled_for: scheduledFor } }),
      /** Cancel a scheduled post (while scheduled and more than about 2 minutes away). */
      cancel: (postId: string): Promise<ApiPost> =>
        this.http.request("DELETE", `/publishing/posts/${encodeURIComponent(postId)}`),
    },
  }

  readonly webhooks = {
    list: async (): Promise<Webhook[]> => {
      const r = await this.http.request<{ webhooks?: Webhook[] } | Webhook[]>("GET", "/webhooks")
      return Array.isArray(r) ? r : r.webhooks ?? []
    },
    /** The response includes `secret` once: store it to verify deliveries. */
    create: (params: { url: string; events: WebhookEvent[]; name?: string; description?: string }): Promise<Webhook> =>
      this.http.request("POST", "/webhooks", { body: params }),
    get: (id: string): Promise<Webhook> => this.http.request("GET", `/webhooks/${encodeURIComponent(id)}`),
    update: (id: string, patch: Partial<Pick<Webhook, "url" | "events" | "name" | "description" | "is_active">>): Promise<Webhook> =>
      this.http.request("PATCH", `/webhooks/${encodeURIComponent(id)}`, { body: patch }),
    delete: (id: string): Promise<JsonObject> => this.http.request("DELETE", `/webhooks/${encodeURIComponent(id)}`),
    test: (id: string): Promise<JsonObject> =>
      this.http.request("POST", `/webhooks/${encodeURIComponent(id)}/test`, { body: {} }),
    deliveries: (id: string): Promise<JsonObject> =>
      this.http.request("GET", `/webhooks/${encodeURIComponent(id)}/deliveries`),
  }
}
