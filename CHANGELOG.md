# Changelog

## 1.2.0 (2026-11-21)

- New methods for every API endpoint the client lacked: `videos.imageToVideo()`, `videos.talkingAvatar()`, `videos.characterSwap()`, `videos.report()`, `uploads.reference()` (multipart), `uploads.videoAvatar()` (multipart), `uploads.videoFromUrl()`, `voices.sample()`, `brandKit.watermark()` (multipart). File uploads take a `Blob`/`File` or `{ data, name }`.
- Generated contract types from the API's OpenAPI document: `ApiVideo`, `ApiCreateVideo`, `ApiVideoCreated`, `ApiCredits` and the rest, plus `API_OPERATIONS` (every method and path).
- Hand-written types caught up with the API: `quality` ("best" or "fast"), the `ai-pictures` mode, `product_image_keys`, `max_duration_seconds`, `voiceover`, `brief_key`; `Video.cost_usd`, `error_code`, `failed_stage`, `retryable`, `waiting_for_slot`; `Credits.balance_usd`, `credits_per_usd`.
- The `User-Agent` now reports the package version (it said 1.1.2 in 1.1.3).
- Running out of credits: `credits()` returns `resets_at`, `refill_credits`, `refill_kind`, `low_balance_threshold` and `top_up_url`; new `topUpLink({ credits, amount_usd })` returns a link the user opens to pay on Stripe's page (the API never charges a card); `InsufficientCreditsError` has `shortfall`, `resetsAt` and `topUpUrl`. New webhook events `credits.low` and `credits.refilled`.

## 1.1.2 (2026-09-30)

- Posting to X is now supported (videos up to 140 seconds): `publishing.accounts.connect("x")`. README and doc comments list X. No code changes.

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
