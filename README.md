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
call the [Claude API](https://www.anthropic.com/api) (model `claude-opus-4-8`).

## Bring your own key (BYO key)

Decoder has no backend. The Explain/Generate features call Anthropic's
[Messages API](https://docs.anthropic.com/en/api/messages) **directly from your browser** using a key
you provide:

- Click **Set API key** in the top-right and paste your own Anthropic API key.
- The key is stored only in this browser's `localStorage` and is **never** sent anywhere except
  `api.anthropic.com`.
- Browser requests use Anthropic's `anthropic-dangerous-direct-browser-access` opt-in header, which
  Decoder sends for you so the call isn't blocked by CORS.
- Get a key at [console.anthropic.com](https://console.anthropic.com/settings/keys).

No key is ever hardcoded, committed, or proxied through a server.

## Run locally

It's a static site — no build step, no dependencies.

```sh
git clone https://github.com/Vansh4195/decoder.git
cd decoder
# open index.html directly, or serve it:
python3 -m http.server 8000
# then visit http://localhost:8000
```

The regex tester and cron parser work immediately. To use Explain/Generate, add your Anthropic key
via **Set API key**.

## Project layout

```
index.html   markup + the three mode panels and the API-key dialog
styles.css   styling (light/dark theme, responsive, accessible)
app.js       all logic: offline regex + cron engines, the Claude API call, UI wiring
```

## Tech

- Plain HTML, CSS, and JavaScript — no framework, no build tooling.
- [Anthropic Claude API](https://www.anthropic.com/api) for the Explain/Generate features (BYO key).

## License

MIT — see [LICENSE](LICENSE).

Built by Vansh Singh.
