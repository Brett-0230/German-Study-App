/* 每日德語 — 單字學習 App（參考 Daily Deutsch 功能設計，單字表由使用者提供） */
(() => {
  "use strict";

  // ---------- 儲存 ----------
  const KEY = {
    vocab: "gsa.vocab",
    progress: "gsa.progress",
    settings: "gsa.settings",
    stats: "gsa.stats",
    favs: "gsa.favs",
  };
  const load = (k, d) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
  };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("儲存失敗（瀏覽器儲存空間不足？）"); }
  };

  const DAY = 86400000;
  const today = () => dateKey(new Date());
  function dateKey(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  function startOfDay(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  const settings = Object.assign(
    { dailyNew: 10, quizLength: 10, autoSpeak: true, rate: 0.9, showExample: true, filterCat: "", filterLevel: "" },
    load(KEY.settings, {})
  );
  let vocab = normalizeList(load(KEY.vocab, null) || window.DEFAULT_VOCAB || []);
  let progress = load(KEY.progress, {}); // id -> {reps, ease, interval, due, lapses, seen, wrong, correct}
  let stats = Object.assign({ days: {}, }, load(KEY.stats, {})); // days[date] = {learned, reviewed, quiz, correct}
  let favs = new Set(load(KEY.favs, []));

  // ---------- 單字資料 ----------
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function normalizeWord(w) {
    let de = String(w.de || "").trim();
    let article = String(w.article || "").trim().toLowerCase();
    const m = de.match(/^(der|die|das)\s+(.+)$/i);
    if (m && !article) { article = m[1].toLowerCase(); de = m[2].trim(); }
    if (!["der", "die", "das"].includes(article)) article = "";
    const zh = String(w.zh || "").trim();
    const out = {
      de, zh, article,
      plural: String(w.plural || "").trim(),
      pos: String(w.pos || "").trim() || (article ? "名詞" : ""),
      ex: String(w.ex || "").trim(),
      exZh: String(w.exZh || "").trim(),
      level: String(w.level || "").trim().toUpperCase(),
      cat: String(w.cat || "").trim(),
    };
    out.id = w.id || hash(out.article + "|" + out.de + "|" + out.zh);
    return out;
  }
  function normalizeList(list) {
    const seen = new Set(), out = [];
    for (const w of list) {
      const n = normalizeWord(w);
      if (!n.de || !n.zh || seen.has(n.id)) continue;
      seen.add(n.id); out.push(n);
    }
    return out;
  }
  const full = (w) => (w.article ? `${w.article} ${w.de}` : w.de);
  const fullHTML = (w) => (w.article ? `<span class="art-${w.article}">${w.article}</span> ${esc(w.de)}` : esc(w.de));
  const byId = (id) => vocab.find((w) => w.id === id);

  function activeVocab() {
    return vocab.filter((w) =>
      (!settings.filterCat || w.cat === settings.filterCat) &&
      (!settings.filterLevel || w.level === settings.filterLevel));
  }

  // ---------- CSV / TSV 解析 ----------
  const HEADER_ALIASES = {
    de: ["de", "german", "deutsch", "word", "wort", "德文", "德語", "單字", "单词", "单字", "德文單字"],
    zh: ["zh", "chinese", "meaning", "translation", "中文", "意思", "中文意思", "翻譯", "翻译", "解釋"],
    article: ["article", "artikel", "冠詞", "冠词", "性別", "詞性冠詞"],
    plural: ["plural", "pl", "複數", "复数"],
    pos: ["pos", "type", "wortart", "詞性", "词性"],
    ex: ["ex", "example", "beispiel", "sentence", "例句", "德文例句"],
    exZh: ["exzh", "ex_zh", "example_zh", "examplezh", "例句翻譯", "例句翻译", "例句中文", "中文例句"],
    level: ["level", "niveau", "程度", "等級", "等级", "級別"],
    cat: ["cat", "category", "topic", "kategorie", "分類", "分类", "主題", "主题", "單元", "课", "課"],
  };
  function parseDelimited(text) {
    text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const firstLine = text.split("\n").find((l) => l.trim()) || "";
    const delim = firstLine.includes("\t") ? "\t" : (firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === "") q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    row.push(cell); rows.push(row);
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
  }
  function rowsToWords(rows) {
    if (!rows.length) return [];
    const norm = (s) => s.toLowerCase().replace(/[\s\-]/g, "");
    const header = rows[0].map(norm);
    const map = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = header.findIndex((h) => aliases.map(norm).includes(h));
      if (idx >= 0) map[field] = idx;
    }
    let body = rows;
    if (map.de !== undefined && map.zh !== undefined) body = rows.slice(1);
    else {
      // 沒有標題列：預設欄位順序 德文, 中文, 例句, 例句翻譯, 冠詞, 複數, 詞性, 程度, 分類
      ["de", "zh", "ex", "exZh", "article", "plural", "pos", "level", "cat"].forEach((f, i) => (map[f] = i));
    }
    return body.map((r) => {
      const w = {};
      for (const [f, i] of Object.entries(map)) w[f] = r[i] || "";
      return w;
    });
  }
  function parseImport(text) {
    const t = text.trim();
    if (!t) return [];
    if (t.startsWith("[") || t.startsWith("{")) {
      const data = JSON.parse(t);
      return Array.isArray(data) ? data : (data.words || data.vocab || []);
    }
    return rowsToWords(parseDelimited(t));
  }

  // ---------- 間隔重複 (SM-2 簡化版) ----------
  function getP(id) { return progress[id] || null; }
  function isKnown(p) { return p && p.interval >= 21; }
  function schedule(id, grade) { // grade: 0 忘記, 1 困難, 2 記得, 3 簡單
    const now = Date.now();
    const p = progress[id] || { reps: 0, ease: 2.5, interval: 0, due: now, lapses: 0, seen: now, wrong: 0, correct: 0 };
    const isNew = !progress[id];
    if (grade === 0) {
      p.reps = 0; p.lapses++; p.interval = 0; p.ease = Math.max(1.3, p.ease - 0.2);
      p.due = now + 60 * 1000; // 1 分鐘後（本輪再出現）
    } else {
      if (p.reps === 0) p.interval = grade === 1 ? 1 : grade === 2 ? 1 : 3;
      else if (p.reps === 1) p.interval = grade === 1 ? 2 : grade === 2 ? 3 : 6;
      else p.interval = Math.round(p.interval * (grade === 1 ? 1.2 : grade === 2 ? p.ease : p.ease * 1.3));
      p.ease = Math.max(1.3, p.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
      p.reps++;
      p.due = startOfDay(now) + p.interval * DAY;
    }
    progress[id] = p;
    save(KEY.progress, progress);
    bump(isNew ? "learned" : "reviewed");
    return p;
  }
  function intervalLabel(id, grade) {
    const p = progress[id];
    if (grade === 0) return "1 分";
    let iv;
    if (!p || p.reps === 0) iv = grade === 3 ? 3 : 1;
    else if (p.reps === 1) iv = grade === 1 ? 2 : grade === 2 ? 3 : 6;
    else iv = Math.round(p.interval * (grade === 1 ? 1.2 : grade === 2 ? p.ease : p.ease * 1.3));
    return iv >= 30 ? `${Math.round(iv / 30)} 月` : `${iv} 天`;
  }

  // ---------- 統計 / 連續天數 ----------
  function bump(field, n = 1) {
    const d = today();
    stats.days[d] = stats.days[d] || { learned: 0, reviewed: 0, quiz: 0, correct: 0 };
    stats.days[d][field] = (stats.days[d][field] || 0) + n;
    save(KEY.stats, stats);
    renderStreak();
  }
  function streak() {
    let n = 0; const d = new Date();
    if (!stats.days[dateKey(d)]) d.setDate(d.getDate() - 1); // 今天還沒學不算中斷
    while (stats.days[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function renderStreak() { $("#streak").textContent = `🔥 ${streak()}`; }
  const todayStats = () => stats.days[today()] || { learned: 0, reviewed: 0, quiz: 0, correct: 0 };

  // ---------- 發音 (Web Speech API) ----------
  let deVoice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const vs = speechSynthesis.getVoices();
    deVoice = vs.find((v) => /de[-_]DE/i.test(v.lang) && /google|premium|enhanced|anna|helena/i.test(v.name)) ||
      vs.find((v) => /^de/i.test(v.lang)) || null;
  }
  if ("speechSynthesis" in window) {
    pickVoice(); speechSynthesis.onvoiceschanged = pickVoice;
    // iPhone / iPad：語音必須先由使用者點擊「解鎖」，之後才能自動播放
    const unlock = () => {
      try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; u.lang = "de-DE"; speechSynthesis.speak(u); } catch {}
      if (!deVoice) pickVoice();
      document.removeEventListener("touchend", unlock); document.removeEventListener("click", unlock);
    };
    document.addEventListener("touchend", unlock, { once: true }); document.addEventListener("click", unlock, { once: true });
  }
  function speak(text) {
    if (!("speechSynthesis" in window)) { toast("此瀏覽器不支援語音"); return; }
    speechSynthesis.cancel();
    if (speechSynthesis.paused) speechSynthesis.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE"; u.rate = settings.rate;
    if (deVoice) u.voice = deVoice;
    speechSynthesis.speak(u);
  }

  // ---------- 工具 ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function favBtn(w) { return `<button class="icon-btn" data-fav="${w.id}" title="收藏">${favs.has(w.id) ? "★" : "☆"}</button>`; }
  function toggleFav(id) {
    favs.has(id) ? favs.delete(id) : favs.add(id);
    save(KEY.favs, [...favs]);
    $$(`[data-fav="${id}"]`).forEach((b) => (b.textContent = favs.has(id) ? "★" : "☆"));
  }
  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fav]"); if (f) { e.stopPropagation(); toggleFav(f.dataset.fav); return; }
    const s = e.target.closest("[data-speak]"); if (s) { e.stopPropagation(); speak(s.dataset.speak); }
  });
  function speakBtn(text) { return `<button class="icon-btn" data-speak="${esc(text)}" title="發音">🔊</button>`; }
  function exampleHTML(w) {
    if (!w.ex) return "";
    return `<div class="example"><div class="row"><div style="flex:1">${esc(w.ex)}</div>${speakBtn(w.ex)}</div>${w.exZh ? `<div class="ex-zh">${esc(w.exZh)}</div>` : ""}</div>`;
  }
  function tagsHTML(w) {
    return [w.pos, w.level, w.cat].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  }
  function wordDetailHTML(w) {
    const p = getP(w.id);
    return `
      <div class="row"><div class="spacer">${tagsHTML(w)}</div>${favBtn(w)}</div>
      <div class="row" style="margin:6px 0"><div style="font-size:1.8rem;font-weight:700">${fullHTML(w)}</div>${speakBtn(full(w))}</div>
      ${w.plural ? `<div class="muted">複數：die ${esc(w.plural)}</div>` : ""}
      <div style="font-size:1.15rem;margin-top:6px">${esc(w.zh)}</div>
      ${exampleHTML(w)}
      <div class="muted" style="margin-top:12px">${p ? `已複習 ${p.reps} 次・下次：${new Date(p.due).toLocaleDateString()}${p.wrong ? `・答錯 ${p.wrong} 次` : ""}` : "尚未學習"}</div>`;
  }
  function openModal(html) {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal">${html}<button class="btn block" style="margin-top:14px" data-close>關閉</button></div>`;
    bg.addEventListener("click", (e) => { if (e.target === bg || e.target.closest("[data-close]")) bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  }
  function showWord(id) { const w = byId(id); if (w) openModal(wordDetailHTML(w)); }

  // ---------- 今日學習清單 ----------
  function dueList() {
    const now = Date.now();
    return activeVocab().filter((w) => progress[w.id] && progress[w.id].due <= now)
      .sort((a, b) => progress[a.id].due - progress[b.id].due);
  }
  function newList() {
    const learnedToday = todayStats().learned || 0;
    const left = Math.max(0, settings.dailyNew - learnedToday);
    return activeVocab().filter((w) => !progress[w.id]).slice(0, left);
  }
  function wordOfDay() {
    const list = activeVocab(); if (!list.length) return null;
    const d = today(); return list[parseInt(hash("wotd" + d), 36) % list.length];
  }

  // ---------- 頁面 ----------
  let currentTab = "home";
  const views = {};
  function go(tab) {
    currentTab = tab;
    $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    views[tab]();
    window.scrollTo(0, 0);
  }
  $$(".tabbar button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));

  function emptyVocabHTML() {
    return `<div class="card empty"><div class="big">📭</div><p>目前沒有單字。</p>
      <p class="muted">請到「設定 → 匯入單字」貼上你的單字表。</p>
      <button class="btn primary" id="goImport">前往匯入</button></div>`;
  }
  function bindEmpty() { const b = $("#goImport"); if (b) b.onclick = () => go("settings"); }

  // 首頁
  views.home = () => {
    const v = $("#view");
    if (!vocab.length) { v.innerHTML = emptyVocabHTML(); bindEmpty(); return; }
    const all = activeVocab();
    const learned = all.filter((w) => progress[w.id]).length;
    const known = all.filter((w) => isKnown(progress[w.id])).length;
    const ts = todayStats();
    const due = dueList().length, nw = newList().length;
    const goal = settings.dailyNew;
    const pct = Math.min(100, Math.round(((ts.learned || 0) / Math.max(1, goal)) * 100));
    const w = wordOfDay();
    v.innerHTML = `
      ${w ? `<div class="card wotd">
        <div class="row"><h2 class="spacer" style="margin:0">☀️ 今日單字</h2>${favBtn(w)}</div>
        <div class="row"><div class="de">${fullHTML(w)}</div>${speakBtn(full(w))}</div>
        <div>${tagsHTML(w)}</div>
        <div class="zh" style="margin-top:6px">${esc(w.zh)}</div>
        ${w.plural ? `<div class="muted">複數：die ${esc(w.plural)}</div>` : ""}
        ${exampleHTML(w)}
      </div>` : ""}
      <div class="card">
        <h2>📅 今日目標</h2>
        <div class="row"><span>新單字 ${ts.learned || 0} / ${goal}</span><span class="spacer"></span><span class="muted">${pct}%</span></div>
        <div class="progress" style="margin:8px 0 14px"><div style="width:${pct}%"></div></div>
        <div class="row">
          <button class="btn primary spacer" id="startLearn" ${due + nw ? "" : "disabled"}>開始學習（複習 ${due}・新字 ${nw}）</button>
        </div>
        ${due + nw ? "" : `<p class="muted" style="margin-bottom:0">今天的任務完成了 🎉 可以去做測驗，或到設定提高每日新字數量。</p>`}
      </div>
      <div class="card">
        <h2>📈 學習進度</h2>
        <div class="stats">
          <div class="stat"><b>${all.length}</b><span>單字總數</span></div>
          <div class="stat"><b>${learned}</b><span>已學過</span></div>
          <div class="stat"><b>${known}</b><span>已熟記</span></div>
        </div>
        <div class="progress" style="margin-top:12px"><div style="width:${all.length ? (learned / all.length) * 100 : 0}%"></div></div>
        <div class="stats" style="margin-top:14px">
          <div class="stat"><b>${ts.reviewed || 0}</b><span>今日複習</span></div>
          <div class="stat"><b>${ts.quiz || 0}</b><span>今日測驗題</span></div>
          <div class="stat"><b>${ts.quiz ? Math.round((ts.correct / ts.quiz) * 100) + "%" : "—"}</b><span>測驗正確率</span></div>
        </div>
        ${weekChart()}
      </div>`;
    $("#startLearn").onclick = () => go("learn");
  };
  function weekChart() {
    const d = new Date(); const cols = [];
    for (let i = 6; i >= 0; i--) {
      const x = new Date(d); x.setDate(d.getDate() - i);
      const s = stats.days[dateKey(x)] || {};
      cols.push({ label: "日一二三四五六"[x.getDay()], n: (s.learned || 0) + (s.reviewed || 0) });
    }
    const max = Math.max(1, ...cols.map((c) => c.n));
    return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:90px;margin-top:16px">
      ${cols.map((c) => `<div style="text-align:center;font-size:.7rem" class="muted">
        <div style="height:${Math.round((c.n / max) * 60)}px;background:var(--accent);border-radius:4px 4px 0 0;opacity:${c.n ? 1 : .15};min-height:3px"></div>
        <div>${c.n || ""}</div><div>${c.label}</div></div>`).join("")}
    </div>`;
  }

  // 單字卡（複習 + 新字）
  let session = null;
  views.learn = () => {
    const v = $("#view");
    if (!vocab.length) { v.innerHTML = emptyVocabHTML(); bindEmpty(); return; }
    if (!session || !session.queue.length) {
      const queue = [...dueList().map((w) => w.id), ...newList().map((w) => w.id)];
      session = { queue, done: 0, total: queue.length, flipped: false, reverse: false };
    }
    renderCard();
  };
  function renderCard() {
    const v = $("#view");
    if (!session.queue.length) {
      const extra = activeVocab().filter((w) => !progress[w.id]).length;
      v.innerHTML = `<div class="card empty"><div class="big">🎉</div>
        <p><b>${session.total ? "本輪完成！" : "目前沒有需要複習的單字"}</b></p>
        <p class="muted">${session.total ? `共練習 ${session.done} 張卡片。` : ""}</p>
        <div class="row" style="justify-content:center">
          ${extra ? `<button class="btn primary" id="moreNew">再學 ${Math.min(settings.dailyNew, extra)} 個新字</button>` : ""}
          <button class="btn" id="toQuiz">去做測驗</button>
        </div></div>`;
      const m = $("#moreNew");
      if (m) m.onclick = () => {
        const ids = activeVocab().filter((w) => !progress[w.id]).slice(0, settings.dailyNew).map((w) => w.id);
        session = { queue: ids, done: 0, total: ids.length, flipped: false, reverse: session.reverse };
        renderCard();
      };
      $("#toQuiz").onclick = () => go("quiz");
      return;
    }
    const w = byId(session.queue[0]);
    if (!w) { session.queue.shift(); return renderCard(); }
    const p = getP(w.id);
    const isNew = !p;
    const front = session.reverse
      ? `<div class="zh" style="font-size:1.6rem">${esc(w.zh)}</div>`
      : `<div class="de">${fullHTML(w)}</div>`;
    v.innerHTML = `
      <div class="row" style="margin-bottom:10px">
        <span class="muted">${isNew ? "🆕 新單字" : "🔁 複習"}・剩 ${session.queue.length}</span>
        <span class="spacer"></span>
        <button class="btn small" id="flipMode">${session.reverse ? "中 → 德" : "德 → 中"}</button>
      </div>
      <div class="progress" style="margin-bottom:12px"><div style="width:${session.total ? (session.done / (session.done + session.queue.length)) * 100 : 0}%"></div></div>
      <div class="card flash" id="flash">
        ${session.flipped ? `<div class="back">${wordDetailHTML(w)}</div>` : `${front}<div class="hint muted">點一下翻面</div>`}
      </div>
      ${session.flipped ? `<div class="rate">
        <button class="btn r-again" data-g="0">忘記<small>${intervalLabel(w.id, 0)}</small></button>
        <button class="btn" data-g="1">困難<small>${intervalLabel(w.id, 1)}</small></button>
        <button class="btn r-good" data-g="2">記得<small>${intervalLabel(w.id, 2)}</small></button>
        <button class="btn" data-g="3">簡單<small>${intervalLabel(w.id, 3)}</small></button>
      </div>` : `<button class="btn primary block" id="showAns">顯示答案</button>`}`;
    const flip = () => { if (!session.flipped) { session.flipped = true; renderCard(); if (settings.autoSpeak) speak(full(w)); } };
    $("#flash").onclick = (e) => { if (!e.target.closest("button")) flip(); };
    const sa = $("#showAns"); if (sa) sa.onclick = flip;
    $("#flipMode").onclick = () => { session.reverse = !session.reverse; session.flipped = false; renderCard(); };
    $$("[data-g]").forEach((b) => (b.onclick = () => {
      const g = +b.dataset.g;
      schedule(w.id, g);
      session.queue.shift();
      if (g === 0) session.queue.splice(Math.min(3, session.queue.length), 0, w.id); // 稍後再出現
      else session.done++;
      session.flipped = false;
      renderCard();
    }));
    if (!session.flipped && !session.reverse && settings.autoSpeak) speak(full(w));
  }

  // 測驗
  const QUIZ_MODES = [
    { id: "de2zh", ico: "🇩🇪", name: "看德文選中文", desc: "四選一" },
    { id: "zh2de", ico: "🀄", name: "看中文選德文", desc: "四選一" },
    { id: "listen", ico: "🎧", name: "聽力測驗", desc: "聽發音選意思" },
    { id: "spell", ico: "⌨️", name: "拼字測驗", desc: "看中文拼出德文" },
    { id: "article", ico: "🎯", name: "冠詞測驗", desc: "der / die / das" },
  ];
  const QUIZ_SOURCES = [
    { id: "learned", name: "已學過的字" },
    { id: "all", name: "全部單字" },
    { id: "fav", name: "我的收藏" },
    { id: "wrong", name: "常錯單字" },
  ];
  let quiz = null;
  let quizSource = "learned";
  views.quiz = () => {
    const v = $("#view");
    if (!vocab.length) { v.innerHTML = emptyVocabHTML(); bindEmpty(); return; }
    quiz = null;
    v.innerHTML = `
      <div class="card"><h2>題目範圍</h2>
        <div class="chips">${QUIZ_SOURCES.map((s) => `<button class="chip ${s.id === quizSource ? "active" : ""}" data-src="${s.id}">${s.name}（${quizPool(s.id).length}）</button>`).join("")}</div>
      </div>
      <div class="mode-list">${QUIZ_MODES.map((m) => `
        <button class="card btn mode" data-mode="${m.id}" style="margin:0">
          <span class="ico">${m.ico}</span><span><b>${m.name}</b><span class="muted">${m.desc}</span></span>
        </button>`).join("")}</div>`;
    $$("[data-src]").forEach((b) => (b.onclick = () => { quizSource = b.dataset.src; views.quiz(); }));
    $$("[data-mode]").forEach((b) => (b.onclick = () => startQuiz(b.dataset.mode)));
  };
  function quizPool(src) {
    const all = activeVocab();
    if (src === "learned") return all.filter((w) => progress[w.id]);
    if (src === "fav") return vocab.filter((w) => favs.has(w.id));
    if (src === "wrong") return vocab.filter((w) => (progress[w.id]?.wrong || 0) > 0)
      .sort((a, b) => progress[b.id].wrong - progress[a.id].wrong);
    return all;
  }
  function startQuiz(mode) {
    let pool = quizPool(quizSource);
    if (mode === "article") pool = pool.filter((w) => w.article);
    if (!pool.length) {
      toast(mode === "article" ? "此範圍內沒有帶冠詞的名詞" : quizSource === "learned" ? "還沒有學過的字，先去單字卡學習或改選「全部單字」" : "此範圍內沒有單字");
      return;
    }
    if (["de2zh", "zh2de", "listen"].includes(mode) && vocab.length < 4) { toast("單字至少要 4 個才能出選擇題"); return; }
    const items = (quizSource === "wrong" ? pool : shuffle(pool)).slice(0, settings.quizLength);
    quiz = { mode, items: shuffle(items), i: 0, score: 0, wrong: [], answered: false };
    renderQuestion();
  }
  function distractors(w, key) {
    const same = vocab.filter((x) => x.id !== w.id && x[key] !== w[key]);
    const pref = same.filter((x) => x.pos && x.pos === w.pos);
    const pick = shuffle(pref.length >= 3 ? pref : same).slice(0, 3);
    return shuffle([w, ...pick]);
  }
  function recordAnswer(w, ok) {
    const p = progress[w.id];
    if (p) { ok ? p.correct = (p.correct || 0) + 1 : p.wrong = (p.wrong || 0) + 1; }
    else if (!ok) progress[w.id] = { reps: 0, ease: 2.5, interval: 0, due: Date.now(), lapses: 0, seen: Date.now(), wrong: 1, correct: 0 };
    save(KEY.progress, progress);
    bump("quiz"); if (ok) bump("correct");
    if (ok) quiz.score++; else quiz.wrong.push(w.id);
  }
  function renderQuestion() {
    const v = $("#view");
    if (quiz.i >= quiz.items.length) return renderQuizResult();
    const w = quiz.items[quiz.i];
    const head = `<div class="row" style="margin-bottom:10px">
        <button class="btn small" id="quitQuiz">✕ 結束</button><span class="spacer"></span>
        <span class="muted">${quiz.i + 1} / ${quiz.items.length}・答對 ${quiz.score}</span></div>
      <div class="progress" style="margin-bottom:14px"><div style="width:${(quiz.i / quiz.items.length) * 100}%"></div></div>`;
    let body = "";
    const m = quiz.mode;
    if (m === "de2zh" || m === "listen") {
      const opts = distractors(w, "zh");
      body = `<div class="card">
        ${m === "listen"
          ? `<div style="text-align:center"><button class="btn primary" id="replay" style="font-size:1.5rem;padding:16px 26px">🔊</button><p class="muted">點擊再聽一次</p></div>`
          : `<div class="q-prompt">${fullHTML(w)} ${speakBtn(full(w))}</div>`}
        <div class="options">${opts.map((o) => `<button class="option" data-ans="${o.id}">${esc(o.zh)}</button>`).join("")}</div>
        <div id="fb"></div></div>`;
    } else if (m === "zh2de") {
      const opts = distractors(w, "de");
      body = `<div class="card"><div class="q-prompt">${esc(w.zh)}</div>
        <div class="options">${opts.map((o) => `<button class="option" data-ans="${o.id}">${fullHTML(o)}</button>`).join("")}</div>
        <div id="fb"></div></div>`;
    } else if (m === "spell") {
      body = `<div class="card"><div class="q-prompt">${esc(w.zh)}</div>
        ${w.article ? `<p class="muted" style="text-align:center">名詞，請連冠詞一起輸入（例：der Tisch）</p>` : ""}
        <input type="text" id="spellIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="輸入德文…">
        <div class="umlauts">${["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"].map((c) => `<button class="btn" data-ch="${c}">${c}</button>`).join("")}</div>
        <div class="row"><button class="btn" id="hint">提示</button><span class="spacer"></span><button class="btn primary" id="check">確認</button></div>
        <div id="fb"></div></div>`;
    } else if (m === "article") {
      body = `<div class="card"><div class="q-prompt">___ ${esc(w.de)}</div><p class="muted" style="text-align:center">${esc(w.zh)}</p>
        <div class="articles">${["der", "die", "das"].map((a) => `<button class="option art-${a}" data-art="${a}">${a}</button>`).join("")}</div>
        <div id="fb"></div></div>`;
    }
    v.innerHTML = head + body;
    $("#quitQuiz").onclick = () => (quiz.i ? renderQuizResult() : views.quiz());
    quiz.answered = false;

    const next = (ok, extra = "") => {
      quiz.answered = true;
      recordAnswer(w, ok);
      $("#fb").innerHTML = `<div class="feedback ${ok ? "ok" : "no"}">
          ${ok ? "✅ 答對了！" : "❌ 答錯了"}　<b>${fullHTML(w)}</b> — ${esc(w.zh)} ${speakBtn(full(w))}${extra}
          ${w.ex ? `<div class="muted" style="margin-top:6px">${esc(w.ex)}${w.exZh ? `<br>${esc(w.exZh)}` : ""}</div>` : ""}
        </div><button class="btn primary block" style="margin-top:10px" id="nextQ">${quiz.i + 1 < quiz.items.length ? "下一題" : "看結果"}</button>`;
      if (settings.autoSpeak && m !== "listen") speak(full(w));
      $("#nextQ").onclick = () => { quiz.i++; renderQuestion(); };
      $("#nextQ").focus();
    };

    if (m === "listen") {
      const play = () => speak(full(w));
      $("#replay").onclick = play; setTimeout(play, 250);
    }
    $$("[data-ans]").forEach((b) => (b.onclick = () => {
      if (quiz.answered) return;
      const ok = b.dataset.ans === w.id;
      $$("[data-ans]").forEach((x) => { if (x.dataset.ans === w.id) x.classList.add("correct"); });
      if (!ok) b.classList.add("wrong");
      next(ok);
    }));
    $$("[data-art]").forEach((b) => (b.onclick = () => {
      if (quiz.answered) return;
      const ok = b.dataset.art === w.article;
      $$("[data-art]").forEach((x) => { if (x.dataset.art === w.article) x.classList.add("correct"); });
      if (!ok) b.classList.add("wrong");
      next(ok);
    }));
    if (m === "spell") {
      const inp = $("#spellIn"); inp.focus();
      $$("[data-ch]").forEach((b) => (b.onclick = () => {
        const s = inp.selectionStart ?? inp.value.length;
        inp.value = inp.value.slice(0, s) + b.dataset.ch + inp.value.slice(inp.selectionEnd ?? s);
        inp.focus(); inp.setSelectionRange(s + 1, s + 1);
      }));
      let hintN = 0;
      $("#hint").onclick = () => { hintN++; inp.value = full(w).slice(0, hintN); inp.focus(); };
      const check = () => {
        if (quiz.answered) return;
        const clean = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
        const alt = (s) => clean(s).replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
        const given = inp.value;
        const targets = [full(w), w.de];
        const exact = targets.some((t) => clean(t) === clean(given)) && (!w.article || clean(given).startsWith(w.article + " "));
        const loose = !exact && targets.some((t) => alt(t) === alt(given));
        const ok = exact || (loose && (!w.article || clean(given).startsWith(w.article + " ")));
        inp.disabled = true;
        next(ok, ok && loose ? `<div class="muted">（變音字母建議用 ä ö ü ß 書寫）</div>` : (!ok && given.trim() ? `<div class="muted">你的答案：${esc(given)}</div>` : ""));
      };
      $("#check").onclick = check;
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); quiz.answered ? $("#nextQ")?.click() : check(); } });
    }
  }
  function renderQuizResult() {
    const total = quiz.i >= quiz.items.length ? quiz.items.length : quiz.i;
    const pct = total ? Math.round((quiz.score / total) * 100) : 0;
    const wrong = [...new Set(quiz.wrong)].map(byId).filter(Boolean);
    $("#view").innerHTML = `
      <div class="card empty"><div class="big">${pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "💪"}</div>
        <p style="font-size:1.4rem;margin:6px 0"><b>${quiz.score} / ${total}</b></p><p class="muted">正確率 ${pct}%</p>
        <div class="row" style="justify-content:center">
          <button class="btn primary" id="again">再測一次</button>
          ${wrong.length ? `<button class="btn" id="retryWrong">只練錯的字</button>` : ""}
          <button class="btn" id="back">選擇其他測驗</button>
        </div></div>
      ${wrong.length ? `<div class="card"><h2>答錯的單字</h2>${wrong.map(rowHTML).join("")}</div>` : ""}`;
    const mode = quiz.mode;
    $("#again").onclick = () => startQuiz(mode);
    $("#back").onclick = () => views.quiz();
    const rw = $("#retryWrong");
    if (rw) rw.onclick = () => { quiz = { mode, items: shuffle(wrong), i: 0, score: 0, wrong: [], answered: false }; renderQuestion(); };
    bindRows();
  }

  // 單字庫
  let libFilter = "all", libQuery = "";
  function rowHTML(w) {
    const p = getP(w.id);
    const cls = !p ? "" : isKnown(p) ? "known" : "learning";
    return `<div class="word-row" data-word="${w.id}">
      <span class="dot ${cls}"></span>
      <div class="main"><div class="de">${fullHTML(w)}${w.plural ? ` <span class="muted" style="font-weight:400">(${esc(w.plural)})</span>` : ""}</div><div class="zh">${esc(w.zh)}</div></div>
      ${speakBtn(full(w))}${favBtn(w)}</div>`;
  }
  function bindRows() { $$("[data-word]").forEach((r) => (r.onclick = () => showWord(r.dataset.word))); }
  views.library = () => {
    const v = $("#view");
    if (!vocab.length) { v.innerHTML = emptyVocabHTML(); bindEmpty(); return; }
    const filters = [["all", "全部"], ["new", "未學"], ["learning", "學習中"], ["known", "已熟記"], ["fav", "★ 收藏"], ["wrong", "常錯"]];
    v.innerHTML = `
      <input type="search" id="q" placeholder="搜尋德文或中文…" value="${esc(libQuery)}" style="margin-bottom:10px">
      <div class="chips" style="margin-bottom:10px">${filters.map(([k, n]) => `<button class="chip ${k === libFilter ? "active" : ""}" data-f="${k}">${n}</button>`).join("")}</div>
      <div class="card" id="list" style="padding-top:4px;padding-bottom:4px"></div>`;
    const renderList = () => {
      const q = libQuery.trim().toLowerCase();
      let list = vocab.filter((w) => {
        const p = getP(w.id);
        if (libFilter === "new" && p) return false;
        if (libFilter === "learning" && (!p || isKnown(p))) return false;
        if (libFilter === "known" && !isKnown(p)) return false;
        if (libFilter === "fav" && !favs.has(w.id)) return false;
        if (libFilter === "wrong" && !(p && p.wrong)) return false;
        if (q && !(`${full(w)} ${w.zh} ${w.cat} ${w.plural}`.toLowerCase().includes(q))) return false;
        return true;
      });
      const shown = list.slice(0, 300);
      $("#list").innerHTML = list.length
        ? `<p class="muted">${list.length} 個單字${list.length > shown.length ? `（顯示前 ${shown.length} 個，請用搜尋縮小範圍）` : ""}</p>${shown.map(rowHTML).join("")}`
        : `<p class="muted empty">沒有符合的單字</p>`;
      bindRows();
    };
    $("#q").oninput = (e) => { libQuery = e.target.value; renderList(); };
    $$("[data-f]").forEach((b) => (b.onclick = () => { libFilter = b.dataset.f; views.library(); }));
    renderList();
  };

  // 設定 / 匯入
  views.settings = () => {
    const v = $("#view");
    const cats = [...new Set(vocab.map((w) => w.cat).filter(Boolean))];
    const levels = [...new Set(vocab.map((w) => w.level).filter(Boolean))].sort();
    v.innerHTML = `
      <div class="card"><h2>📥 匯入單字</h2>
        <p class="muted">從 Excel / Google 試算表直接複製貼上，或上傳 CSV、TSV、JSON 檔。第一列可放標題，
        支援的標題：<code>德文</code> <code>中文</code> <code>冠詞</code> <code>複數</code> <code>詞性</code> <code>例句</code> <code>例句翻譯</code> <code>程度</code> <code>分類</code>。
        沒有標題時，欄位順序視為：德文、中文、例句、例句翻譯。名詞可直接寫成 <code>der Tisch</code>，會自動拆出冠詞。</p>
        <textarea id="importText" placeholder="德文	中文	例句	例句翻譯
der Apfel	蘋果	Ich esse einen Apfel.	我吃一顆蘋果。
gehen	走；去	Wir gehen nach Hause.	我們回家。"></textarea>
        <div class="row" style="margin-top:10px">
          <label class="btn">📄 選擇檔案<input type="file" id="importFile" accept=".csv,.tsv,.txt,.json" hidden></label>
          <span class="spacer"></span>
          <button class="btn" id="importAppend">加入現有單字</button>
          <button class="btn primary" id="importReplace">取代全部</button>
        </div>
        <p class="muted" id="importPreview"></p>
      </div>

      <div class="card"><h2>🎯 學習設定</h2>
        <label class="field"><span>每日新單字數</span><input type="number" min="1" max="200" id="sDaily" value="${settings.dailyNew}"></label>
        <label class="field"><span>每次測驗題數</span><input type="number" min="3" max="100" id="sQuiz" value="${settings.quizLength}"></label>
        <label class="field"><span>語速（${settings.rate}）</span><input type="range" min="0.5" max="1.3" step="0.1" id="sRate" value="${settings.rate}" style="width:100%"></label>
        <label class="row" style="margin-bottom:12px"><input type="checkbox" id="sAuto" ${settings.autoSpeak ? "checked" : ""}> 自動播放發音</label>
        ${cats.length ? `<label class="field"><span>只學這個分類</span><select id="sCat"><option value="">全部分類</option>${cats.map((c) => `<option ${c === settings.filterCat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>` : ""}
        ${levels.length ? `<label class="field"><span>只學這個程度</span><select id="sLevel"><option value="">全部程度</option>${levels.map((c) => `<option ${c === settings.filterLevel ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>` : ""}
        <button class="btn small" id="testVoice">🔊 測試發音</button>
      </div>

      <div class="card"><h2>💾 資料</h2>
        <p class="muted">目前共有 ${vocab.length} 個單字。學習紀錄只存在這台裝置的瀏覽器中，換裝置前請先匯出備份。</p>
        <div class="row">
          <button class="btn" id="exportCsv">匯出單字表 (CSV)</button>
          <button class="btn" id="exportBackup">備份學習紀錄</button>
          <label class="btn">還原備份<input type="file" id="restore" accept=".json" hidden></label>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="resetProgress">重設學習進度</button>
          <button class="btn" id="resetVocab">還原預設單字表</button>
        </div>
      </div>
      <p class="muted" style="text-align:center">每日德語・參考 Daily Deutsch 的功能設計</p>`;

    const ta = $("#importText");
    const preview = () => {
      try {
        const words = normalizeList(parseImport(ta.value));
        $("#importPreview").textContent = ta.value.trim() ? `可匯入 ${words.length} 個單字${words[0] ? `，例如：${full(words[0])} — ${words[0].zh}` : ""}` : "";
        return words;
      } catch (e) { $("#importPreview").textContent = "格式無法辨識：" + e.message; return []; }
    };
    ta.oninput = preview;
    $("#importFile").onchange = async (e) => { const f = e.target.files[0]; if (f) { ta.value = await f.text(); preview(); } };
    const doImport = (replace) => {
      const words = preview();
      if (!words.length) { toast("沒有可匯入的單字"); return; }
      if (replace && !confirm(`用 ${words.length} 個單字取代目前的 ${vocab.length} 個？（學習進度會保留給相同的單字）`)) return;
      if (replace) vocab = words;
      else { const ids = new Set(vocab.map((w) => w.id)); vocab = vocab.concat(words.filter((w) => !ids.has(w.id))); }
      save(KEY.vocab, vocab); session = null;
      toast(`已匯入，現在共有 ${vocab.length} 個單字`);
      views.settings();
    };
    $("#importAppend").onclick = () => doImport(false);
    $("#importReplace").onclick = () => doImport(true);

    const num = (el, min, max, def) => Math.min(max, Math.max(min, parseInt(el.value, 10) || def));
    $("#sDaily").onchange = (e) => { settings.dailyNew = num(e.target, 1, 200, 10); save(KEY.settings, settings); session = null; };
    $("#sQuiz").onchange = (e) => { settings.quizLength = num(e.target, 3, 100, 10); save(KEY.settings, settings); };
    $("#sRate").oninput = (e) => { settings.rate = +e.target.value; e.target.previousElementSibling.textContent = `語速（${settings.rate}）`; save(KEY.settings, settings); };
    $("#sAuto").onchange = (e) => { settings.autoSpeak = e.target.checked; save(KEY.settings, settings); };
    const sc = $("#sCat"); if (sc) sc.onchange = (e) => { settings.filterCat = e.target.value; save(KEY.settings, settings); session = null; };
    const sl = $("#sLevel"); if (sl) sl.onchange = (e) => { settings.filterLevel = e.target.value; save(KEY.settings, settings); session = null; };
    $("#testVoice").onclick = () => speak("Guten Morgen! Wie geht es dir?");

    const download = async (name, text, type) => {
      // iPhone：用分享選單存到「檔案」App 比較方便
      try {
        const file = new File([text], name, { type });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
          await navigator.share({ files: [file], title: name }); return;
        }
      } catch (e) { if (e && e.name === "AbortError") return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("#exportCsv").onclick = () => {
      const cols = ["de", "zh", "article", "plural", "pos", "ex", "exZh", "level", "cat"];
      const head = ["德文", "中文", "冠詞", "複數", "詞性", "例句", "例句翻譯", "程度", "分類"];
      const q = (s) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      const csv = "﻿" + [head.join(","), ...vocab.map((w) => cols.map((c) => q(w[c] || "")).join(","))].join("\n");
      download("german-vocab.csv", csv, "text/csv");
    };
    $("#exportBackup").onclick = () => download(`german-study-backup-${today()}.json`,
      JSON.stringify({ app: "german-study-app", version: 1, vocab, progress, stats, favs: [...favs], settings }, null, 1), "application/json");
    $("#restore").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (d.vocab) { vocab = normalizeList(d.vocab); save(KEY.vocab, vocab); }
        if (d.progress) { progress = d.progress; save(KEY.progress, progress); }
        if (d.stats) { stats = Object.assign({ days: {} }, d.stats); save(KEY.stats, stats); }
        if (d.favs) { favs = new Set(d.favs); save(KEY.favs, [...favs]); }
        if (d.settings) { Object.assign(settings, d.settings); save(KEY.settings, settings); }
        session = null; renderStreak(); toast("已還原備份"); views.settings();
      } catch { toast("備份檔格式錯誤"); }
    };
    $("#resetProgress").onclick = () => {
      if (!confirm("確定要清除所有學習進度、統計與收藏？")) return;
      progress = {}; stats = { days: {} }; favs = new Set();
      save(KEY.progress, progress); save(KEY.stats, stats); save(KEY.favs, []);
      session = null; renderStreak(); toast("已重設");
    };
    $("#resetVocab").onclick = () => {
      if (!confirm("確定要還原成預設單字表（data/vocab.js）？你匯入的單字會被移除。")) return;
      localStorage.removeItem(KEY.vocab);
      vocab = normalizeList(window.DEFAULT_VOCAB || []);
      session = null; toast("已還原預設單字表"); views.settings();
    };
  };

  // 鍵盤快捷鍵（電腦版）：空白鍵翻卡、1-4 評分
  document.addEventListener("keydown", (e) => {
    if (currentTab !== "learn" || !session || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === " ") { e.preventDefault(); $("#showAns")?.click(); }
    if (session.flipped && /^[1-4]$/.test(e.key)) $(`[data-g="${+e.key - 1}"]`)?.click();
  });

  // 初始化
  renderStreak();
  go("home");
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // 方便除錯 / 測試
  window.GSA = { parseImport, normalizeList, get vocab() { return vocab; } };
})();
