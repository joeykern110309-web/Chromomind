---
name: AI provider fallback chain
description: Multi-provider LLM fallback (Groq→OpenAI→Gemini) in server/routes.ts and model-name gotchas
---

# AI provider fallback

`chatCompletion()` in `server/routes.ts` cascades Groq → OpenAI → Gemini so chat keeps working when any one provider hits its quota.

**Why:** All three free-tier keys hit limits easily — Groq has a tokens-per-day cap, OpenAI key has a billing/quota limit, Gemini free tier has per-minute + per-day caps. With a single provider, "Failed to send message" appears whenever that provider is exhausted.

**How to apply:**
- Music control commands bypass the AI entirely (direct responses), so only freeform chat depends on this chain.
- Gemini model names: `gemini-1.5-flash` returns 404 (not supported on v1beta for this key). Use `gemini-2.0-flash`. To list valid models: `curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"`.
- Gemini SDK takes a single prompt, not OpenAI-style message arrays — system msg goes to `systemInstruction`, the rest is flattened into one string.
- A 429 from any provider may be transient (per-minute) vs daily — waiting ~30s can recover a per-minute burst limit.
