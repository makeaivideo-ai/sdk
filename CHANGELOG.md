# Changelog

## 1.0.1 (2026-09-25)

- Docs: link the SDK guide at https://makeaivideo.ai/docs/sdk; npm homepage now points there.

## 1.0.0 (2026-09-25)

- First release: typed client for the MakeAIVideo REST API v1 (videos, scripts, tools, characters, voices, music, ideas, templates, brand kit, workspace, webhooks).
- `videos.waitForReady()` polling helper, retries with backoff on 429/5xx, typed errors, idempotent creates.
- `verifyWebhookSignature()` for `X-MakeAIVideo-Signature`.
