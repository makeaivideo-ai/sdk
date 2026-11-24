# Changelog

## 1.3.1 (2026-11-24)

- README: signing up is free with no card; plans from $14; extra credits from $5 on a plan. No code change.

## 1.3.0 (2026-11-21)

- Scenes and edits: `videos.get(id, { include: "scenes" })` returns the script, `scenes` (each with `lip_synced`, `flagged`, `free_remake`, still and clip URLs), captions, music, voice and `brief_miss`. Every `get()` now types `edit` (an edit still being made: `in_progress`, `stage`, `file_out_of_date`), `thumbnail_url`, `web_url` and `editor_url`.
- New methods: `videos.createFromPrompt()` (Prompt to video), `videos.editSceneNarration()` (new line, picture kept), `videos.setMusic()`, `music.library()`, `videos.listPage()` and `videos.iterate()` (paged list with `next_cursor`), `publishing.suggestCaption()`, `publishing.posts.reschedule()` and `publishing.posts.cancel()`, `brandKit.watermarkFromUrl()`.
- Paid edits take `dry_run`, `max_credits`, `auto_export` and `idempotency_key` (sent as `Idempotency-Key`): `regenerateScene()` (also `visual_description`, `quality: "best"`, `use_free_remake`), `editSceneNarration()`, `voice.set()`; `renders.create()` takes `dry_run` and `max_credits`. `publishing.publish()` now sends its `idempotency_key` as the header too.
- `voice.set()` types fixed: `voice_stability` is "stable", "balanced" or "expressive" and `scenes` is `{ scene_number, narration }[]` (the old types did not match the API).
- `estimate()` quotes `kind` creates (prompt-to-video, image-to-video, talking-avatar, character-swap) with `text`.
- Waiting for a plan: status `waiting_for_plan` with `waiting_for_plan`, `start_trial_url`, `say_to_user` and `expires_at` on `Video`.
- New `ConflictError` (409) with `code` (`price_required`, `price_over_limit`, `already_running`, `lip_synced_scene`) and `credits` (the price); new `ApiErrorCode` type. It extends `MakeAIVideoError`, so existing catches still work.
- Generated types regenerated (74 operations).

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
