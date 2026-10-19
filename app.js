(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const CFG = window.SAT_CONFIG || {};
  const LS = { words: "satw.words.v1", set: "satw.filter", key: "satw.key" };
  const SS = { key: "satw.key.session" };
  const POS = ["n", "v", "adj", "adv", "phr"];

  // ---------- storage (this browser only) ----------
  const store = {
    get(k, area) { try { return (area || localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, area) { try { (area || localStorage).setItem(k, v); return true; } catch (e) { return false; } },
    del(k, area) { try { (area || localStorage).removeItem(k); } catch (e) {} },
  };
  let words = null;           // null = not started yet
  let storageOk = true;
  function loadWords() {
    const raw = store.get(LS.words);
    if (!raw) return null;
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter(validWord) : null; } catch (e) { return null; }
  }
  function saveWords() {
    storageOk = store.set(LS.words, JSON.stringify(words));
    if (!storageOk) showWarn("This browser isn't saving your changes (private window or storage turned off). Use Settings → Download my list before you leave.");
  }
  function validWord(w) { return w && typeof w === "object" && typeof w.word === "string" && w.word.trim() && typeof w.id === "string"; }
  function cleanWord(w) {
    return {
      id: String(w.id), word: String(w.word).trim(), pron: String(w.pron || ""), pos: POS.includes(w.pos) ? w.pos : "n",
      def: String(w.def || ""), examples: Array.isArray(w.examples) ? w.examples.map(String).filter(Boolean) : [],
      note: String(w.note || ""), pronFlag: !!w.pronFlag, set: w.set === "ws" ? "ws" : undefined, added: String(w.added || new Date().toISOString()),
    };
  }
  function showWarn(msg) {
    let el = document.querySelector(".warn");
    if (!el) { el = document.createElement("div"); el.className = "warn"; el.setAttribute("role", "alert"); $("list").before(el); }
    el.textContent = msg;
  }

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const md = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const slug = (w) => w.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "word";
  const shortDef = (d) => String(d || "").split(";")[0].trim();
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(arr, seed) {
    const a = arr.slice(); let s = seed || 1;
    for (let i = a.length - 1; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.length > 1 && a.every((x, i) => x === arr[i])) a.push(a.shift());
    return a;
  }

  // ---------- state ----------
  let editingId = null, query = "", pendingDelete = null, setFilter = store.get(LS.set) || "all";
  const quizState = new Map(), quizGroups = new Map();
  let sel = null;
  const SVGNS = "http://www.w3.org/2000/svg";
  const st = (key) => { if (!quizState.has(key)) quizState.set(key, { pairs: {}, revealed: false }); return quizState.get(key); };

  // ---------- entries ----------
  function entryHTML(w) {
    const ex = (w.examples || []).filter(Boolean);
    const notes = String(w.note || "").split(/\n+/).map((t) => t.trim()).filter(Boolean);
    let h = '<article class="entry" id="w-' + esc(w.id) + '">';
    h += '<p class="head"><span class="hw">' + esc(w.word) + "</span>";
    if (w.pron) h += ' <span class="pron">(' + esc(w.pron) + ")</span>";
    h += '<span class="pos">' + esc(w.pos || "") + '</span><span class="def">' + md(w.def) + "</span></p>";
    if (ex.length) h += '<ul class="ex">' + ex.map((e) => "<li>" + md(e) + "</li>").join("") + "</ul>";
    notes.forEach((n) => { h += "<p>" + md(n) + "</p>"; });
    h += '<div class="ops">';
    if (pendingDelete === w.id) h += '<span>Delete this word?</span><button type="button" class="del-yes" data-del-yes="' + esc(w.id) + '">Delete</button><button type="button" data-del-no>Keep</button>';
    else h += '<button type="button" data-edit="' + esc(w.id) + '">Edit</button><button type="button" data-del="' + esc(w.id) + '">Delete</button>';
    h += "</div></article>";
    if (w.pronFlag) h += '<div class="callout">Note carefully the pronunciation of this word.</div>';
    return h;
  }

  // ---------- quizzes ----------
  function quizKey(group) { return "q" + hash(group.map((w) => w.id + ":" + shortDef(w.def)).join("|")).toString(36); }
  function quizHTML(group, n) {
    const key = quizKey(group);
    quizGroups.set(key, { group, n });
    const s = st(key);
    const defs = shuffled(group.map((w) => w.id), hash(group.map((w) => w.id).join("|")));
    const letter = (i) => String.fromCharCode(97 + i);
    const matched = Object.keys(s.pairs).length;
    const correct = group.filter((w) => s.pairs[w.id] === w.id).length;
    let h = '<section class="quiz" data-key="' + key + '" aria-label="Quick Quiz ' + n + '"><div class="quiz-bar">Quick Quiz #' + n + "</div>";
    h += '<p>Match each word in the first column with its definition in the second column. Click a word, then click its definition to draw a line. <button type="button" data-check="' + key + '">' + (s.revealed ? "Hide the answers." : "Check your answers here.") + "</button></p>";
    h += '<div class="quiz-cols" data-key="' + key + '"><svg class="lines" aria-hidden="true"></svg><ol>';
    group.forEach((w, i) => {
      const isSel = sel && sel.key === key && sel.side === "w" && sel.id === w.id;
      let mark = "";
      if (s.revealed) mark = s.pairs[w.id] === w.id ? '<span class="mark ok">&#10003;</span>' : '<span class="mark no">&#10007;</span>';
      h += '<li data-w="' + esc(w.id) + '"' + (isSel ? ' class="sel"' : "") + '><span class="n">' + (i + 1) + '.</span><span><span class="wt">' + esc(w.word.toLowerCase()) + "</span>" + mark + "</span></li>";
    });
    h += "</ol><ol>";
    defs.forEach((id, i) => {
      const w = group.find((x) => x.id === id);
      const isSel = sel && sel.key === key && sel.side === "d" && sel.id === id;
      h += '<li data-d="' + esc(id) + '"' + (isSel ? ' class="sel"' : "") + '><span class="n letter">' + letter(i) + '.</span><span class="dt">' + md(shortDef(w.def)) + "</span></li>";
    });
    h += '</ol></div><div class="quiz-foot">';
    if (s.revealed) h += '<span class="score">' + correct + " of " + group.length + ' correct</span><span class="legend">Black line: your match. <b class="red">Red line</b>: the correct answer.</span>';
    else h += '<span class="legend">' + matched + " of " + group.length + " matched</span>";
    if (matched) h += '<button type="button" data-clear="' + key + '">Clear my lines</button>';
    h += "</div></section>";
    return h;
  }
  function refreshQuiz(key) {
    const g = quizGroups.get(key), el = document.querySelector('section.quiz[data-key="' + key + '"]');
    if (!g || !el) return;
    el.outerHTML = quizHTML(g.group, g.n);
    drawQuiz(document.querySelector('.quiz-cols[data-key="' + key + '"]'));
  }
  function anchor(colsEl, box, selector, side) {
    const t = colsEl.querySelector(selector); if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: (side === "right" ? r.right + 3 : r.left - 3) - box.left, y: r.top + Math.min(r.height, 22) / 2 - box.top };
  }
  function addLine(svg, a, b, color, width, dash) {
    const l = document.createElementNS(SVGNS, "line");
    l.setAttribute("x1", a.x); l.setAttribute("y1", a.y); l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
    l.setAttribute("stroke", color); l.setAttribute("stroke-width", width); l.setAttribute("stroke-linecap", "round");
    if (dash) l.setAttribute("stroke-dasharray", dash);
    svg.appendChild(l);
  }
  function drawQuiz(colsEl, pointer) {
    if (!colsEl) return;
    const key = colsEl.dataset.key, s = st(key), svg = colsEl.querySelector("svg.lines"), box = colsEl.getBoundingClientRect();
    svg.innerHTML = "";
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#000", red = css.getPropertyValue("--danger").trim() || "#a3141a";
    const wA = (id) => anchor(colsEl, box, '[data-w="' + CSS.escape(id) + '"] > span:last-child', "right");
    const dA = (id) => anchor(colsEl, box, '[data-d="' + CSS.escape(id) + '"] .n', "left");
    Object.entries(s.pairs).forEach(([w, d]) => { const a = wA(w), b = dA(d); if (a && b) addLine(svg, a, b, ink, 2.6); });
    if (s.revealed) { const g = quizGroups.get(key); if (g) g.group.forEach((w) => { const a = wA(w.id), b = dA(w.id); if (a && b) addLine(svg, a, b, red, 1.4); }); }
    if (pointer && sel && sel.key === key) {
      const a = sel.side === "w" ? wA(sel.id) : dA(sel.id);
      if (a) addLine(svg, a, { x: pointer.x - box.left, y: pointer.y - box.top }, ink, 1.5, "4 4");
    }
  }
  const drawAll = () => document.querySelectorAll(".quiz-cols").forEach((c) => drawQuiz(c));
  function pick(key, side, id) {
    const s = st(key);
    if (sel && sel.key === key && sel.side === side && sel.id === id) { sel = null; refreshQuiz(key); return; }
    if (sel && sel.key === key && sel.side !== side) {
      const w = side === "w" ? id : sel.id, d = side === "d" ? id : sel.id;
      Object.keys(s.pairs).forEach((k) => { if (s.pairs[k] === d) delete s.pairs[k]; });
      s.pairs[w] = d; sel = null; refreshQuiz(key); return;
    }
    const prevKey = sel && sel.key;
    sel = { key, side, id };
    if (prevKey && prevKey !== key) refreshQuiz(prevKey);
    refreshQuiz(key);
  }
  document.addEventListener("pointermove", (e) => {
    if (!sel || e.pointerType === "touch") return;
    drawQuiz(document.querySelector('.quiz-cols[data-key="' + sel.key + '"]'), { x: e.clientX, y: e.clientY });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sel) { const k = sel.key; sel = null; refreshQuiz(k); } });
  let rz = 0; window.addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(drawAll); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);

  // ---------- render ----------
  function render() {
    if (!words) return;
    const inSet = (w) => setFilter === "all" || (setFilter === "ws" ? w.set === "ws" : w.set !== "ws");
    const sorted = words.filter(inSet).sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" }));
    const q = query.trim().toLowerCase();
    const shown = q ? sorted.filter((w) => (w.word + " " + w.def + " " + (w.note || "")).toLowerCase().includes(q)) : sorted;
    $("count").textContent = q ? shown.length + " of " + sorted.length + " words" : sorted.length + (sorted.length === 1 ? " word" : " words");
    $("foot").textContent = "SAT Words to Focus · " + words.length + " words · saved in this browser";
    quizGroups.clear();
    if (sel && q) sel = null;
    if (!sorted.length) {
      $("list").innerHTML = '<div class="state"><strong>' + (words.length ? "No words in this view" : "Start your word list") + "</strong>" + (words.length ? "Switch the menu back to All words." : "Use Add a word to put in your first entry.") + "</div>";
      return;
    }
    if (!shown.length) { $("list").innerHTML = '<div class="state"><strong>No matches</strong>No word or definition contains “' + esc(query.trim()) + "”.</div>"; return; }
    let h = "";
    shown.forEach((w, i) => { h += entryHTML(w); if (!q && (i + 1) % 10 === 0) h += quizHTML(shown.slice(i - 9, i + 1), (i + 1) / 10); });
    if (!q && shown.length % 10 >= 4) { const k = Math.ceil(shown.length / 10); h += quizHTML(shown.slice((k - 1) * 10), k); }
    $("list").innerHTML = h;
    if (sel && !quizGroups.has(sel.key)) sel = null;
    for (const k of Array.from(quizState.keys())) if (!quizGroups.has(k)) quizState.delete(k);
    requestAnimationFrame(drawAll);
  }

  // ---------- starting ----------
  async function fetchStarter() {
    const r = await fetch("words.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("starter list not found");
    const a = await r.json();
    return a.filter(validWord).map(cleanWord);
  }
  async function begin(from) {
    $("start").querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      words = from === "mine" ? await fetchStarter() : [];
    } catch (e) {
      $("start").querySelectorAll("button").forEach((b) => (b.disabled = false));
      $("start-count").textContent = "Couldn't load the list. Check your connection and try again.";
      return;
    }
    saveWords();
    showApp();
  }
  function showApp() {
    $("start").hidden = true; $("toolbar").hidden = false;
    $("set").value = setFilter;
    render();
  }
  $("start-mine").addEventListener("click", () => begin("mine"));
  $("start-empty").addEventListener("click", () => begin("empty"));

  // ---------- toolbar ----------
  $("q").addEventListener("input", (e) => { query = e.target.value; render(); });
  $("set").addEventListener("change", (e) => { setFilter = e.target.value; store.set(LS.set, setFilter); render(); });
  $("toggle-form").addEventListener("click", () => openForm(null));
  $("toggle-settings").addEventListener("click", () => { $("settings").hidden = !$("settings").hidden; if (!$("settings").hidden) { refreshKeyStatus(); $("settings").scrollIntoView({ behavior: "smooth", block: "start" }); } });
  $("settings-close").addEventListener("click", () => { $("settings").hidden = true; });

  // ---------- API key (kept in this browser only) ----------
  let apiKey = store.get(LS.key) || store.get(SS.key, sessionStorage) || "";
  $("key-remember").checked = !!store.get(LS.key);
  function refreshKeyStatus(msg, cls) {
    const el = $("key-status");
    el.className = "key-status " + (cls || "");
    if (msg) { el.textContent = msg; return; }
    if (!CFG.RELAY_URL) { el.className = "key-status err"; el.textContent = "The site owner hasn't connected the relay yet, so automatic filling is off."; return; }
    el.textContent = apiKey ? "A key is saved (ending …" + apiKey.slice(-4) + ")" + (store.get(LS.key) ? " and remembered on this device." : " for this tab only.") : "No key saved. Automatic filling is off until you add one.";
    $("key").value = "";
    $("key").placeholder = apiKey ? "•••••••• (saved)" : "nvapi-…";
  }
  $("key-save").addEventListener("click", () => {
    const v = $("key").value.trim();
    if (!v) { refreshKeyStatus("Paste your key first.", "err"); return; }
    if (!/^nvapi-[A-Za-z0-9_\-]{20,}$/.test(v)) { refreshKeyStatus("That doesn't look like an NVIDIA key. Keys start with nvapi-.", "err"); return; }
    apiKey = v;
    store.del(LS.key); store.del(SS.key, sessionStorage);
    if ($("key-remember").checked) store.set(LS.key, v); else store.set(SS.key, v, sessionStorage);
    refreshKeyStatus(); updateFillButton();
    refreshKeyStatus("Key saved. Open Add a word to try it.", "ok");
  });
  $("key-forget").addEventListener("click", () => {
    apiKey = ""; store.del(LS.key); store.del(SS.key, sessionStorage); $("key").value = "";
    refreshKeyStatus("Key removed from this browser.", "ok"); updateFillButton();
  });
  $("key-remember").addEventListener("change", () => {
    if (!apiKey) return;
    if ($("key-remember").checked) { store.set(LS.key, apiKey); store.del(SS.key, sessionStorage); }
    else { store.del(LS.key); store.set(SS.key, apiKey, sessionStorage); }
    refreshKeyStatus();
  });

  // ---------- list tools ----------
  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(words, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sat-words-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    listStatus("Downloaded " + words.length + " words.", "ok");
  });
  $("import").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const a = JSON.parse(await f.text());
      if (!Array.isArray(a)) throw 0;
      const incoming = a.filter(validWord).map(cleanWord);
      if (!incoming.length) throw 0;
      const byId = new Map(words.map((w) => [w.id, w]));
      incoming.forEach((w) => byId.set(w.id, w));
      words = Array.from(byId.values()); saveWords(); render();
      listStatus("Loaded " + incoming.length + " words. Words with the same name were replaced.", "ok");
    } catch (er) { listStatus("That file isn't a word list from this site.", "err"); }
  });
  let resetArmed = false;
  $("reset").addEventListener("click", () => {
    if (!resetArmed) { resetArmed = true; $("reset").textContent = "Yes, delete my list and start over"; listStatus("This deletes every word saved in this browser. Download your list first if you want to keep it.", "err"); return; }
    store.del(LS.words); words = null; resetArmed = false; $("reset").textContent = "Start over";
    $("settings").hidden = true; $("form").hidden = true; $("toolbar").hidden = true; $("list").innerHTML = "";
    $("start").hidden = false; $("start").querySelectorAll("button").forEach((b) => (b.disabled = false));
    listStatus("");
  });
  function listStatus(m, cls) { $("list-status").textContent = m || ""; $("list-status").className = "key-status " + (cls || ""); }

  // ---------- add / edit form ----------
  const aiFields = ["f-pron", "f-pos", "f-def", "f-ex", "f-note"];
  let fillCtl = null, lastFilledWord = "";
  function updateFillButton() { $("f-fill").textContent = apiKey && CFG.RELAY_URL ? "Fill in the rest" : "Add a key to fill automatically"; }
  function openForm(w) {
    editingId = w ? w.id : null;
    $("form-title").textContent = w ? "Edit " + w.word : "Add a word";
    $("f-word").value = w ? w.word : "";
    $("f-pron").value = w ? w.pron || "" : "";
    $("f-pos").value = w ? w.pos || "n" : "n";
    $("f-flag").checked = !!(w && w.pronFlag);
    $("f-def").value = w ? w.def || "" : "";
    $("f-ex").value = w ? (w.examples || []).join("\n") : "";
    $("f-note").value = w ? w.note || "" : "";
    $("f-msg").textContent = ""; $("f-fill-status").textContent = "";
    lastFilledWord = w ? w.word.toLowerCase() : "";
    aiFields.concat("f-flag").forEach((id) => { delete $(id).dataset.ai; delete $(id).dataset.touched; });
    if (w) { $("f-pos").dataset.touched = "1"; $("f-flag").dataset.touched = "1"; }
    updateFillButton();
    $("form").hidden = false; $("toggle-form").hidden = true;
    $("form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("f-word").focus({ preventScroll: true });
  }
  function closeForm() { $("form").hidden = true; $("toggle-form").hidden = false; editingId = null; if (fillCtl) fillCtl.abort(); $("f-fill-status").textContent = ""; }
  $("f-cancel").addEventListener("click", closeForm);
  ["f-word", "f-def"].forEach((id) => $(id).addEventListener("input", () => { $("f-msg").textContent = ""; }));
  $("f-flag").addEventListener("change", () => { $("f-flag").dataset.touched = "1"; });
  $("f-pos").addEventListener("change", () => { $("f-pos").dataset.touched = "1"; });

  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const word = $("f-word").value.trim(), def = $("f-def").value.trim();
    if (!word) { $("f-msg").textContent = "Enter the word first."; $("f-word").focus(); return; }
    if (!def) { $("f-msg").textContent = "Enter a definition."; $("f-def").focus(); return; }
    let id = editingId;
    if (!id) { id = slug(word); let k = 2; while (words.some((w) => w.id === id)) id = slug(word) + "-" + k++; }
    const prev = words.find((w) => w.id === id);
    const body = cleanWord({
      id, word, def, pron: $("f-pron").value.trim(), pos: $("f-pos").value, pronFlag: $("f-flag").checked,
      examples: $("f-ex").value.split("\n").map((s) => s.trim()).filter(Boolean), note: $("f-note").value.trim(),
      set: prev ? prev.set : undefined, added: prev && prev.added ? prev.added : new Date().toISOString(),
    });
    words = words.filter((w) => w.id !== id).concat(body);
    saveWords(); closeForm(); render();
    setTimeout(() => { const el = document.getElementById("w-" + id); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 80);
  });

  $("list").addEventListener("click", (e) => {
    const li = e.target.closest(".quiz-cols li");
    if (li) { const key = li.closest(".quiz-cols").dataset.key; li.dataset.w ? pick(key, "w", li.dataset.w) : pick(key, "d", li.dataset.d); return; }
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.check) { const s = st(t.dataset.check); s.revealed = !s.revealed; refreshQuiz(t.dataset.check); return; }
    if (t.dataset.clear) { const s = st(t.dataset.clear); s.pairs = {}; s.revealed = false; if (sel && sel.key === t.dataset.clear) sel = null; refreshQuiz(t.dataset.clear); return; }
    if (t.dataset.edit) { openForm(words.find((w) => w.id === t.dataset.edit)); return; }
    if (t.dataset.del) { pendingDelete = t.dataset.del; render(); return; }
    if ("delNo" in t.dataset) { pendingDelete = null; render(); return; }
    if (t.dataset.delYes) { const id = t.dataset.delYes; pendingDelete = null; words = words.filter((w) => w.id !== id); saveWords(); render(); }
  });

  // ---------- automatic filling (visitor's own NVIDIA key, through the relay) ----------
  const isFillable = (id) => { const el = $(id); if (id === "f-pos") return !el.dataset.touched; return !el.value.trim() || el.dataset.ai === el.value; };
  function fillPrompt(word) {
    return [
      "You are writing one entry for a personal SAT vocabulary list laid out like a classic SAT vocabulary book.",
      "Write the entry for: " + JSON.stringify(word),
      "If the input is an inflected form (\"inciting\") use the dictionary form as the headword unless it is a fixed phrase (\"hinge on\", \"attest to\"); keep fixed phrases as given.",
      "Reply with only a JSON object, no other text, with exactly these keys:",
      '{"word": string, "pron": string, "pos": "n"|"v"|"adj"|"adv"|"phr", "def": string, "examples": [string, string], "note": string, "pronFlag": boolean}',
      "Rules:",
      "- word: the headword in lowercase.",
      "- pron: a plain respelling, syllables separated by spaces, the stressed syllable in capitals, no IPA. Example: \"ak wee ES\" for acquiesce, \"in KOH it\" for inchoate.",
      "- pos: the part of speech of the headword in its most common SAT use.",
      "- def: short senses separated by semicolons, lowercase, no final period, the sense most often tested on the SAT first. Example: \"to comply passively; to accept; to agree\".",
      "- examples: two original sentences of 10 to 25 words that make the meaning clear from context, with every form of the headword wrapped in *asterisks*.",
      "- note: 2 to 4 short sentences, separate paragraphs with \\n. Cover its connotation (positive, negative or neutral), common word pairings, and how it differs from one or two near-synonyms or look-alike words; mention related forms. End with the Korean meaning in the form \"Korean: ...\". Wrap words being discussed in *asterisks*.",
      "- pronFlag: true only if the pronunciation is commonly gotten wrong.",
      "Write everything yourself; do not quote any published dictionary or vocabulary book.",
    ].join("\n");
  }
  function parseJSON(text) {
    let t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) t = fence[1];
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) throw { code: "invalid_json" };
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { throw { code: "invalid_json" }; }
  }
  async function askModel(prompt, signal) {
    let r;
    try {
      r = await fetch(CFG.RELAY_URL.replace(/\/+$/, "") + "/v1/chat/completions", {
        method: "POST", signal, credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({
          model: CFG.MODEL, messages: [{ role: "user", content: prompt }],
          temperature: 0.6, top_p: 0.95, max_tokens: 1200, stream: false,
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
    } catch (e) { if (signal.aborted) throw { code: "cancelled" }; throw { code: "network" }; }
    if (r.status === 401 || r.status === 403) throw { code: "bad_key" };
    if (r.status === 429) throw { code: "rate_limited" };
    if (!r.ok) throw { code: "upstream", status: r.status };
    const data = await r.json().catch(() => null);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg || !msg.content) throw { code: "invalid_json" };
    return parseJSON(msg.content);
  }
  async function fillEntry(auto) {
    const word = $("f-word").value.trim();
    if (!apiKey || !CFG.RELAY_URL) {
      if (!auto) { $("settings").hidden = false; refreshKeyStatus(); $("settings").scrollIntoView({ behavior: "smooth", block: "start" }); $("key").focus({ preventScroll: true }); }
      return;
    }
    if (!word) { if (!auto) { $("f-msg").textContent = "Enter the word first."; $("f-word").focus(); } return; }
    if (!aiFields.some(isFillable)) { if (!auto) $("f-fill-status").textContent = "Every field already has your own text. Clear a field to have it filled again."; return; }
    if (fillCtl) fillCtl.abort();
    const ctl = (fillCtl = new AbortController());
    lastFilledWord = word.toLowerCase();
    $("f-fill").disabled = true; $("f-save").disabled = true;
    $("f-fill-status").textContent = "Writing the entry for “" + word + "”…";
    try {
      const d = await askModel(fillPrompt(word), ctl.signal);
      if (ctl.signal.aborted) throw { code: "cancelled" };
      const put = (id, v) => { if (v == null || v === "" || !isFillable(id)) return; const s = String(v); $(id).value = s; $(id).dataset.ai = s; };
      if (typeof d.word === "string" && d.word.trim() && d.word.trim().toLowerCase() !== word.toLowerCase()) { $("f-word").value = d.word.trim().toLowerCase(); lastFilledWord = $("f-word").value; }
      put("f-pron", d.pron);
      if (POS.includes(d.pos) && isFillable("f-pos")) $("f-pos").value = d.pos;
      put("f-def", d.def);
      put("f-ex", Array.isArray(d.examples) ? d.examples.filter(Boolean).map(String).join("\n") : d.examples);
      put("f-note", d.note);
      if (typeof d.pronFlag === "boolean" && !$("f-flag").dataset.touched) $("f-flag").checked = d.pronFlag;
      $("f-fill-status").textContent = "Filled in. Check each field before you save.";
    } catch (e) {
      const c = e && e.code;
      const msgs = {
        cancelled: "",
        bad_key: "NVIDIA didn't accept your key. Check it in Settings, or make a new one at build.nvidia.com.",
        rate_limited: "Too many requests right now. Wait a minute, then press Fill in the rest.",
        network: "Couldn't reach the relay. Check your connection and try again.",
        invalid_json: "The answer came back in the wrong format. Press Fill in the rest to try again.",
      };
      $("f-fill-status").textContent = c in msgs ? msgs[c] : "Couldn't fill in the entry (error " + (e && e.status || "?") + "). Try again in a moment.";
      lastFilledWord = "";
    } finally {
      if (fillCtl === ctl) fillCtl = null;
      $("f-fill").disabled = false; $("f-save").disabled = false;
    }
  }
  $("f-fill").addEventListener("click", () => fillEntry(false));
  $("f-word").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); fillEntry(false); } });
  $("f-word").addEventListener("blur", () => {
    const w = $("f-word").value.trim().toLowerCase();
    if (w && w !== lastFilledWord && !editingId && !$("f-def").value.trim()) fillEntry(true);
  });

  // ---------- boot ----------
  words = loadWords();
  updateFillButton();
  if (words) showApp();
  else if (location.hash === "#mine") begin("mine");   // the owner's link: always start from the full list
  else { $("start").hidden = false; $("list").innerHTML = ""; }
})();
