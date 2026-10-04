// The Stumble toolbar, injected at the top of pages in stumble mode.
(() => {
  if (window.__stumbleBar) { window.__stumbleBar.render(); return; }
  // A toolbar left behind by an older version of the extension: swap it out.
  document.getElementById("stumble-toolbar-host")?.remove();
  const H = 46;
  const send = async msg => {
    try { return await chrome.runtime.sendMessage(msg); }
    catch (e) { return { error: "Stumble just updated. Refresh this page to get the toolbar back." }; }
  };

  const host = document.createElement("div");
  host.id = "stumble-toolbar-host";
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });

  const css = new CSSStyleSheet();
  css.replaceSync(`
    :host{all:initial}
    *{box-sizing:border-box;margin:0}
    .bar{--paper:#FBF3E6;--ink:#3B2A26;--soft:#7A625A;--rose:#B5657A;--tint:#F3DDE0;--line:#E8D6C2;--moss:#6E7A4F;
      height:${H}px;display:flex;align-items:center;gap:8px;padding:0 10px;background:var(--paper);color:var(--ink);
      border-bottom:1.5px solid var(--line);box-shadow:0 2px 8px rgba(59,42,38,.12);
      font:14px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    @media (prefers-color-scheme:dark){.bar{--paper:#221A1B;--ink:#F4E6D6;--soft:#C3AA9E;--rose:#E0929F;--tint:#4A2F35;--line:#4A3A36;--moss:#A5B283}}
    button{font:inherit;color:inherit;cursor:pointer;background:none;border:1.5px solid transparent;border-radius:8px;height:32px;padding:0 10px;white-space:nowrap}
    button:hover{border-color:var(--line)}
    button:focus-visible{outline:3px solid #D99A2B;outline-offset:1px}
    .logo{font-family:"Fraunces",Georgia,serif;font-weight:700;font-size:19px;color:var(--rose);letter-spacing:-.02em;padding-right:4px}
    .go{background:var(--rose);color:var(--paper);font-weight:700;border:0;padding:0 16px;box-shadow:0 3px 0 color-mix(in srgb,var(--rose) 60%,#000)}
    .go:hover{filter:brightness(1.05)}
    .go:active{transform:translateY(2px);box-shadow:0 1px 0 color-mix(in srgb,var(--rose) 60%,#000)}
    .go:disabled{opacity:.6;cursor:progress}
    .on{border-color:var(--rose);color:var(--rose);font-weight:600;background:var(--tint)}
    .info{flex:1;min-width:0;display:flex;align-items:center;gap:8px;overflow:hidden;padding-left:6px;border-left:1.5px solid var(--line)}
    .stamp{font-size:18px}
    .text{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .cat{color:var(--moss);font-weight:600}
    .title{font-weight:600}
    .blurb{color:var(--soft)}
    .err{color:var(--rose)}
    .quiet{color:var(--soft);padding:0 7px}
    button:disabled{opacity:.4;cursor:default}
    select{font:inherit;color:inherit;background:var(--paper);border:1.5px solid var(--line);border-radius:8px;height:32px;padding:0 6px;cursor:pointer}
    select:focus-visible{outline:3px solid #D99A2B;outline-offset:1px}
    .pill{position:fixed;top:8px;right:10px;height:auto;padding:4px;gap:4px;border:1.5px solid var(--line);border-radius:12px}
    @media (max-width:760px){.blurb,.label{display:none}}
    @media (max-width:560px){select{display:none}}
  `);
  root.adoptedStyleSheets = [css];

  const bar = document.createElement("div");
  bar.className = "bar";
  root.appendChild(bar);

  const el = (tag, cls, text, attrs = {}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  let prevMargin = null;
  function pushPage(on) {
    const s = document.documentElement.style;
    if (on) {
      if (prevMargin === null) prevMargin = s.getPropertyValue("margin-top");
      s.setProperty("margin-top", H + "px", "important");
    } else if (prevMargin !== null) {
      prevMargin ? s.setProperty("margin-top", prevMargin) : s.removeProperty("margin-top");
      prevMargin = null;
    }
  }

  async function act(type, btn) {
    if (btn) { btn.disabled = true; }
    const r = await send({ type });
    if (btn) btn.disabled = false;
    if (r && r.error) showError(r.error);
  }
  let errorText = "";
  function showError(t) { errorText = t; render(); }

  async function render() {
    const st = await send({ type: "barState" });
    if (!st) return;
    bar.textContent = "";
    bar.className = st.collapsed ? "bar pill" : "bar";
    pushPage(!st.collapsed);

    const go = el("button", "go", "Stumble!", { title: "Stumble (Alt+Shift+S)" });
    go.onclick = () => { go.textContent = "Stumbling…"; act("stumble", go); };

    if (st.collapsed) {
      const open = el("button", "quiet", "▾", { title: "Show toolbar", "aria-label": "Show toolbar" });
      open.onclick = async () => { await send({ type: "collapse", value: false }); render(); };
      bar.append(go, open);
      return;
    }

    const back = el("button", "quiet", "◀", { title: "Back to the previous site", "aria-label": "Back to the previous site" });
    back.disabled = !st.canBack;
    back.onclick = () => act("back", back);

    // Mood: a quick steer for this browsing session
    const mood = el("select", "", null, { title: "Mood for this session", "aria-label": "Mood" });
    [["", "🎲 Any mood"], ["calm", "🌿 Calm"], ["play", "🎮 Play"], ["learn", "🧠 Learn"]].forEach(([v, t]) => mood.append(new Option(t, v)));
    mood.value = st.mood || "";
    mood.onchange = () => send({ type: "mood", value: mood.value });

    const like = el("button", st.liked ? "on" : "", st.liked ? "👍 Liked" : "👍", { title: "I like this", "aria-pressed": String(st.liked) });
    like.onclick = async () => { await send({ type: "like" }); render(); };
    const later = el("button", st.later ? "on" : "", st.later ? "🔖 Saved" : "🔖", { title: st.later ? "Saved for later. Click to unsave" : "Save for later (doesn't count as a like)", "aria-label": "Save for later", "aria-pressed": String(!!st.later) });
    later.onclick = async () => { await send({ type: "later" }); render(); };
    const nope = el("button", "", "👎", { title: "Not for me", "aria-label": "Not for me" });
    nope.onclick = () => act("nope", nope);

    const info = el("div", "info");
    const c = st.current;
    if (c) {
      info.append(el("span", "stamp", c.icon));
      const t = el("div", "text");
      t.append(el("span", "cat", c.cat + "  "), el("span", "title", c.title), el("span", "blurb", "  " + c.blurb));
      info.append(t);
    }
    const msg = errorText || st.error;
    if (msg) info.append(el("span", "err text", msg));

    const dead = el("button", "quiet", "Broken?", { title: "Link broken? Skip it and never show it again" });
    dead.onclick = () => act("dead", dead);
    const gear = el("button", "quiet", "⚙", { title: "Interests and settings", "aria-label": "Interests and settings" });
    gear.onclick = () => send({ type: "options" });
    const hide = el("button", "quiet", "▴", { title: "Shrink toolbar", "aria-label": "Shrink toolbar" });
    hide.onclick = async () => { await send({ type: "collapse", value: true }); render(); };
    const close = el("button", "quiet", "✕", { title: "Stop stumbling in this tab", "aria-label": "Close toolbar" });
    close.onclick = async () => { await send({ type: "close" }); pushPage(false); host.remove(); delete window.__stumbleBar; };

    bar.append(el("span", "logo", "Stumble"), back, go, like, later, nope, mood, info, dead, gear, hide, close);
  }

  document.documentElement.appendChild(host);
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && (ch.saved || ch.later || ch.lastError || ch.barCollapsed)) render(); });
  window.__stumbleBar = { render };
  render();
})();
