# Changelog

## 1.1.1 (2026-09-30)

- README: "What you can make with MakeAIVideo" section linking each video type; npm keywords for each video type. No code changes.

## 1.1.0 (2026-09-30)

- New `publishing` namespace: `publishing.accounts.list()`, `publishing.accounts.connect(platform)`, `publishing.publish(videoId, {...})`, `publishing.posts.list()`, `publishing.posts.get(id)`. Post or schedule finished videos to connected TikTok, Instagram, YouTube, Facebook Pages, LinkedIn, Threads, Pinterest, Bluesky, Telegram and Discord accounts.
- `WebhookEvent` now includes `post.published`, `post.partially_failed` and `post.failed`.
- README: definition, publishing guide, FAQ and a Links section; richer npm keywords.

## 1.0.1 (2026-09-25)

- Docs: link the SDK guide at https://makeaivideo.ai/docs/sdk; npm homepage now points there.

## 1.0.0 (2026-09-25)

- First release: typed client for the MakeAIVideo REST API v1 (videos, scripts, tools, characters, voices, music, ideas, templates, brand kit, workspace, webhooks).
- `videos.waitForReady()` polling helper, retries with backoff on 429/5xx, typed errors, idempotent creates.
- `verifyWebhookSignature()` for `X-MakeAIVideo-Signature`.
