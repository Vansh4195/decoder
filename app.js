/* Decoder — client-side regex / cron / shell explainer + generator.
 *
 * Two halves:
 *   1. Offline engines (regex tester, cron parser) — no network, no key.
 *   2. LLM calls to the Anthropic Messages API, made directly from the
 *      browser with the user's own key (BYO key, stored in localStorage).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ===========================================================================
  // THEME
  // ===========================================================================
  var THEME_KEY = "decoder.theme";
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }
  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved !== "light" && saved !== "dark") {
      saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(saved);
  }
  $("#themeBtn").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });
  initTheme();

  // ===========================================================================
  // PROVIDERS + API KEY MANAGEMENT
  // ===========================================================================
  // Decoder is BYO-key. It supports more than one LLM provider; each provider
  // stores its own key in localStorage. The active provider is also persisted.
  //
  //   - anthropic : Anthropic Messages API (the original, default).
  //   - gemini    : Google Gemini via its OpenAI-compatible endpoint. Free tier
  //                 friendly and the same path the Node test harness uses.
  var PROVIDERS = {
    anthropic: {
      label: "Anthropic Claude",
      keyStorage: "decoder.anthropicKey",
      placeholder: "sk-ant-...",
      keyUrl: "https://console.anthropic.com/settings/keys",
      keyUrlLabel: "console.anthropic.com",
      note: "Browser calls use Anthropic's direct-browser-access opt-in, which Decoder sends for you."
    },
    gemini: {
      label: "Gemini (free)",
      keyStorage: "decoder.geminiKey",
      placeholder: "AIza...",
      keyUrl: "https://aistudio.google.com/apikey",
      keyUrlLabel: "aistudio.google.com",
      note: "Free tier friendly. Uses Google's OpenAI-compatible endpoint — also the path the Node test harness uses. Works in-browser when Google returns CORS headers; if your network blocks it, use the free Node test (npm run test:e2e)."
    }
  };
  var PROVIDER_STORAGE = "decoder.provider";

  function getProvider() {
    var p = localStorage.getItem(PROVIDER_STORAGE);
    return PROVIDERS[p] ? p : "anthropic";
  }
  function setProvider(p) {
    if (PROVIDERS[p]) localStorage.setItem(PROVIDER_STORAGE, p);
  }

  function getKey(provider) {
    return localStorage.getItem(PROVIDERS[provider || getProvider()].keyStorage) || "";
  }
  function setKey(v, provider) {
    var store = PROVIDERS[provider || getProvider()].keyStorage;
    if (v) localStorage.setItem(store, v);
    else localStorage.removeItem(store);
    refreshKeyButton();
  }
  function refreshKeyButton() {
    var has = !!getKey();
    $("#keyStatusDot").className = "dot " + (has ? "dot-on" : "dot-off");
    $("#keyBtnLabel").textContent = has ? "API key set" : "Set API key";
  }

  var keyDialog = $("#keyDialog");
  var keyInput = $("#keyInput");
  var providerSelect = $("#providerSelect");
  var lastFocused = null;

  // Reflect the selected provider in the dialog: swap the key field's value,
  // placeholder, "get a key" link, and the provider-specific note.
  function syncDialogToProvider() {
    var prov = providerSelect ? providerSelect.value : getProvider();
    var cfg = PROVIDERS[prov] || PROVIDERS.anthropic;
    keyInput.value = getKey(prov);
    keyInput.placeholder = cfg.placeholder;
    var link = $("#keyGetLink");
    if (link) { link.href = cfg.keyUrl; link.textContent = cfg.keyUrlLabel; }
    var note = $("#keyProviderNote");
    if (note) note.textContent = cfg.note;
  }

  function openKeyDialog() {
    lastFocused = document.activeElement;
    if (providerSelect) providerSelect.value = getProvider();
    syncDialogToProvider();
    keyInput.type = "password";
    $("#keyShow").checked = false;
    keyDialog.hidden = false;
    if (providerSelect) providerSelect.focus(); else keyInput.focus();
  }
  function closeKeyDialog() {
    keyDialog.hidden = true;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  // Persist the chosen provider AND its key together, so switching provider in
  // the dropdown then Save does the intuitive thing.
  function saveDialog() {
    var prov = providerSelect ? providerSelect.value : getProvider();
    setProvider(prov);
    setKey(keyInput.value.trim(), prov);
  }

  $("#keyBtn").addEventListener("click", openKeyDialog);
  $("#keyCancel").addEventListener("click", closeKeyDialog);
  if (providerSelect) {
    providerSelect.addEventListener("change", syncDialogToProvider);
  }
  $("#keySave").addEventListener("click", function () {
    saveDialog();
    closeKeyDialog();
  });
  $("#keyClear").addEventListener("click", function () {
    var prov = providerSelect ? providerSelect.value : getProvider();
    setKey("", prov);
    keyInput.value = "";
    closeKeyDialog();
  });
  $("#keyShow").addEventListener("change", function (e) {
    keyInput.type = e.target.checked ? "text" : "password";
  });
  keyInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { saveDialog(); closeKeyDialog(); }
  });
  keyDialog.addEventListener("click", function (e) {
    if (e.target === keyDialog) closeKeyDialog();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !keyDialog.hidden) closeKeyDialog();
  });
  refreshKeyButton();

  // ===========================================================================
  // LLM CALLS — direct browser call, BYO key, per-provider
  // ===========================================================================
  // Anthropic Messages API (the original/default).
  var MODEL = "claude-opus-4-8";
  var API_URL = "https://api.anthropic.com/v1/messages";

  // Google Gemini via its OpenAI-compatible chat/completions endpoint. This is
  // the exact request shape the Node test harness uses, and the free path.
  var GEMINI_MODEL = "gemini-2.0-flash";
  var GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  function noKeyError() {
    var e = new Error("No API key set. Click “Set API key” in the top right to add yours.");
    e.code = "NO_KEY";
    return e;
  }

  // --- Anthropic ---
  function callAnthropic(key, system, userText, maxTokens) {
    return fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens || 1200,
        system: system,
        messages: [{ role: "user", content: userText }]
      })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).then(function (r) {
      if (!r.ok) {
        var msg = (r.data && r.data.error && r.data.error.message) || ("Request failed (HTTP " + r.status + ").");
        if (r.status === 401) msg = "Your API key was rejected (401). Check it under “Set API key”.";
        else if (r.status === 429) msg = "Rate limited (429). Wait a moment and try again.";
        else if (r.status === 529) msg = "Anthropic is temporarily overloaded (529). Try again shortly.";
        var err = new Error(msg);
        err.status = r.status;
        throw err;
      }
      var blocks = (r.data && r.data.content) || [];
      var text = blocks.filter(function (b) { return b.type === "text"; })
        .map(function (b) { return b.text; }).join("");
      if (!text) throw new Error("The model returned an empty response. Try again.");
      return text;
    }).catch(function (err) {
      // fetch() network/CORS failures surface as TypeError with no status
      if (err && err.status == null && err.code !== "NO_KEY") {
        throw new Error("Could not reach the Anthropic API. Check your connection. (Browser CORS calls require the direct-browser-access header, which Decoder sends.)");
      }
      throw err;
    });
  }

  // --- Gemini (OpenAI-compatible) ---
  // The system prompt is mapped to an OpenAI "system" message; the user turn to
  // a "user" message. Response is parsed from choices[0].message.content.
  function callGemini(key, system, userText, maxTokens) {
    var messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: userText });
    return fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        max_tokens: maxTokens || 1200,
        messages: messages
      })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).then(function (r) {
      if (!r.ok) {
        var msg = (r.data && r.data.error && r.data.error.message) || ("Request failed (HTTP " + r.status + ").");
        if (r.status === 401 || r.status === 403) msg = "Your Gemini API key was rejected (" + r.status + "). Check it under “Set API key”.";
        else if (r.status === 429) msg = "Rate limited (429). Wait a moment and try again.";
        var err = new Error(msg);
        err.status = r.status;
        throw err;
      }
      var choice = (r.data && r.data.choices && r.data.choices[0]) || null;
      var text = choice && choice.message && choice.message.content;
      if (!text) throw new Error("The model returned an empty response. Try again.");
      return text;
    }).catch(function (err) {
      if (err && err.status == null && err.code !== "NO_KEY") {
        throw new Error("Could not reach the Gemini API from the browser. Your network may be blocking it (CORS); the free Node test (npm run test:e2e) always works.");
      }
      throw err;
    });
  }

  // Calls the active provider's LLM and returns the response text.
  // Kept named callClaude so all existing call sites are unchanged; it now
  // routes by the selected provider. Throws an Error with a human-readable
  // message on failure.
  function callClaude(system, userText, maxTokens) {
    var provider = getProvider();
    var key = getKey(provider);
    if (!key) return Promise.reject(noKeyError());
    if (provider === "gemini") return callGemini(key, system, userText, maxTokens);
    return callAnthropic(key, system, userText, maxTokens);
  }

  // ===========================================================================
  // OFFLINE REGEX TESTER
  // ===========================================================================
  var rxPattern = $("#rxPattern");
  var rxFlags = $("#rxFlags");
  var rxTest = $("#rxTest");
  var rxError = $("#rxError");
  var rxHighlight = $("#rxHighlight");
  var rxMatchCount = $("#rxMatchCount");
  var rxGroups = $("#rxGroups");

  function buildRegex() {
    var pattern = rxPattern.value;
    var flags = rxFlags.value;
    if (!pattern) return { regex: null };
    // Validate flags before constructing (RegExp throws on dupes/unknowns).
    try {
      var re = new RegExp(pattern, flags);
      return { regex: re };
    } catch (e) {
      return { error: e.message };
    }
  }

  function renderRegex() {
    var pattern = rxPattern.value;
    var text = rxTest.value;
    rxError.hidden = true;
    rxError.textContent = "";

    if (!pattern) {
      rxHighlight.innerHTML = '<span class="empty">Enter a pattern to see matches highlighted here.</span>';
      rxMatchCount.textContent = "0 matches";
      rxGroups.hidden = true;
      return;
    }

    var built = buildRegex();
    if (built.error) {
      rxError.hidden = false;
      rxError.textContent = built.error;
      rxHighlight.innerHTML = '<span class="empty">Fix the pattern above.</span>';
      rxMatchCount.textContent = "—";
      rxGroups.hidden = true;
      return;
    }

    var re = built.regex;
    var global = re.flags.indexOf("g") !== -1;

    // Collect matches. Use a fresh global regex so we can iterate even if the
    // user didn't add the g flag (we still show every match in the tester).
    var iterRe;
    try {
      iterRe = new RegExp(re.source, re.flags.indexOf("g") === -1 ? re.flags + "g" : re.flags);
    } catch (e) {
      iterRe = re;
    }

    var matches = [];
    var m;
    var guard = 0;
    iterRe.lastIndex = 0;
    while ((m = iterRe.exec(text)) !== null) {
      matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: m.groups || null });
      if (m[0] === "") iterRe.lastIndex++; // avoid infinite loop on empty matches
      if (++guard > 10000) break;
      if (!global && matches.length >= 1) break; // mirror non-global semantics in count when no g
    }

    // Highlight by walking the text and wrapping matched spans.
    var html = "";
    var cursor = 0;
    matches.forEach(function (mt) {
      html += escapeHtml(text.slice(cursor, mt.index));
      html += "<mark>" + (mt.text === "" ? "​" : escapeHtml(mt.text)) + "</mark>";
      cursor = mt.index + mt.text.length;
    });
    html += escapeHtml(text.slice(cursor));
    rxHighlight.innerHTML = text ? html : '<span class="empty">Add a test string above.</span>';

    rxMatchCount.textContent = matches.length + (matches.length === 1 ? " match" : " matches");

    // Show capture groups for the first match, if any.
    var first = matches[0];
    if (first && (first.groups.length > 0 || (first.named && Object.keys(first.named).length))) {
      rxGroups.innerHTML = "";
      rxGroups.appendChild(el("div", { class: "groups-title", text: "Capture groups (first match)" }));
      first.groups.forEach(function (g, i) {
        rxGroups.appendChild(el("div", { class: "group-row" }, [
          el("span", { class: "group-idx", text: "Group " + (i + 1) }),
          el("span", { class: "group-val" }, [
            g == null ? el("span", { class: "nullval", text: "(no match)" }) : document.createTextNode(g)
          ])
        ]));
      });
      if (first.named) {
        Object.keys(first.named).forEach(function (name) {
          rxGroups.appendChild(el("div", { class: "group-row" }, [
            el("span", { class: "group-idx", text: name }),
            el("span", { class: "group-val", text: first.named[name] == null ? "(no match)" : first.named[name] })
          ]));
        });
      }
      rxGroups.hidden = false;
    } else {
      rxGroups.hidden = true;
    }
  }

  var debouncedRegex = debounce(renderRegex, 80);
  rxPattern.addEventListener("input", debouncedRegex);
  rxFlags.addEventListener("input", debouncedRegex);
  rxTest.addEventListener("input", debouncedRegex);

  // ===========================================================================
  // OFFLINE CRON PARSER
  // ===========================================================================
  var CRON_FIELDS = [
    { name: "minute", min: 0, max: 59 },
    { name: "hour", min: 0, max: 23 },
    { name: "day of month", min: 1, max: 31 },
    { name: "month", min: 1, max: 12 },
    { name: "day of week", min: 0, max: 7 } // 0 and 7 both = Sunday
  ];
  var MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var MONTH_NAMES = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  var DOW_NAMES = { sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6 };

  function normalizeToken(token, fieldIdx) {
    var t = token.toLowerCase();
    if (fieldIdx === 3 && MONTH_NAMES[t] != null) return String(MONTH_NAMES[t]);
    if (fieldIdx === 4 && DOW_NAMES[t] != null) return String(DOW_NAMES[t]);
    return token;
  }

  // Parse one cron field into { ok, desc, error }.
  function parseCronField(raw, fieldIdx) {
    var f = CRON_FIELDS[fieldIdx];
    if (raw === "*") return { ok: true, desc: "every " + f.name };

    var parts = raw.split(",");
    var descs = [];
    for (var i = 0; i < parts.length; i++) {
      var d = parseCronTerm(parts[i], fieldIdx);
      if (d.error) return { error: d.error };
      descs.push(d.desc);
    }
    return { ok: true, desc: descs.join(", or ") };
  }

  function parseCronTerm(term, fieldIdx) {
    var f = CRON_FIELDS[fieldIdx];

    // step: base/step  e.g. */15  or  9-17/2  or 5/10
    var stepMatch = term.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      var base = stepMatch[1];
      var step = parseInt(stepMatch[2], 10);
      if (step <= 0) return { error: "step must be a positive number in “" + term + "”" };
      var range = parseRange(base, fieldIdx);
      if (range.error) return { error: range.error };
      var label = describeUnit(fieldIdx, step, true);
      if (base === "*") return { desc: "every " + label };
      return { desc: "every " + label + " within " + range.desc };
    }

    var r = parseRange(term, fieldIdx);
    if (r.error) return { error: r.error };
    return { desc: r.desc };
  }

  function parseRange(term, fieldIdx) {
    var f = CRON_FIELDS[fieldIdx];
    if (term === "*") return { desc: "the full range" };

    var rangeMatch = term.match(/^([0-9a-z]+)-([0-9a-z]+)$/i);
    if (rangeMatch) {
      var a = numFor(rangeMatch[1], fieldIdx);
      var b = numFor(rangeMatch[2], fieldIdx);
      if (a.error) return { error: a.error };
      if (b.error) return { error: b.error };
      return { desc: labelValue(fieldIdx, a.n) + " through " + labelValue(fieldIdx, b.n) };
    }

    var single = numFor(term, fieldIdx);
    if (single.error) return { error: single.error };
    return { desc: labelValue(fieldIdx, single.n) };
  }

  function numFor(token, fieldIdx) {
    var f = CRON_FIELDS[fieldIdx];
    var norm = normalizeToken(token, fieldIdx);
    if (!/^\d+$/.test(norm)) return { error: "“" + token + "” is not valid for " + f.name };
    var n = parseInt(norm, 10);
    if (n < f.min || n > f.max) {
      return { error: f.name + " must be " + f.min + "–" + f.max + " (got " + n + ")" };
    }
    return { n: n };
  }

  function describeUnit(fieldIdx, step, plural) {
    var unit = ["minute", "hour", "day", "month", "day-of-week"][fieldIdx];
    if (step === 1) return unit;
    return step + " " + unit + "s";
  }

  function labelValue(fieldIdx, n) {
    if (fieldIdx === 3) return MONTHS[n];
    if (fieldIdx === 4) return DOW[n];
    if (fieldIdx === 0 || fieldIdx === 1) return String(n);
    return String(n);
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  // Build a human sentence for the whole expression.
  function describeCron(fields) {
    var minute = fields[0], hour = fields[1], dom = fields[2], month = fields[3], dow = fields[4];

    var timePart;
    var minStep = minute.match(/^\*\/(\d+)$/);
    // Common case: exact minute + exact hour -> "at HH:MM"
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
      timePart = "at " + pad2(parseInt(hour, 10)) + ":" + pad2(parseInt(minute, 10));
    } else if (minute === "*" && hour === "*") {
      timePart = "every minute";
    } else if (minStep && hour === "*") {
      timePart = "every " + minStep[1] + " minutes";
    } else if (minStep) {
      // step minute with a constrained hour -> read the minute step as a frequency
      var hStep = parseCronField(hour, 1);
      timePart = "every " + minStep[1] + " minutes during " + (hStep.desc || hour) + (/^\d+$/.test(hour) ? ":00" : "");
    } else {
      var mDesc = parseCronField(minute, 0);
      var hDesc = parseCronField(hour, 1);
      timePart = "at " + (mDesc.desc || minute) + " past " + (hDesc.desc || hour);
    }

    var dayClauses = [];
    if (dom !== "*") {
      var domD = parseCronField(dom, 2);
      dayClauses.push("on day-of-month " + (domD.desc || dom));
    }
    if (month !== "*") {
      var monD = parseCronField(month, 3);
      dayClauses.push("in " + (monD.desc || month));
    }
    if (dow !== "*") {
      var dowD = parseCronField(dow, 4);
      dayClauses.push("on " + (dowD.desc || dow));
    }

    var sentence = timePart;
    if (dayClauses.length) sentence += ", " + dayClauses.join(", ");
    else sentence += ", every day";
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
  }

  var cronExpr = $("#cronExpr");
  var cronError = $("#cronError");
  var cronBreakdown = $("#cronBreakdown");
  var cronPlain = $("#cronPlain");

  function renderCron() {
    var raw = cronExpr.value.trim();
    cronError.hidden = true;
    cronError.textContent = "";
    cronBreakdown.innerHTML = "";

    if (!raw) {
      cronPlain.textContent = "Enter a 5-field cron expression above.";
      return;
    }

    var fields = raw.split(/\s+/);
    if (fields.length !== 5) {
      cronError.hidden = false;
      cronError.textContent = "Expected 5 fields (minute hour day-of-month month day-of-week); got " + fields.length + ".";
      cronPlain.textContent = "—";
      return;
    }

    var hasError = false;
    fields.forEach(function (val, i) {
      var parsed = parseCronField(val, i);
      var cell = el("div", { class: "cron-cell" + (parsed.error ? " is-error" : "") }, [
        el("div", { class: "cc-field", text: val }),
        el("div", { class: "cc-name", text: CRON_FIELDS[i].name }),
        el("div", { class: "cc-desc", text: parsed.error || parsed.desc })
      ]);
      cronBreakdown.appendChild(cell);
      if (parsed.error) hasError = true;
    });

    if (hasError) {
      cronPlain.textContent = "Fix the highlighted field(s) above.";
    } else {
      cronPlain.textContent = describeCron(fields);
    }
  }

  var debouncedCron = debounce(renderCron, 60);
  cronExpr.addEventListener("input", debouncedCron);

  $$(".chip[data-cron]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      cronExpr.value = chip.getAttribute("data-cron");
      renderCron();
      cronExpr.focus();
    });
  });

  // ===========================================================================
  // LIGHTWEIGHT MARKDOWN -> HTML for AI explanations
  // (supports paragraphs, bullet lists, **bold**, and `code`)
  // ===========================================================================
  function renderMarkdown(md) {
    var lines = md.replace(/\r/g, "").split("\n");
    var html = "";
    var inList = false;
    var para = [];

    function flushPara() {
      if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; }
    }
    function flushList() {
      if (inList) { html += "</ul>"; inList = false; }
    }
    function inline(s) {
      s = escapeHtml(s);
      s = s.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return s;
    }

    lines.forEach(function (line) {
      var trimmed = line.trim();
      var bullet = trimmed.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        flushPara();
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + inline(bullet[1]) + "</li>";
      } else if (trimmed === "") {
        flushPara();
        flushList();
      } else {
        flushList();
        para.push(trimmed);
      }
    });
    flushPara();
    flushList();
    return html || "<p>" + escapeHtml(md) + "</p>";
  }

  // ===========================================================================
  // AI OUTPUT RENDERING
  // ===========================================================================
  function showLoading(container, label) {
    container.innerHTML = "";
    var modelName = getProvider() === "gemini" ? "Gemini" : "Claude";
    container.appendChild(el("div", { class: "ai-card" }, [
      el("div", { class: "loading" }, [
        el("span", { class: "spinner" }),
        document.createTextNode(label || ("Asking " + modelName + "…"))
      ])
    ]));
  }

  function showError(container, message) {
    container.innerHTML = "";
    container.appendChild(el("div", { class: "ai-card is-error" }, [
      el("div", { class: "ai-body" }, [document.createTextNode(message)])
    ]));
  }

  // Render an explanation (markdown) into the container.
  function showExplanation(container, markdown) {
    container.innerHTML = "";
    var body = el("div", { class: "ai-body" });
    body.innerHTML = renderMarkdown(markdown);
    container.appendChild(el("div", { class: "ai-card" }, [body]));
  }

  // Render a generated artifact: a copyable code line + a markdown explanation.
  // The model is asked to return the artifact on the first line prefixed with
  // "RESULT: ", followed by a blank line and an explanation.
  function showGeneration(container, raw) {
    container.innerHTML = "";
    var result = "";
    var rest = raw;
    var match = raw.match(/^\s*RESULT:\s*(.+?)\s*(?:\n([\s\S]*))?$/);
    if (match) {
      result = match[1].trim();
      rest = (match[2] || "").trim();
    }

    var card = el("div", { class: "ai-card" });

    if (result) {
      var codeEl = el("code", { text: result });
      var copyBtn = el("button", { class: "copy-btn", type: "button", text: "Copy" });
      copyBtn.addEventListener("click", function () {
        var done = function () {
          copyBtn.textContent = "Copied";
          setTimeout(function () { copyBtn.textContent = "Copy"; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(result).then(done, done);
        } else {
          var ta = el("textarea"); ta.value = result; document.body.appendChild(ta);
          ta.select(); try { document.execCommand("copy"); } catch (e) {}
          document.body.removeChild(ta); done();
        }
      });
      card.appendChild(el("div", { class: "ai-result" }, [codeEl, copyBtn]));
    }

    if (rest) {
      var body = el("div", { class: "ai-body" });
      body.innerHTML = renderMarkdown(rest);
      card.appendChild(body);
    }
    container.appendChild(card);
  }

  // Wraps a button click that triggers an LLM call: disables the button,
  // shows loading, calls runner(), renders via onText/onError.
  function runAi(btn, container, loadingLabel, runner, onText) {
    var original = btn.textContent;
    btn.disabled = true;
    showLoading(container, loadingLabel);
    runner().then(function (text) {
      onText(container, text);
    }).catch(function (err) {
      showError(container, err.message || "Something went wrong.");
      if (err.code === "NO_KEY") openKeyDialog();
    }).then(function () {
      btn.disabled = false;
      btn.textContent = original;
    });
  }

  // ===========================================================================
  // PROMPTS + WIRING
  // ===========================================================================

  // ---- Regex: explain ----
  $("#rxExplainBtn").addEventListener("click", function () {
    var pattern = rxPattern.value;
    var flags = rxFlags.value;
    if (!pattern) { showError($("#rxAiOut"), "Enter a regular expression in the tester first."); return; }
    var system =
      "You are a regular-expression tutor. Explain the given regex to a developer who is not a regex expert. " +
      "Walk through it token by token in the order the tokens appear, using a bullet list. " +
      "For each token, show the literal token in backticks and say plainly what it matches. " +
      "Briefly note what any flags do. End with one short sentence summarizing what the whole pattern matches. " +
      "Use Markdown (bullets, **bold**, `code`). Be concise and accurate. Do not invent behavior.";
    var user = "Regex: /" + pattern + "/" + flags + "\n\nExplain it token by token.";
    runAi(this, $("#rxAiOut"), "Explaining the regex…",
      function () { return callClaude(system, user, 1500); }, showExplanation);
  });

  // ---- Regex: generate ----
  $("#rxGenBtn").addEventListener("click", function () {
    var desc = $("#rxDesc").value.trim();
    if (!desc) { showError($("#rxAiOut"), "Describe what you want the regex to match first."); return; }
    var system =
      "You generate JavaScript-flavored regular expressions from a plain-English description. " +
      "Output format, exactly: first line must be `RESULT: ` followed by the regex pattern only " +
      "(no surrounding slashes, no flags, no quotes). Then a blank line. " +
      "Then a short Markdown explanation: note any flags the user should use, and give one example string that matches. " +
      "Keep the pattern as simple as correctly possible. Do not over-engineer.";
    var user = "Describe-to-regex: " + desc;
    var self = this;
    runAi(self, $("#rxAiOut"), "Generating a regex…",
      function () { return callClaude(system, user, 1200); },
      function (container, text) {
        showGeneration(container, text);
        // Convenience: drop the generated pattern into the live tester.
        var m = text.match(/^\s*RESULT:\s*(.+)$/m);
        if (m && m[1].trim()) {
          rxPattern.value = m[1].trim();
          renderRegex();
        }
      });
  });

  // ---- Cron: explain ----
  $("#cronExplainBtn").addEventListener("click", function () {
    var expr = cronExpr.value.trim();
    if (!expr) { showError($("#cronAiOut"), "Enter a cron expression in the tester first."); return; }
    var system =
      "You are a cron-schedule expert. Explain the given standard 5-field cron expression " +
      "(minute hour day-of-month month day-of-week) to a developer. " +
      "Give a one-line plain-English summary first (bold), then a bullet list breaking down each of the 5 fields " +
      "with the field's literal value in backticks. Then note roughly how often it fires and any gotchas " +
      "(e.g. the day-of-month / day-of-week OR behavior when both are set). Use Markdown. Be concise and accurate.";
    var user = "Cron expression: " + expr;
    runAi(this, $("#cronAiOut"), "Explaining the schedule…",
      function () { return callClaude(system, user, 1400); }, showExplanation);
  });

  // ---- Cron: generate ----
  $("#cronGenBtn").addEventListener("click", function () {
    var desc = $("#cronDesc").value.trim();
    if (!desc) { showError($("#cronAiOut"), "Describe the schedule you want first."); return; }
    var system =
      "You generate standard 5-field cron expressions (minute hour day-of-month month day-of-week) " +
      "from a plain-English description. " +
      "Output format, exactly: first line must be `RESULT: ` followed by the cron expression only. " +
      "Then a blank line. Then a short Markdown explanation of why, and a plain-English restatement of when it runs. " +
      "Use standard cron syntax only (no @hourly aliases, no seconds field).";
    var user = "Describe-to-cron: " + desc;
    var self = this;
    runAi(self, $("#cronAiOut"), "Generating a schedule…",
      function () { return callClaude(system, user, 1000); },
      function (container, text) {
        showGeneration(container, text);
        var m = text.match(/^\s*RESULT:\s*(.+)$/m);
        if (m && m[1].trim()) {
          cronExpr.value = m[1].trim();
          renderCron();
        }
      });
  });

  // ---- Shell: explain ----
  $("#shellExplainBtn").addEventListener("click", function () {
    var cmd = $("#shellCmd").value.trim();
    if (!cmd) { showError($("#shellAiOut"), "Enter a shell command first."); return; }
    var system =
      "You are a shell expert. Explain the given shell one-liner to a developer, flag by flag. " +
      "Start with one bold sentence saying what the whole command does. " +
      "Then a bullet list: one bullet per command, flag, argument, pipe, or redirect, in left-to-right order, " +
      "with the literal token in backticks and a plain explanation. " +
      "If the command is destructive or risky (deletes files, overwrites, sudo, rm -rf, etc.), add a final bold warning line. " +
      "Use Markdown. Be concise and accurate. Do not invent flags.";
    var user = "Shell command:\n" + cmd;
    runAi(this, $("#shellAiOut"), "Explaining the command…",
      function () { return callClaude(system, user, 1600); }, showExplanation);
  });

  // ---- Shell: generate ----
  $("#shellGenBtn").addEventListener("click", function () {
    var desc = $("#shellDesc").value.trim();
    if (!desc) { showError($("#shellGenOut"), "Describe what you want the command to do first."); return; }
    var system =
      "You generate a single safe POSIX/bash shell one-liner from a plain-English description. " +
      "Output format, exactly: first line must be `RESULT: ` followed by the command only (one line). " +
      "Then a blank line. Then a short Markdown explanation of each part, and — if the command modifies or " +
      "deletes anything — a bold warning telling the user to review it before running. " +
      "Prefer portable, widely-available tools. Never include destructive shortcuts the description didn't ask for.";
    var user = "Describe-to-shell: " + desc;
    runAi(this, $("#shellGenOut"), "Generating a command…",
      function () { return callClaude(system, user, 1200); }, showGeneration);
  });

  // example chips for shell
  $$(".chip[data-shell]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      $("#shellCmd").value = chip.getAttribute("data-shell");
      $("#shellCmd").focus();
    });
  });

  // ===========================================================================
  // TABS
  // ===========================================================================
  var tabs = $$(".tab");
  function activateTab(mode) {
    tabs.forEach(function (t) {
      var isActive = t.getAttribute("data-mode") === mode;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
      t.tabIndex = isActive ? 0 : -1;
    });
    ["regex", "cron", "shell"].forEach(function (m) {
      $("#panel-" + m).hidden = m !== mode;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { activateTab(t.getAttribute("data-mode")); });
    t.addEventListener("keydown", function (e) {
      // arrow-key roving for the tablist
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        var dir = e.key === "ArrowRight" ? 1 : -1;
        var next = tabs[(i + dir + tabs.length) % tabs.length];
        activateTab(next.getAttribute("data-mode"));
        next.focus();
      }
    });
  });

  // ===========================================================================
  // INITIAL RENDER
  // ===========================================================================
  renderRegex();
  renderCron();
})();
