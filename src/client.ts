import { HttpClient, sleep } from "./http"
import { VideoFailedError, MakeAIVideoError } from "./errors"
import type {
  CreateVideoParams,
  Credits,
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
} from "./types"

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

  /** Credit balance for the current billing period. */
  credits(): Promise<Credits> {
    return this.http.request("GET", "/credits")
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
    /** Recent videos in the workspace. */
    list: async (): Promise<VideoSummary[]> =>
      (await this.http.request<{ videos: VideoSummary[] }>("GET", "/videos")).videos,

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

    get: (videoId: string): Promise<Video> =>
      this.http.request("GET", `/videos/${encodeURIComponent(videoId)}`),

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

    /** Quote the credit cost before creating. */
    estimate: (params: { tool: string; duration_seconds?: number; aspect_ratio?: AspectRatio } & JsonObject): Promise<Estimate> =>
      this.http.request("POST", "/videos/estimate", { body: params }),

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
      create: (videoId: string): Promise<JsonObject> =>
        this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/renders`, { body: {} }),
      progress: (videoId: string): Promise<JsonObject> =>
        this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/renders/progress`),
    },

    /** Rewrite one scene's narration and regenerate it. */
    regenerateScene: (videoId: string, sceneNumber: number, params: { narration?: string } = {}): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/scenes/${sceneNumber}/regenerate`, { body: params }),

    voice: {
      get: (videoId: string): Promise<JsonObject> =>
        this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/voice`),
      /** Re-voice a video with another voice. */
      set: (videoId: string, params: { voice_id: string; voice_stability?: number; scenes?: number[] }): Promise<JsonObject> =>
        this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/voice`, { body: params }),
    },

    captions: (videoId: string): Promise<JsonObject> =>
      this.http.request("GET", `/videos/${encodeURIComponent(videoId)}/captions`),

    shareLink: (videoId: string, params: { expires_in_seconds?: number } = {}): Promise<JsonObject> =>
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/share-link`, { body: params }),

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
  }

  readonly music = {
    list: (): Promise<JsonObject> => this.http.request("GET", "/music"),
    /** Generate an original background track. */
    generate: (params: { prompt: string; duration?: number; mood?: string }): Promise<JsonObject> =>
      this.http.request("POST", "/music", { body: params }),
  }

  readonly uploads = {
    /** Import a reference image (product photo, face) by URL. */
    referenceFromUrl: (imageUrl: string): Promise<JsonObject> =>
      this.http.request("POST", "/uploads/reference-from-url", { body: { image_url: imageUrl } }),
  }

  readonly brandKit = {
    get: (): Promise<JsonObject> => this.http.request("GET", "/brand-kit"),
    update: (patch: { show_watermark?: boolean; remove_watermark?: boolean }): Promise<JsonObject> =>
      this.http.request("PATCH", "/brand-kit", { body: patch }),
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
      this.http.request("POST", `/videos/${encodeURIComponent(videoId)}/publish`, { body: params }),
    posts: {
      /** Publish history, newest first. */
      list: (params: { limit?: number; cursor?: string; video_id?: string } = {}): Promise<JsonObject> =>
        this.http.request("GET", "/publishing/posts", { query: params }),
      /** One post: status and per-destination results. */
      get: (postId: string): Promise<JsonObject> =>
        this.http.request("GET", `/publishing/posts/${encodeURIComponent(postId)}`),
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
