# MakeAIVideo SDK for TypeScript and JavaScript

[![npm version](https://img.shields.io/npm/v/@makeaivideo/sdk.svg)](https://www.npmjs.com/package/@makeaivideo/sdk) [![license: MIT](https://img.shields.io/npm/l/@makeaivideo/sdk.svg)](LICENSE) [![types: TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](https://www.typescriptlang.org/)

**`@makeaivideo/sdk` is the official TypeScript and JavaScript SDK for the [MakeAIVideo](https://makeaivideo.ai) API: it lets your code turn a brief or a script into a finished AI video (script, AI voiceover, AI or stock scenes, captions and music) and post it to connected TikTok, Instagram, YouTube and other social accounts.**

MakeAIVideo is an AI video generator for short-form video. The SDK wraps the [REST API](https://makeaivideo.ai/docs/api) ([SDK guide](https://makeaivideo.ai/docs/sdk)) and returns MP4s sized for [TikTok](https://makeaivideo.ai/tiktok-video-generator), [Instagram Reels](https://makeaivideo.ai/instagram-reels-generator) and [YouTube Shorts](https://makeaivideo.ai/ai-shorts-generator).

- Typed client for every endpoint: videos, scripts, tools, characters, voices, music, ideas, templates, publishing, webhooks
- Post or schedule finished videos to TikTok, Instagram, YouTube, Facebook Pages, LinkedIn, Threads, Pinterest, Bluesky, Telegram and Discord
- `waitForReady()` polling helper that respects the API's `poll_after_seconds`
- Automatic retries on rate limits and server errors, typed errors, idempotent creates
- Webhook signature verification
- Zero runtime dependencies, ESM and CommonJS, Node 18+

## Install

```bash
npm install @makeaivideo/sdk
```

Get an API key (it starts with `mav_`) in the [developer settings](https://app.makeaivideo.ai/developers). New to the API? Read the [quickstart](https://makeaivideo.ai/docs/quickstart) and [authentication guide](https://makeaivideo.ai/docs/authentication).

## Quickstart: brief in, MP4 out

```ts
import { MakeAIVideo } from "@makeaivideo/sdk"

const mav = new MakeAIVideo({ apiKey: process.env.MAKEAIVIDEO_API_KEY! })

// 1. See the video tools and the fields each one asks for
const tools = await mav.tools.list() // explainer, listicle, story, ugc, demo, article, spokesperson

// 2. Quote the cost, then create
const quote = await mav.videos.estimate({ tool: "explainer", duration_seconds: 30 })
const { video_id } = await mav.videos.create({
  tool: "explainer",
  fields: { topic: "Why octopuses have three hearts" },
  duration_seconds: 30,
  aspect_ratio: "9:16",
})

// 3. Wait for the render and download it
const video = await mav.videos.waitForReady(video_id, {
  onProgress: (v) => console.log(v.status),
})
console.log(video.download) // MP4 URL
```

## Bring your own script

```ts
const script = await mav.videos.script({ topic: "3 facts about the deep sea", target_duration: 30 })
// edit script.script as you like, then shoot it as written:
await mav.videos.create({ script: script.script, mode: "stock-narrated" })
```

## Post the video to social accounts

```ts
// Connected accounts (acc_... ids). To add one, send a person to the link from connect().
const { accounts } = await mav.publishing.accounts.list()
const { url } = await mav.publishing.accounts.connect("tiktok") // a PERSON opens this link

// Post now, or pass scheduled_for (ISO 8601) to schedule it
const post = await mav.publishing.publish(video_id, {
  account_ids: ["acc_..."],
  caption: "Why octopuses have three hearts #science",
  idempotency_key: "octopus-2026-10-01",
})
const status = await mav.publishing.posts.get(String(post.id)) // or subscribe to post.published / post.failed
```

Supported: TikTok, Instagram (as a Reel), YouTube (9:16 as a Short), Facebook Pages, LinkedIn, Threads and Pinterest connect by link; Bluesky, Telegram and Discord connect in the [web app](https://app.makeaivideo.ai). X is not supported. See [auto-post](https://makeaivideo.ai/auto-post).

## Webhooks instead of polling

```ts
import { verifyWebhookSignature } from "@makeaivideo/sdk"

const hook = await mav.webhooks.create({ url: "https://example.com/hooks/makeaivideo", events: ["video.ready", "video.failed"] })
// store hook.secret, then in your handler (raw body!):
if (!verifyWebhookSignature(rawBody, req.headers["x-makeaivideo-signature"], secret)) throw new Error("bad signature")
```

See the [webhooks guide](https://makeaivideo.ai/docs/webhooks) for events and retries.

## Errors

Every failure is a `MakeAIVideoError` with `status`, `code` and `requestId`. Subclasses: `AuthenticationError` (401), `PermissionError` (403, missing key scope), `ValidationError` (400), `InsufficientCreditsError` (402), `NotFoundError` (404), `RateLimitError` (429), `VideoFailedError` (render failed while waiting).

## API coverage

| Area | Methods |
| --- | --- |
| Account | `me()`, `credits()`, `workspace.get/update` |
| Videos | `videos.list/create/get/update/delete/generate/cancel/download/estimate/waitForReady`, `videos.renders.*`, `videos.regenerateScene`, `videos.voice.get/set`, `videos.captions`, `videos.shareLink` |
| Scripts | `videos.script`, `videos.scriptify`, `videos.fetchUrl`, `ai.enhancePrompt`, `ideas.generate` |
| Assets | `tools.list`, `templates.list`, `characters.*`, `voices.list/preview`, `music.list/generate`, `uploads.referenceFromUrl`, `brandKit.get/update` |
| Publishing | `publishing.accounts.list/connect`, `publishing.publish`, `publishing.posts.list/get` |
| Webhooks | `webhooks.list/create/get/update/delete/test/deliveries` |

Full endpoint reference: [makeaivideo.ai/docs/api](https://makeaivideo.ai/docs/api).

## FAQ

**What is MakeAIVideo?** An AI video generator that turns a prompt, script, image or talking avatar into a finished short-form video with voiceover, scenes, captions and music, then posts or schedules it to connected social accounts. [Learn more](https://makeaivideo.ai).

**What is `@makeaivideo/sdk`?** The official, MIT-licensed TypeScript/JavaScript client for the MakeAIVideo REST API (`https://app.makeaivideo.ai/api/v1`). Node 18+, ESM and CommonJS, zero runtime dependencies.

**Can it post videos to TikTok, Instagram or YouTube?** Yes. `publishing.publish()` posts a finished video now or on a schedule to accounts connected to your workspace. X is not supported.

**Can I use it from Claude, ChatGPT or Cursor instead of code?** Yes: connect the [MakeAIVideo MCP server](https://makeaivideo.ai/docs/mcp) at `https://mcp.makeaivideo.ai`, or install [`@makeaivideo/mcp`](https://github.com/makeaivideo-ai/mcp).

**How long does a video take?** Minutes. Create returns at once with a `video_id`; poll with `waitForReady()` or subscribe to the `video.ready` webhook.

**How is it priced?** MakeAIVideo is a paid product with monthly plans and a 7-day trial (card required). API calls use the same credits as the app, and `videos.estimate()` quotes the cost before you create. See [pricing](https://makeaivideo.ai/pricing).

**Where do I get support?** Open an [issue](https://github.com/makeaivideo-ai/sdk/issues) or email support@makeaivideo.ai.

## Links

- Website: [makeaivideo.ai](https://makeaivideo.ai)
- Developer hub: [makeaivideo.ai/developers](https://makeaivideo.ai/developers)
- SDK guide: [makeaivideo.ai/docs/sdk](https://makeaivideo.ai/docs/sdk)
- API reference: [makeaivideo.ai/docs/api](https://makeaivideo.ai/docs/api)
- OpenAPI spec: [app.makeaivideo.ai/api/v1/openapi.json](https://app.makeaivideo.ai/api/v1/openapi.json)
- REST base URL: `https://app.makeaivideo.ai/api/v1`
- MCP server: `https://mcp.makeaivideo.ai` ([setup guide](https://makeaivideo.ai/docs/mcp))
- API keys: [app.makeaivideo.ai/developers](https://app.makeaivideo.ai/developers)
- npm: [@makeaivideo/sdk](https://www.npmjs.com/package/@makeaivideo/sdk) · [@makeaivideo/mcp](https://www.npmjs.com/package/@makeaivideo/mcp) · [@makeaivideo/cli](https://www.npmjs.com/package/@makeaivideo/cli)
- GitHub: [makeaivideo-ai/sdk](https://github.com/makeaivideo-ai/sdk) · [makeaivideo-ai/mcp](https://github.com/makeaivideo-ai/mcp) · [makeaivideo-ai/cli](https://github.com/makeaivideo-ai/cli)
- Support: support@makeaivideo.ai

## About MakeAIVideo

[MakeAIVideo](https://makeaivideo.ai) is an AI video generator that turns a brief, a prompt, your own script, an image or a talking avatar into a finished, captioned short-form video: script, AI voiceover, AI-generated or stock scenes, captions and music, exported as an MP4 ready for TikTok, Instagram Reels and YouTube Shorts. It also does character swap, and posts or schedules videos to connected TikTok, Instagram, YouTube, Facebook Pages, LinkedIn, Threads, Pinterest, Bluesky, Telegram and Discord accounts. Operated by MintClips Ltd (UK).

- **Make videos in the app:** [prompt to video](https://makeaivideo.ai/prompt-to-video), [script to video](https://makeaivideo.ai/script-to-video), [image to video](https://makeaivideo.ai/image-to-video), [talking avatar](https://makeaivideo.ai/talking-avatar), [AI ad maker](https://makeaivideo.ai/ai-ad-maker), [blog to video](https://makeaivideo.ai/blog-to-video)
- **By format:** [TikTok video generator](https://makeaivideo.ai/tiktok-video-generator), [Instagram Reels generator](https://makeaivideo.ai/instagram-reels-generator), [AI Shorts generator](https://makeaivideo.ai/ai-shorts-generator), [faceless YouTube channel](https://makeaivideo.ai/faceless-youtube-channel), [AI UGC video](https://makeaivideo.ai/ai-ugc-video), [AI explainer video](https://makeaivideo.ai/ai-explainer-video), [AI spokesperson video](https://makeaivideo.ai/ai-spokesperson-video)
- **For developers:** [developer hub](https://makeaivideo.ai/developers), [API reference](https://makeaivideo.ai/docs/api), [SDK guide](https://makeaivideo.ai/docs/sdk), [quickstart](https://makeaivideo.ai/docs/quickstart), [authentication](https://makeaivideo.ai/docs/authentication), [webhooks](https://makeaivideo.ai/docs/webhooks), [MCP server](https://makeaivideo.ai/docs/mcp), [AI agents](https://makeaivideo.ai/docs/agents), [CLI](https://makeaivideo.ai/docs/cli)
- **Compare:** [MakeAIVideo vs HeyGen](https://makeaivideo.ai/compare/heygen), [MakeAIVideo vs Synthesia](https://makeaivideo.ai/compare/synthesia)
- [Auto-post to social](https://makeaivideo.ai/auto-post) · [Character swap](https://makeaivideo.ai/character-swap) · [Pricing](https://makeaivideo.ai/pricing) · [Free creator tools](https://makeaivideo.ai/tools) · [Blog](https://makeaivideo.ai/blog) · [Help](https://makeaivideo.ai/help) · [Contact](https://makeaivideo.ai/contact)

## Related packages

| Package | What it is |
| --- | --- |
| [`@makeaivideo/sdk`](https://github.com/makeaivideo-ai/sdk) | TypeScript / JavaScript SDK for the REST API |
| [`@makeaivideo/mcp`](https://github.com/makeaivideo-ai/mcp) | MCP server for Claude, ChatGPT, Cursor and other AI assistants |
| [`@makeaivideo/cli`](https://github.com/makeaivideo-ai/cli) | Command line tool: brief in, MP4 out |

## License

MIT © [MakeAIVideo](https://makeaivideo.ai)
