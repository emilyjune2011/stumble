importScripts("sites.js", "providers.js");

const CATS = Object.keys(SITES);
const DEFAULTS = {
  interests: CATS, custom: [], seen: [], saved: [], skipped: [], dead: [], queue: [],
  current: null, apiKey: "", provider: "anthropic", baseUrl: "", model: "claude-sonnet-5", today: { date: "", n: 0 }, lastError: "",
  taste: { cats: {}, kinds: {} }, ratedSinceRefill: 0
};
const norm = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + x.search).toLowerCase(); } catch (e) { return String(u).toLowerCase(); } };
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };

async function load() { return Object.assign({}, DEFAULTS, await chrome.storage.local.get(null)); }
async function save(patch) { await chrome.storage.local.set(patch); }

let refilling = null;

/* ---- taste: a running tally of 👍/👎 per interest and per kind of site ---- */
const KINDS = ["interactive toy", "game", "tool", "archive or collection", "essay or article", "blog", "reference or database", "web art", "audio or radio", "video or film", "live cam or map", "shop or maker", "other"];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function weight(t) { return t ? clamp((t.up + 2) / (t.down + 2), 0.2, 5) : 1; }
function catW(st, cat) { return weight(st.taste.cats[cat]); }
function kindW(st, kind) { return kind ? weight(st.taste.kinds[kind]) : 1; }
function tally(taste, item, field, delta) {
  const bump = (bucket, key) => {
    if (!key) return;
    const t = bucket[key] || { up: 0, down: 0 };
    t[field] = Math.max(0, t[field] + delta);
    bucket[key] = t;
  };
  bump(taste.cats, item.cat);
  bump(taste.kinds, item.kind);
  return taste;
}
// Share of each batch per interest, driven by the tally. Wildcards float between 5% and 40%.
function shares(st) {
  const wild = clamp(0.15 * catW(st, "Wildcard"), 0.05, 0.4);
  const ws = st.interests.map(c => [c, catW(st, c)]);
  const total = ws.reduce((a, [, w]) => a + w, 0) || 1;
  const out = ws.map(([c, w]) => [c, Math.max(1, Math.round((1 - wild) * 100 * w / total))]);
  out.push(["Wildcard", Math.round(wild * 100)]);
  return out;
}
function weightedIndex(items, wfn) {
  const ws = items.map(wfn), total = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; }
  return items.length - 1;
}
const STOP = new Set("the a an and or of to in on for with from by at your you it its is are this that into over like site sites web online free".split(" "));
const words = s => new Set(String(s).toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(w => !STOP.has(w)) || []);
// Queued sites that look like the one just rejected: same site, same interest and kind, or lots of shared words.
function similar(a, b) {
  if (hostOf(a.url) === hostOf(b.url)) return true;
  if (a.cat === b.cat && a.kind && a.kind === b.kind) return true;
  const wa = words(a.title + " " + a.blurb), wb = words(b.title + " " + b.blurb);
  let shared = 0; wa.forEach(w => { if (wb.has(w)) shared++; });
  return shared >= 3;
}

// Sites shown recently, by host (seen holds normalized "host/path" keys).
const seenHosts = (st, n) => new Set(st.seen.slice(-n).map(k => k.split("/")[0]));
const LIBRARY_HOSTS = [...new Set(Object.values(SITES).flatMap(([, list]) => list.map(s => hostOf(s[1]))))];

// Each batch leans a few random ways, so the AI doesn't keep reaching for the same famous picks.
const ANGLES = [
  "made by a single person as a labor of love", "from outside the English-speaking world (still usable in English)",
  "from the early web, before 2010, and still online", "a university, library, or museum project most people never find",
  "built around one very specific hobby or obsession", "a tool or toy that does exactly one thing well",
  "a collection or archive someone has been building for years", "small and recent, made in the last few years",
  "a personal site with a strong visual style", "something you can listen to", "a long, beautiful piece of writing",
  "a map, atlas, or explorable place", "a database of something oddly specific", "made by an artist, designer, or musician"
];
const pickAngles = n => [...ANGLES].sort(() => Math.random() - 0.5).slice(0, n);

function libraryFresh(st) {
  const seen = new Set(st.seen), out = [];
  st.interests.forEach(c => { if (SITES[c]) SITES[c][1].forEach(s => { if (!seen.has(norm(s[1]))) out.push({ cat: c, icon: SITES[c][0], title: s[0], url: s[1], blurb: s[2] }); }); });
  return out;
}

function kindNote(st) {
  const ranked = Object.entries(st.taste.kinds).filter(([, t]) => t.up + t.down >= 2).map(([k, t]) => [k, weight(t)]);
  const more = ranked.filter(([, w]) => w >= 1.5).map(([k]) => k);
  const less = ranked.filter(([, w]) => w <= 0.6).map(([k]) => k);
  return (more.length ? `\nKinds of site they respond to: ${more.join(", ")}.` : "") + (less.length ? `\nKinds of site they tend to skip, so fewer of these: ${less.join(", ")}.` : "");
}

function buildPrompt(st) {
  const shown = [...new Set([...seenHosts(st, 3000), ...st.queue.map(q => hostOf(q.url)), ...LIBRARY_HOSTS])].slice(-600);
  const liked = st.saved.slice(0, 20).map(s => `${s.title} (${hostOf(s.url)})`);
  const nope = st.skipped.slice(-20).map(s => `${s.title} (${s.host})`);
  return `You are the engine of a StumbleUpon-style discovery app. Suggest 25 websites for one person to stumble onto, one at a time.

Their interests: ${st.interests.join(", ")}.
Aim for roughly this share of the batch per interest, based on what they've been liking and skipping: ${shares(st).map(([c, p]) => `${c} ${p}%`).join(", ")}. Wildcard means anything at all outside their interests, to widen their world. Spread things out rather than bunching.${kindNote(st)}

Aim for the delightful long tail of the web: personal sites, niche blogs, single-purpose interactive toys, digital archives and museum collections, fan-made databases, generators, web art, hobbyist reference sites, small magazines, odd one-page projects, beautiful essays. Vary the kind of site as much as the topic. For this batch, lean toward sites that are: ${pickAngles(3).join("; ")}.
Skip the famous "best of the weird web" picks that every list repeats; they already have those. Dig past the first ideas that come to mind. Avoid huge platforms, storefronts, and news homepages (YouTube, Reddit, Amazon, Facebook, Instagram, Netflix, Spotify, Pinterest, the Wikipedia home page).
Only include sites you are confident exist and are still online. Prefer a homepage or a long-stable URL over a deep link. Every entry must be a different site.
${liked.length ? `\nThey loved these, so more in this spirit is welcome: ${liked.join("; ")}.` : ""}${nope.length ? `\nThey marked these "not for me", so steer away from similar: ${nope.join("; ")}.` : ""}${st.dead.length ? `\nThese sites turned out to be dead, avoid them: ${st.dead.slice(-40).join(", ")}.` : ""}

They have already seen these websites, so suggest nothing on them, not even a different page: ${shown.join(", ")}

Reply with only a JSON array of 25 objects, no other text:
[{"title":"Site name","url":"https://...","interest":"one of their interests, exactly as written, or Wildcard","kind":"one of: ${KINDS.join(" | ")}","emoji":"one emoji","blurb":"One plain sentence under 20 words saying what it is."}]`;
}

// Pull every complete {...} object out of the AI's reply, even if the array got cut off.
function parseSites(text) {
  try {
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    if (Array.isArray(arr)) return arr;
  } catch (e) { /* fall through to salvage */ }
  const out = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth++ === 0) start = i; }
    else if (ch === "}" && depth > 0 && --depth === 0) { try { out.push(JSON.parse(text.slice(start, i + 1))); } catch (e) {} }
  }
  return out;
}

// Build the HTTP request for a provider. Claude has its own format; everything else speaks OpenAI's.
function aiRequest(st, content, opts) {
  const key = cleanKey(st.apiKey), model = st.model || DEFAULTS.model;
  const messages = [{ role: "user", content }];
  if (st.provider === "anthropic" || !PROVIDERS[st.provider]) {
    return { headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: { model, max_tokens: opts.maxTokens, stream: opts.stream, messages } };
  }
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = "Bearer " + key;
  const body = { model, stream: opts.stream, messages };
  // OpenAI's newer models only take max_completion_tokens; Gemini picks its own limit; other services expect max_tokens.
  if (st.provider === "openai") body.max_completion_tokens = opts.maxTokens;
  else if (st.provider === "custom") body.max_tokens = opts.maxTokens;
  return { headers, body };
}
async function aiFetch(st, content, opts) {
  const { headers, body } = aiRequest(st, content, opts);
  return fetch(endpointOf(st), { method: "POST", headers, body: JSON.stringify(body) });
}
const errMsg = b => b?.error?.message || (Array.isArray(b) && b[0]?.error?.message) || (typeof b?.error === "string" && b.error) || "";

// Ask the AI for a batch, streaming the reply. Streaming matters: Chrome shuts down an extension's
// background worker if a request takes 30+ seconds to start answering, which a big batch can.
async function askAI(st) {
  const name = providerOf(st).name, home = providerOf(st).console;
  if (st.provider === "custom" && !String(st.baseUrl || "").trim()) throw new Error("Add your AI service's base URL in settings.");
  let res;
  try {
    res = await aiFetch(st, buildPrompt(st), { maxTokens: 8000, stream: true });
  } catch (e) {
    throw new Error(`Couldn't connect to ${name} (${e.message}). Check your internet connection${st.provider === "custom" ? " and the base URL in settings" : ""}.`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = errMsg(body) || res.statusText || "unknown error";
    if (res.status === 401 || (res.status === 400 && /api key/i.test(msg))) throw new Error("Your API key was rejected. Check it in settings.");
    if (res.status === 403) throw new Error(`Your API key doesn't have access: ${msg}`);
    if (res.status === 404) throw new Error(`The model "${st.model}" wasn't found. Try a different model in settings. (${msg})`);
    if (/credit|billing|balance|quota/i.test(msg)) throw new Error(`Your API account is out of credits${home ? `. Add some at ${home}` : ""}.`);
    if (res.status === 429) throw new Error("Hit the API rate limit. Using built-in sites for a bit.");
    if (res.status === 529 || res.status >= 500) throw new Error(`${name} is busy right now. It'll try again on your next few stumbles.`);
    throw new Error(`The API returned an error (${res.status}): ${msg}`);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", stop = "";
  const handle = line => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    let ev; try { ev = JSON.parse(data); } catch (e) { return; }
    if (ev.error) throw new Error(`${name} had a problem mid-reply: ${errMsg(ev) || "unknown"}. It'll try again soon.`);
    // Claude's events
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text;
    else if (ev.type === "message_delta" && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
    // OpenAI-style chunks
    const choice = ev.choices?.[0];
    if (choice) {
      if (typeof choice.delta?.content === "string") text += choice.delta.content;
      if (choice.finish_reason) stop = choice.finish_reason;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    lines.forEach(handle);
  }
  handle(buf);
  const sites = parseSites(text);
  if (!sites.length) throw new Error(`${name} replied, but not with a list of sites${stop ? ` (stopped: ${stop})` : ""}. It'll try again on your next stumble.`);
  return sites;
}

function refill() {
  if (refilling) return refilling;
  // Ping a Chrome API every 20s so the background worker isn't put to sleep mid-request.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  refilling = (async () => {
    const st = await load();
    if (!aiOn(st) || !st.interests.length) return;
    try {
      const arr = await askAI(st);
      // merge against the latest state, since stumbles may have happened meanwhile
      const now = await load();
      const all = [...CATS, ...now.custom];
      const taken = new Set([...now.seen, ...now.queue.map(q => norm(q.url))]);
      const hostsTaken = new Set([...seenHosts(now, 300), ...now.queue.map(q => hostOf(q.url))]);
      const dead = new Set(now.dead);
      const fresh = [];
      for (const s of arr) {
        if (!s || typeof s.url !== "string" || !/^https?:\/\/\S+\.\S+/.test(s.url)) continue;
        const k = norm(s.url);
        if (taken.has(k) || hostsTaken.has(hostOf(s.url)) || dead.has(hostOf(s.url))) continue;
        taken.add(k); hostsTaken.add(hostOf(s.url));
        const cat = all.find(c => c.toLowerCase() === String(s.interest || "").toLowerCase()) || "Wildcard";
        fresh.push({ cat, icon: String(s.emoji || "✨").slice(0, 4), title: String(s.title || hostOf(s.url)).slice(0, 80), url: s.url, blurb: String(s.blurb || "").slice(0, 200), kind: KINDS.includes(s.kind) ? s.kind : "" });
      }
      const queue = now.queue.concat(fresh);
      for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
      await save({ queue, lastError: "", ratedSinceRefill: 0 });
    } catch (e) {
      await save({ lastError: e.message || String(e) });
    }
  })().finally(() => { clearInterval(keepAlive); refilling = null; });
  return refilling;
}

function pickNext(st) {
  const recentHosts = seenHosts(st, 30);
  const notRecent = list => { const f = list.filter(q => !recentHosts.has(hostOf(q.url))); return f.length ? f : list; };
  const lib = notRecent(libraryFresh(st));
  const pool = notRecent(st.queue);
  const itemW = q => catW(st, q.cat) * kindW(st, q.kind);
  if (pool.length && (!lib.length || Math.random() < 0.8)) {
    const pick = pool[weightedIndex(pool, itemW)];
    return { pick, index: st.queue.indexOf(pick) };
  }
  if (lib.length) return { pick: lib[weightedIndex(lib, itemW)], index: -1 };
  return { pick: null };
}

// After 3 ratings, fetch a fresh batch early (if the queue isn't already big) so new taste shows up sooner.
async function maybeRefreshEarly() {
  const st = await load();
  if (aiOn(st) && st.ratedSinceRefill >= 3 && st.queue.length < 25) refill();
}

async function stumble(tabId) {
  let st = await load();
  if (!st.interests.length) return { error: "Pick at least one interest in settings." };
  let { pick, index } = pickNext(st);
  if (!pick && aiOn(st)) { await refill(); st = await load(); ({ pick, index } = pickNext(st)); }
  if (!pick) {
    return { error: aiOn(st) ? (st.lastError || "Couldn't find new sites right now. Try again in a moment.") : "You've seen every built-in site for these interests. Add an AI API key in settings for endless stumbling." };
  }
  const todayKey = new Date().toDateString();
  const today = st.today.date === todayKey ? { date: todayKey, n: st.today.n + 1 } : { date: todayKey, n: 1 };
  const seen = st.seen.concat(norm(pick.url)).slice(-3000);
  const queue = index >= 0 ? st.queue.filter((_, i) => i !== index) : st.queue;
  await save({ current: pick, seen, queue, today });
  let tab;
  if (tabId != null) tab = await chrome.tabs.update(tabId, { url: pick.url });
  else tab = await chrome.tabs.create({ url: pick.url });
  const { tabs = {} } = await chrome.storage.local.get("tabs");
  tabs[tab.id] = pick;
  await chrome.storage.local.set({ tabs });
  if (queue.length < 10 && aiOn(st)) refill();
  return { current: pick };
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}
async function tabCurrent(tabId) {
  const { tabs = {} } = await chrome.storage.local.get("tabs");
  return tabs[tabId] || null;
}
async function forgetTab(tabId) {
  const { tabs = {} } = await chrome.storage.local.get("tabs");
  if (tabs[tabId]) { delete tabs[tabId]; await chrome.storage.local.set({ tabs }); }
}

// Toolbar icon and keyboard shortcut: stumble right away, no popup.
chrome.action.onClicked.addListener(tab => stumbleWithFeedback(tab ? tab.id : null));

// Icon clicks and the shortcut have nowhere to show errors, so flag them on the icon itself.
async function stumbleWithFeedback(tabId) {
  let r;
  try { r = await stumble(tabId); } catch (e) { r = { error: "Something went wrong: " + (e && e.message || e) }; }
  if (r && r.error) {
    chrome.action.setBadgeBackgroundColor({ color: "#B5657A" });
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setTitle({ title: "Stumble: " + r.error });
  } else {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Stumble!" });
  }
  return r;
}
chrome.commands.onCommand.addListener(async cmd => { if (cmd === "stumble") stumbleWithFeedback(await activeTabId()); });

// Put the toolbar on every page loaded in a tab that's in stumble mode.
chrome.webNavigation.onDOMContentLoaded.addListener(async ({ tabId, frameId }) => {
  if (frameId !== 0 || !(await tabCurrent(tabId))) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ["toolbar.js"] }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(forgetTab);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    const tabId = sender.tab ? sender.tab.id : await activeTabId();
    const st = await load();
    const cur = (await tabCurrent(tabId)) || st.current;
    switch (msg.type) {
      case "stumble": return stumble(tabId);
      case "barState": {
        const { barCollapsed = false } = await chrome.storage.local.get("barCollapsed");
        const liked = !!cur && st.saved.some(s => norm(s.url) === norm(cur.url));
        return { current: cur, liked, collapsed: barCollapsed, error: st.lastError, hasKey: aiOn(st), left: st.queue.length };
      }
      case "like": {
        if (!cur) return {};
        const has = st.saved.some(s => norm(s.url) === norm(cur.url));
        const saved = has ? st.saved.filter(s => norm(s.url) !== norm(cur.url)) : [{ title: cur.title, url: cur.url, cat: cur.cat }, ...st.saved];
        const taste = tally(st.taste, cur, "up", has ? -1 : 1);
        await save({ saved, taste, ratedSinceRefill: st.ratedSinceRefill + 1 });
        maybeRefreshEarly();
        return { liked: !has };
      }
      case "nope": {
        if (!cur) return stumble(tabId);
        const wasLiked = st.saved.some(s => norm(s.url) === norm(cur.url));
        let taste = tally(st.taste, cur, "down", 1);
        if (wasLiked) taste = tally(taste, cur, "up", -1);
        // drop lookalikes already waiting; if this interest is now clearly unwanted, thin it out to 2 queued
        let queue = st.queue.filter(q => !similar(cur, q));
        if (weight(taste.cats[cur.cat]) <= 0.5) {
          let kept = 0;
          queue = queue.filter(q => q.cat !== cur.cat || kept++ < 2);
        }
        await save({
          skipped: st.skipped.concat({ title: cur.title, host: hostOf(cur.url) }).slice(-40),
          saved: st.saved.filter(s => norm(s.url) !== norm(cur.url)),
          taste, queue, ratedSinceRefill: st.ratedSinceRefill + 1
        });
        const r = await stumble(tabId);
        maybeRefreshEarly();
        return r;
      }
      case "resetTaste": await save({ taste: { cats: {}, kinds: {} } }); return {};
      case "dead":
        if (cur) await save({ dead: st.dead.concat(hostOf(cur.url)).slice(-100), saved: st.saved.filter(s => norm(s.url) !== norm(cur.url)) });
        return stumble(tabId);
      case "collapse": await save({ barCollapsed: !!msg.value }); return {};
      case "close": await forgetTab(tabId); return {};
      case "options": chrome.runtime.openOptionsPage(); return {};
      case "interestsChanged":
        await save({ queue: st.queue.filter(q => q.cat === "Wildcard" || st.interests.includes(q.cat)) });
        if (aiOn(st) && st.queue.length < 10) refill();
        return {};
      case "refill": refill(); return {};
      case "testKey": {
        // A tiny real request, so settings can show exactly what the API says.
        try {
          const r = await aiFetch(st, "Say hi", { maxTokens: 16, stream: false });
          if (r.ok) return { ok: true };
          const b = await r.json().catch(() => ({}));
          return { ok: false, error: `${r.status}: ${errMsg(b) || r.statusText}` };
        } catch (e) { return { ok: false, error: `Couldn't connect: ${e.message}` }; }
      }
    }
    return {};
  })().then(reply, e => reply({ error: String(e) }));
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") { await save({ knownCats: CATS }); chrome.runtime.openOptionsPage(); }
  // After an update, put fresh toolbars back on tabs that were stumbling.
  if (reason === "update") {
    // Switch on interests added since the last version, so updating users see them.
    const { interests, knownCats = CATS.filter(c => c !== "Words & language" && c !== "History") } = await chrome.storage.local.get(["interests", "knownCats"]);
    const added = CATS.filter(c => !knownCats.includes(c));
    if (interests && added.length) await save({ interests: [...interests, ...added.filter(c => !interests.includes(c))] });
    await save({ knownCats: CATS });
    const { tabs = {} } = await chrome.storage.local.get("tabs");
    for (const id of Object.keys(tabs)) {
      chrome.scripting.executeScript({ target: { tabId: Number(id) }, files: ["toolbar.js"] })
        .catch(() => forgetTab(Number(id)));
    }
  }
  setupUpdateCheck();
});
// Tab ids don't survive a browser restart, so start clean.
chrome.runtime.onStartup.addListener(async () => { await chrome.storage.local.set({ tabs: {} }); setupUpdateCheck(); });

/* ---- Auto-update: reload itself when newer files land in the extension folder ---- */
// Only for the unpacked (load-from-folder) install. Store installs have update_url and update themselves.
function setupUpdateCheck() {
  if (chrome.runtime.getManifest().update_url) return;
  chrome.alarms.create("checkForUpdate", { periodInMinutes: 1 });
}
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name !== "checkForUpdate") return;
  try {
    const res = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
    const onDisk = (await res.json()).version;
    if (onDisk && onDisk !== chrome.runtime.getManifest().version) chrome.runtime.reload();
  } catch (e) { /* half-copied files; try again next minute */ }
});
