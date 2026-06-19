/* Decoder — free end-to-end test against Google Gemini.
 *
 * Decoder's Explain/Generate features POST an OpenAI-style chat request to an
 * LLM. This test exercises that exact request/response shape, but points it at
 * Google Gemini's OpenAI-compatible endpoint, which has a generous free tier.
 * That lets anyone confirm the LLM round-trip works without spending anything.
 *
 *   1. Read GEMINI_API_KEY from the environment (skip if unset).
 *   2. Make ONE tiny real call (max_tokens kept small so it costs ~nothing).
 *   3. Assert the response parses and carries non-empty text.
 *
 * This is a plain Node script — no browser, so no CORS involved. It proves the
 * request building + response parsing logic against a real model.
 *
 * Run:  GEMINI_API_KEY=... node tests/e2e.mjs   (or: npm run test:e2e)
 * Get a free key at https://aistudio.google.com/apikey
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = "gemini-2.0-flash";

function fail(reason) {
  console.error("FAIL: " + reason);
  process.exit(1);
}

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log("SKIP: GEMINI_API_KEY is not set.");
    console.log("Get a free key at https://aistudio.google.com/apikey then re-run:");
    console.log("  GEMINI_API_KEY=your_key node tests/e2e.mjs");
    process.exit(0);
  }

  // Same request shape Decoder uses for an LLM call (OpenAI chat/completions):
  // a system-less single user turn, JSON body, Bearer auth. Kept tiny on purpose.
  const body = {
    model: MODEL,
    messages: [{ role: "user", content: "Reply with the single word: OK" }],
    max_tokens: 20
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + key
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    fail("could not reach Gemini endpoint — " + (err && err.message ? err.message : String(err)));
    return;
  }

  let data;
  const rawText = await res.text();
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    fail("response was not valid JSON (HTTP " + res.status + "): " + rawText.slice(0, 200));
    return;
  }

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("HTTP " + res.status);
    if (res.status === 401 || res.status === 403) {
      fail("API key rejected (" + res.status + "). Check GEMINI_API_KEY. " + msg);
    }
    fail("request failed: " + msg);
    return;
  }

  // Parse the OpenAI-compatible shape: choices[0].message.content
  const choice = data && data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (typeof text !== "string" || text.trim() === "") {
    fail("model returned no non-empty text. Got: " + JSON.stringify(data).slice(0, 300));
    return;
  }

  console.log("Model replied: " + JSON.stringify(text.trim()));
  console.log("PASS");
  process.exit(0);
}

main().catch(function (err) {
  fail((err && err.message) ? err.message : String(err));
});
