const $ = id => document.getElementById(id);
const CATS = Object.keys(SITES);
let st = {};

async function load() {
  st = Object.assign({ interests: CATS, custom: [], saved: [], apiKey: "", lang: "", provider: "anthropic", baseUrl: "", model: "claude-sonnet-5" }, await chrome.storage.local.get(null));
}
const allCats = () => [...CATS, ...st.custom];
async function saveInterests() {
  await chrome.storage.local.set({ interests: st.interests, custom: st.custom });
  chrome.runtime.sendMessage({ type: "interestsChanged" });
  renderChips();
}

function renderChips() {
  const box = $("chips"); box.innerHTML = "";
  allCats().forEach(c => {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button";
    const isCustom = !SITES[c];
    b.textContent = (isCustom ? "✨ " : SITES[c][0] + " ") + c;
    if (isCustom) {
      const r = document.createElement("span"); r.className = "rm"; r.textContent = "✕"; r.title = "Remove";
      r.onclick = e => { e.stopPropagation(); st.custom = st.custom.filter(x => x !== c); st.interests = st.interests.filter(x => x !== c); saveInterests(); };
      b.appendChild(r);
    }
    b.setAttribute("aria-pressed", st.interests.includes(c));
    b.onclick = () => { st.interests = st.interests.includes(c) ? st.interests.filter(x => x !== c) : [...st.interests, c]; saveInterests(); };
    box.appendChild(b);
  });
  $("toggleAll").textContent = allCats().every(c => st.interests.includes(c)) ? "Clear all" : "Select all";
}
function addInterest() {
  const v = $("addInput").value.trim().replace(/\s+/g, " ");
  if (!v) return;
  const exists = allCats().find(c => c.toLowerCase() === v.toLowerCase());
  const name = exists || v;
  if (!exists) st.custom.push(v);
  if (!st.interests.includes(name)) st.interests.push(name);
  $("addInput").value = ""; saveInterests();
}
$("addBtn").onclick = addInterest;
$("addInput").addEventListener("keydown", e => { if (e.key === "Enter") addInterest(); });
$("toggleAll").onclick = () => { st.interests = allCats().every(c => st.interests.includes(c)) ? [] : allCats(); saveInterests(); };

// Show the fields and model suggestions for the chosen provider.
function renderProvider(keepModel) {
  const id = $("provider").value, p = PROVIDERS[id];
  $("baseUrlField").hidden = id !== "custom";
  $("key").placeholder = p.keyHint;
  $("getKey").textContent = p.console ? `Get a key at ${p.console}. ` : "";
  $("models").innerHTML = "";
  p.models.forEach(([v, label]) => $("models").appendChild(Object.assign(document.createElement("option"), { value: v, label })));
  if (!keepModel) $("model").value = p.models[0]?.[0] || "";
  $("modelHelp").textContent = p.models.length ? "Pick a suggestion or type any model name your account can use." : "The model name your service uses, like llama3.1 or mistral-large-latest.";
}
$("provider").onchange = () => renderProvider(false);

$("saveKey").onclick = async () => {
  const apiKey = cleanKey($("key").value), provider = $("provider").value, model = $("model").value.trim(), baseUrl = $("baseUrl").value.trim();
  if (provider === "custom" && baseUrl && !/^https?:\/\//i.test(baseUrl)) { $("note").textContent = "The base URL should start with https:// (or http:// for a service on your computer)."; return; }
  if ((apiKey || baseUrl) && !model) { $("note").textContent = "Enter a model name."; return; }
  await chrome.storage.local.set({ apiKey, provider, model, baseUrl, lastError: "" });
  if (!aiOn({ apiKey, provider, baseUrl })) { $("note").textContent = "Key removed. Stumble will use the built-in list."; return; }
  $("note").textContent = "Saved. Testing the key…";
  const r = await chrome.runtime.sendMessage({ type: "testKey" });
  if (r && r.ok) { $("note").textContent = "Key works. Finding your first batch of sites now."; chrome.runtime.sendMessage({ type: "refill" }); }
  else $("note").textContent = "The API said: " + (r && r.error || "no response");
};

Object.entries(LANGS).sort((a, b) => a[1].localeCompare(b[1])).forEach(([code, name]) => $("lang").appendChild(new Option(name, code)));
$("lang").onchange = async () => {
  await chrome.storage.local.set({ lang: $("lang").value });
  chrome.runtime.sendMessage({ type: "langChanged" });
};

function renderSaved() {
  $("likedCount").textContent = st.saved.length;
  const ul = $("saved"); ul.innerHTML = "";
  if (!st.saved.length) { ul.innerHTML = '<li><small>Sites you like collect here, and help steer what you stumble onto next.</small></li>'; return; }
  st.saved.forEach(s => {
    const li = document.createElement("li");
    li.innerHTML = '<span><a target="_blank" rel="noopener noreferrer"></a><br><small></small></span><button class="link" type="button">Remove</button>';
    const a = li.querySelector("a"); a.href = s.url; a.textContent = s.title;
    li.querySelector("small").textContent = s.cat;
    li.querySelector("button").onclick = async () => { st.saved = st.saved.filter(x => x.url !== s.url); await chrome.storage.local.set({ saved: st.saved }); renderSaved(); };
    ul.appendChild(li);
  });
}
$("clear").onclick = async () => {
  if (!confirm("Clear your stumble history? Liked sites stay.")) return;
  await chrome.storage.local.set({ seen: [], skipped: [], dead: [], today: { date: "", n: 0 } });
  $("note").textContent = "History cleared.";
};
$("shortcuts").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });

function renderTaste() {
  const box = $("taste"); box.innerHTML = "";
  const taste = st.taste || { cats: {}, kinds: {} };
  const rows = (bucket) => Object.entries(bucket).filter(([, t]) => t.up + t.down > 0)
    .map(([k, t]) => [k, t, Math.max(0.2, Math.min(5, (t.up + 2) / (t.down + 2)))]).sort((a, b) => b[2] - a[2]);
  const section = (label, bucket) => {
    const r = rows(bucket); if (!r.length) return;
    box.appendChild(Object.assign(document.createElement("p"), { className: "sub", textContent: label }));
    r.forEach(([k, t, w]) => {
      const row = document.createElement("div"); row.className = "trow";
      const name = document.createElement("span"); name.textContent = `${k}  (👍 ${t.up}, 👎 ${t.down})`;
      const m = document.createElement("div"); m.className = "meter";
      const fill = document.createElement("span");
      const x = Math.log(w) / Math.log(5);            // -1 … 1
      fill.style.cssText = x >= 0 ? `left:50%;width:${x * 50}%;background:var(--moss)` : `right:50%;width:${-x * 50}%;background:var(--rose)`;
      m.appendChild(fill);
      const lean = document.createElement("span"); lean.className = "lean";
      lean.textContent = w >= 1.3 ? "more" : w <= 0.77 ? "less" : "even";
      row.append(name, m, lean); box.appendChild(row);
    });
  };
  section("Interests", taste.cats);
  section("Kinds of site", taste.kinds);
  if (!box.children.length) box.innerHTML = '<p class="help">Nothing yet. Rate a few sites from the toolbar.</p>';
}
$("resetTaste").onclick = async () => {
  if (!confirm("Forget what Stumble has learned from your ratings? Liked sites stay.")) return;
  await chrome.runtime.sendMessage({ type: "resetTaste" });
};

chrome.storage.onChanged.addListener(async (ch) => { if (ch.saved || ch.taste) { await load(); renderSaved(); renderTaste(); } });
(async () => { await load(); $("lang").value = LANGS[st.lang] ? st.lang : ""; $("key").value = st.apiKey; $("provider").value = PROVIDERS[st.provider] ? st.provider : "anthropic"; $("baseUrl").value = st.baseUrl; $("model").value = st.model; renderProvider(true); renderChips(); renderSaved(); renderTaste(); })();
