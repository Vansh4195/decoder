# Decoder

**Explain and generate regex, cron schedules, and shell one-liners from plain English.**

Decoder is a single-page web app that turns cryptic developer syntax into plain English — and the
other way around. Paste a regular expression, a cron schedule, or a shell one-liner and get a
piece-by-piece breakdown. Or describe what you want in plain English and generate it.

Live: **https://vansh4195.github.io/decoder/**

## What it does

Three modes:

1. **Regex**
   - A **live tester** that runs entirely in your browser — type a pattern + flags + a test string and
     see matches highlighted in real time, with capture groups for the first match. No API key needed.
   - **Explain** — break the pattern down token by token in plain English.
   - **Generate** — describe what you want to match and get a regex (auto-dropped into the tester).

2. **Cron**
   - An **offline parser** that breaks a standard 5-field cron expression
     (`minute hour day-of-month month day-of-week`) into a per-field grid and a plain-English summary,
     live as you type. No API key needed.
   - **Explain** — a fuller human explanation including how often it fires and common gotchas.
   - **Generate** — describe a schedule and get a cron expression (auto-dropped into the parser).

3. **Shell**
   - **Explain** — break a shell one-liner down flag by flag, with a warning for destructive commands.
   - **Generate** — describe what you want and get a single safe one-liner. Decoder never runs commands.

The regex tester and cron parser work **fully offline**. The **Explain** and **Generate** features
call an LLM — either Anthropic's [Claude API](https://www.anthropic.com/api) (model `claude-opus-4-8`)
or **Google Gemini** (model `gemini-2.0-flash`, free-tier friendly).

## Bring your own key (BYO key)

Decoder has no backend. The Explain/Generate features call an LLM **directly from your browser**
using a key you provide. Open **Set API key** in the top-right, pick a **provider**, and paste your key:

- **Anthropic Claude** — calls the [Messages API](https://docs.anthropic.com/en/api/messages).
  Browser requests use Anthropic's `anthropic-dangerous-direct-browser-access` opt-in header, which
  Decoder sends for you so the call isn't blocked by CORS. Get a key at
  [console.anthropic.com](https://console.anthropic.com/settings/keys).
- **Gemini (free)** — calls Google's OpenAI-compatible endpoint
  (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`). This has a generous
  free tier, so it's the cheapest way to try the AI features. Google returns CORS headers for this
  endpoint, so it works in-browser; if your network blocks it, the free Node test below is the
  reliable path. Get a key at [aistudio.google.com](https://aistudio.google.com/apikey).

Each provider's key is stored only in this browser's `localStorage` and is **never** sent anywhere
except that provider's API. No key is ever hardcoded, committed, or proxied through a server.

## Test for free with Gemini

You can verify the AI request/response logic end-to-end for free, without a browser, using Google
Gemini's free tier:

1. Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Run the test (Node 18+, which has built-in `fetch` — no dependencies):

   ```sh
   GEMINI_API_KEY=your_key npm run test:e2e
   # or directly:
   GEMINI_API_KEY=your_key node tests/e2e.mjs
   ```

It makes **one** tiny call (`max_tokens: 20`, so it costs ~nothing) through the same
OpenAI-compatible request shape the app uses, asserts the response parses with non-empty text, and
prints `PASS`. With no key set it prints `SKIP` and exits 0. Because it's a Node script there's no
CORS involved — it proves the request-building and response-parsing logic against a real model.

## Run locally

It's a static site — no build step, no dependencies.

```sh
git clone https://github.com/Vansh4195/decoder.git
cd decoder
# open index.html directly, or serve it:
python3 -m http.server 8000
# then visit http://localhost:8000
```

The regex tester and cron parser work immediately. To use Explain/Generate, pick a provider
(Anthropic or Gemini) and add your key via **Set API key**.

## Project layout

```
index.html      markup + the three mode panels and the provider/API-key dialog
styles.css      styling (light/dark theme, responsive, accessible)
app.js          all logic: offline regex + cron engines, the LLM calls, UI wiring
tests/e2e.mjs   free end-to-end LLM test via Gemini's OpenAI-compatible endpoint
package.json    scripts only (test:e2e) — the site itself needs no build step
```

## Tech

- Plain HTML, CSS, and JavaScript — no framework, no build tooling.
- LLM for the Explain/Generate features (BYO key), either the
  [Anthropic Claude API](https://www.anthropic.com/api) or
  [Google Gemini](https://ai.google.dev/) via its OpenAI-compatible endpoint.

## License

MIT — see [LICENSE](LICENSE).

Built by Vansh Singh.
