const $ = id => document.getElementById(id);
const CATS = Object.keys(SITES);
let st = {};

async function load() {
  st = Object.assign({ interests: CATS, custom: [], saved: [], apiKey: "", model: "claude-sonnet-5" }, await chrome.storage.local.get(null));
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

$("saveKey").onclick = async () => {
  const apiKey = $("key").value.replace(/[^\x21-\x7E]/g, ""), model = $("model").value;
  await chrome.storage.local.set({ apiKey, model, lastError: "" });
  if (!apiKey) { $("note").textContent = "Key removed. Stumble will use the built-in list."; return; }
  $("note").textContent = "Saved. Testing the key…";
  const r = await chrome.runtime.sendMessage({ type: "testKey" });
  if (r && r.ok) { $("note").textContent = "Key works. Finding your first batch of sites now."; chrome.runtime.sendMessage({ type: "refill" }); }
  else $("note").textContent = "The API said: " + (r && r.error || "no response");
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
(async () => { await load(); $("key").value = st.apiKey; $("model").value = st.model; renderChips(); renderSaved(); renderTaste(); })();
