import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verify a MakeAIVideo webhook delivery.
 *
 * Every delivery carries `X-MakeAIVideo-Signature: sha256=<hex HMAC-SHA256 of
 * the raw body with your webhook secret>`. Pass the RAW request body (not
 * re-serialized JSON). Returns true only for an exact, constant-time match.
 *
 * ```ts
 * app.post("/hooks/makeaivideo", express.raw({ type: "application/json" }), (req, res) => {
 *   if (!verifyWebhookSignature(req.body, req.header("X-MakeAIVideo-Signature"), secret)) return res.sendStatus(401)
 *   const event = JSON.parse(req.body.toString("utf8"))
 *   if (event.event === "video.ready") console.log(event.data)
 *   res.sendStatus(200)
 * })
 * ```
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader.trim())
  return a.length === b.length && timingSafeEqual(a, b)
}
