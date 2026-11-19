/* 数一 · 大观学习台 —— 纯前端，离线可用 */
(function () {
  "use strict";

  const D = window.DATA;
  if (!D) { document.body.innerHTML = "<p style='padding:2rem'>缺少 data.js，请先运行 build.py</p>"; return; }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("shuyi." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("shuyi." + k, JSON.stringify(v)); } catch (e) {} }
  };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  const TOPICS = D.topics || [{ id: "all", title: "全部", ex: 0 }];
  const TT = {}; TOPICS.forEach(t => (TT[t.id] = t.title));

  const S = {
    topic: store.get("topic", TOPICS[0].id),
    view: store.get("view", "kp"),
    unit: store.get("unit", null),
    q: "",
    done: store.get("done", {}),
    fav: store.get("fav", {}),
    open: store.get("open", {}),
    autoOpen: store.get("autoOpen", false),
    tableFilter: { chapter: "", kind: "", kp: "", text: "" }
  };

  /* ================= Markdown + 公式 ================= */
  function mdToHtml(md) {
    const bag = [];
    let s = md.replace(/\$\$([\s\S]+?)\$\$/g, (m, b) => {
      bag.push({ tex: b.trim(), d: 1 }); return "\u0000" + (bag.length - 1) + "\u0000";
    });
    s = s.replace(/\$([^$\n]+?)\$/g, (m, b) => {
      bag.push({ tex: b.trim(), d: 0 }); return "\u0000" + (bag.length - 1) + "\u0000";
    });
    const canMarked = window.marked && typeof window.marked.parse === "function";
    // marked 缺失/解析失败（老 WebView）时退回极简渲染，保证正文可读
    let html;
    if (canMarked) {
      try {
        html = window.marked.parse(s, { gfm: true, breaks: false });
      } catch (e) {
        html = mdFallback(s);
      }
    } else {
      html = mdFallback(s);
    }
    html = html.replace(/\u0000(\d+)\u0000/g, (m, i) => '<span class="mth" data-i="' + i + '"></span>');
    return { html: html, bag: bag };
  }

  const KATEX_OPTS = { displayMode: false, throwOnError: false, strict: false, output: "html" };

  function paintMath(root, bag) {
    $$(".mth", root).forEach(el => {
      const m = bag[+el.dataset.i];
      if (!m) return;
      if (m.d) el.classList.add("mth-display");
      try { window.katex.render(m.tex, el, Object.assign({}, KATEX_OPTS, { displayMode: !!m.d })); }
      catch (e) { el.textContent = m.tex; }
    });
  }

  /* 某专题的例题总数（不能直接用单元数，单元里含板块小节点） */
  function problemCount(tid) {
    let n = 0;
    for (const p of D.problems) if (p.topic === tid) n++;
    return n;
  }

  /* 给表格单元格补上列名，窄屏堆叠成卡片时用作前缀 */
  function labelTables(root) {
    $$("table", root).forEach(t => {
      const ths = $$("thead th", t).map(x => x.textContent.trim());
      if (!ths.length) return;
      $$("tbody tr", t).forEach(tr => {
        $$("td", tr).forEach((td, i) => {
          if (!td.getAttribute("data-label")) td.setAttribute("data-label", ths[i] || "");
        });
      });
    });
  }

  /* 行间公式放不下时自动缩小字号，避免出现横向滚动条 */
  /* 公式排版原则：**绝不缩小字号**。太宽就允许横向滑动，并给一个 ⇄ 提示。 */
  function markWide(el) {
    if (!el || !el.clientWidth) return;
    const wide = el.scrollWidth > el.clientWidth + 2;
    el.classList.toggle("wide", wide);
  }
  function fitMath(root) {
    $$(".mth-display, .mth", root).forEach(markWide);
    if (!window.__shuyiWideBound) {
      window.__shuyiWideBound = 1;
      let t = 0;
      window.addEventListener("resize", () => {
        clearTimeout(t);
        t = setTimeout(() => $$(".mth-display, .mth", $("#doc")).forEach(markWide), 160);
      });
    }
  }

  /* marked 不可用时的极简兜底渲染：至少保证正文可读 */
  function mdFallback(md) {
    const esc0 = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return md.split(/\n{2,}/).map(block => {
      const t = block.trim();
      if (!t) return "";
      let m = t.match(/^(#{1,4})\s+(.*)$/);
      if (m) return "<h" + m[1].length + ">" + esc0(m[2]) + "</h" + m[1].length + ">";
      if (/^[-*]\s+/m.test(t)) {
        return "<ul>" + t.split(/\n/).filter(x => /^[-*]\s+/.test(x.trim()))
          .map(x => "<li>" + esc0(x.replace(/^\s*[-*]\s+/, "")) + "</li>").join("") + "</ul>";
      }
      if (t.startsWith(">")) {
        return "<blockquote>" + esc0(t.replace(/^>\s?/gm, "")) + "</blockquote>";
      }
      return "<p>" + esc0(t).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  /* A. B. C. D. 选项 → 网格 */
  function tidyOpts(root) {
    const kids = Array.prototype.slice.call(root.children);
    const isOpt = el => el && el.tagName === "P" && /^[A-D][.．、]/.test(el.textContent.trim());
    for (let i = 0; i < kids.length; i++) {
      if (!isOpt(kids[i])) continue;
      let j = i;
      while (j < kids.length && isOpt(kids[j])) j++;
      const run = kids.slice(i, j);
      if (run.length < 2) { i = j; continue; }
      const box = document.createElement("div");
      box.className = "opts";
      const longest = Math.max.apply(null, run.map(r => r.textContent.trim().length));
      if (longest > 26) box.classList.add("stack");
      root.insertBefore(box, run[0]);
      run.forEach(p => {
        const d = document.createElement("div");
        d.className = "opt";
        d.innerHTML = p.innerHTML.replace(/^(\s*)([A-D])([.．、])/, (m, a, b, c) => a + "<b>" + b + c + "</b>");
        box.appendChild(d);
        p.remove();
      });
      return tidyOpts(root);
    }
  }

  function render(md, root) {
    const r = mdToHtml(md);
    root.innerHTML = r.html;
    paintMath(root, r.bag);
    tidyOpts(root);
    labelTables(root);
    fitMath(root);
  }

  /* ================= 例题：题干 / 考点 / 解析 ================= */
  function splitQ(md) {
    const lines = md.split("\n");
    let hi = -1;
    for (let i = 0; i < lines.length; i++) if (/^>\s*\*\*考点细则/.test(lines[i].trim())) { hi = i; break; }
    let si = -1;
    for (let i = hi < 0 ? 0 : hi + 1; i < lines.length; i++) {
      if (/^\*\*(解|证|证明|答案)\*\*/.test(lines[i].trim())) { si = i; break; }
    }
    return {
      q: lines.slice(0, hi < 0 ? (si < 0 ? lines.length : si) : hi).join("\n"),
      hint: hi >= 0 ? lines.slice(hi, si < 0 ? lines.length : si).join("\n") : "",
      sol: si >= 0 ? lines.slice(si).join("\n") : ""
    };
  }

  function buildPart(md) {
    const box = document.createElement("div");
    box.className = "part";
    const r = mdToHtml(md);
    box.innerHTML = r.html;
    paintMath(box, r.bag);
    tidyOpts(box);
    labelTables(box);
    fitMath(box);
    return box;
  }

  function wrapAcc(box, label, kind) {
    const d = document.createElement("details");
    d.className = "acc";
    d.dataset.kind = kind;
    if (S.autoOpen && kind === "sol") d.open = true;
    const s = document.createElement("summary");
    s.textContent = label;
    const openLabel = kind === "sol" ? "收起解析" : "收起考点细则";
    d.addEventListener("toggle", () => {
      s.textContent = d.open ? openLabel : label;
      if (d.open) fitMath(d);
    });
    d.appendChild(s);
    d.appendChild(box);
    return d;
  }

  function metaOf(md) {
    let src = "";
    const mS = md.match(/^\*来源：(.*?)\*\s*$/m);
    if (mS) { src = mS[1]; md = md.replace(/^\*来源：.*?\*\s*$/m, ""); }
    md = md.replace(/^\*关联：.*?\*\s*$/m, "");
    return { md: md.trim(), src: src };
  }

  function gotoUnit(id) {
    const t = D.units[id];
    if (!t) return;
    if (t.topic && t.topic !== S.topic) { S.topic = t.topic; store.set("topic", S.topic); drawTopics(); }
    S.view = t.book; store.set("view", S.view); drawViews(); openUnit(id, true);
  }

  function metaBar(u, src) {
    const bar = document.createElement("div");
    bar.className = "meta";
    if (src) {
      const s = document.createElement("span");
      s.className = "src"; s.textContent = "来源：" + src; bar.appendChild(s);
    }
    (u.refs || []).forEach(id => {
      const k = D.units[id];
      if (!k) return;
      const b = document.createElement("button");
      const cross = k.topic && k.topic !== S.topic;
      b.className = "chip" + (cross ? " cross" : "");
      b.textContent = (cross ? (D.topicTitle || {})[k.topic] + " · " : "") + "§ " + k.title;
      b.title = "跳到 " + k.title;
      b.onclick = () => gotoUnit(id);
      bar.appendChild(b);
    });
    return bar;
  }

  function relatedInto(root, u) {
    let ids = (D.backlinks || {})[u.id] || [];
    if (!ids.length && u.book === "kp" && u.chapterId) {
      const seen = {};
      Object.keys(D.units).forEach(id => {
        const v = D.units[id];
        if (v.book === "kp" && v.chapterId === u.chapterId) {
          ((D.backlinks || {})[id] || []).forEach(x => { if (!seen[x]) { seen[x] = 1; } });
        }
      });
      ids = Object.keys(seen);
      ids.sort((a, b) => flatList().indexOf(a) - flatList().indexOf(b));
    }
    if (!ids.length) {
      if (u.book === "kp" && /^\d/.test(u.title)) {
        const tip = document.createElement("div");
        tip.className = "rel-empty";
        tip.textContent = "本节暂无对应例题，可在「题目总表」按知识点筛选查看相关题。";
        root.appendChild(tip);
      }
      return;
    }
    const sec = document.createElement("section");
    sec.className = "related";
    const h = document.createElement("h3");
    const isChap = u.book === "kp" && !(D.backlinks || {})[u.id];
    h.innerHTML = (isChap ? "本章例题" : "本节例题") + ' <span class="cnt">' + ids.length + "</span>";
    sec.appendChild(h);
    const list = document.createElement("div");
    list.className = "rel-list";
    ids.forEach(id => {
      const p = D.units[id];
      if (!p) return;
      const seg = p.title.split(" · ");
      const code = (seg[0] || p.title).replace("例 ", "");
      const cross = p.topic && p.topic !== S.topic;
      const b = document.createElement("button");
      b.className = "rel" + (S.done[id] ? " done" : "") + (cross ? " cross" : "");
      b.innerHTML = (cross ? '<span class="rtopic">' + esc((D.topicTitle || {})[p.topic] || "") + "</span>" : "") +
        '<span class="rc">' + esc(code) + '</span><span class="rt">' +
        esc(seg.slice(1).join(" · ") || "") + "</span>" + (S.done[id] ? '<span class="rok">✓</span>' : "");
      b.onclick = () => gotoUnit(id);
      list.appendChild(b);
    });
    sec.appendChild(list);
    root.appendChild(sec);
  }

  function renderUnit(u) {
    const root = $("#doc");
    if (u.book !== "ex") { render(u.md, root); miniToc(root); relatedInto(root, u); return; }
    const meta = metaOf(u.md);
    const parts = splitQ(meta.md);
    root.innerHTML = "";
    root.appendChild(metaBar(u, meta.src));
    root.appendChild(buildPart(parts.q));
    if (parts.hint) root.appendChild(wrapAcc(buildPart(parts.hint), "考点细则（先自己想）", "hint"));
    if (parts.sol) root.appendChild(wrapAcc(buildPart(parts.sol), "展开解析（解 + 答案）", "sol"));
    fitMath(root);
  }

  /* 长小节自动生成"本节目录"（正文 h3 足够多时才出） */
  function miniToc(root) {
    const hs = $$("h3", root);
    if (hs.length < 5) return;
    const d = document.createElement("details");
    d.className = "minitoc";
    const sm = document.createElement("summary");
    sm.textContent = "本节目录（" + hs.length + " 项）";
    d.appendChild(sm);
    const ol = document.createElement("ol");
    hs.forEach((h, i) => {
      if (!h.id) h.id = "sec-" + i + "-" + Math.random().toString(36).slice(2, 6);
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent.trim().slice(0, 28);
      a.onclick = ev => { ev.preventDefault(); h.scrollIntoView({ behavior: "smooth", block: "start" }); };
      li.appendChild(a); ol.appendChild(li);
    });
    d.appendChild(ol);
    const anchor = $$("h2", root)[0];
    if (anchor && anchor.nextSibling) root.insertBefore(d, anchor.nextSibling);
    else root.insertBefore(d, root.firstChild);
  }

  /* ================= 检索索引 ================= */
  const plain = md => md
    .replace(/\$\$[\s\S]+?\$\$/g, " ")
    .replace(/\$[^$\n]+?\$/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[>*_`|]/g, " ")
    .replace(/\s+/g, " ");

  const IDX = Object.keys(D.units).map(id => {
    const u = D.units[id];
    return { id: id, title: u.title, text: plain(u.md), topic: u.topic };
  });

  function search(q) {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    const hits = [];
    IDX.forEach(it => {
      const hay = (it.title + " " + it.text).toLowerCase();
      let pos = hay.indexOf(key), n = 0;
      while (pos >= 0 && n < 3) { n++; pos = hay.indexOf(key, pos + key.length); }
      if (!n) return;
      const src = it.title + " " + it.text;
      const p0 = Math.max(0, src.toLowerCase().indexOf(key) - 34);
      hits.push({ id: it.id, title: it.title, seg: src.slice(p0, p0 + 110), n: n, topic: it.topic });
    });
    hits.sort((a, b) => b.n - a.n);
    return hits.slice(0, 40);
  }

  function markSeg(s, q) {
    const key = q.trim();
    if (!key) return esc(s);
    const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return esc(s).replace(re, m => "<mark>" + m + "</mark>");
  }

  /* ================= 侧栏 ================= */
  const keyOf = () => S.topic + ":" + S.view;
  const navList = () => D.nav[keyOf()] || [];
  const flatList = () => D.flat[keyOf()] || [];
  const topicProblems = () => D.problems.filter(p => p.topic === S.topic);
  const isOpen = id => !!S.open[id];
  const setOpen = (id, v) => { if (v) S.open[id] = 1; else delete S.open[id]; store.set("open", S.open); };

  function expandPath(unitId) {
    const u = D.units[unitId];
    if (!u) return;
    let p = u.parentId;
    while (p) {
      S.open[p] = 1;
      const nu = D.units[p];
      p = nu ? nu.parentId : null;
    }
    store.set("open", S.open);
  }

  function drawTopics() {
    const sel = $("#topicSel");
    if (!sel) return;
    // 按科目分组（高数 / 概率论 / 线代…）
    const groups = [];
    TOPICS.forEach(t => {
      const key = t.subject || "其他";
      let g = groups.find(x => x.name === key);
      if (!g) { g = { name: key, items: [] }; groups.push(g); }
      g.items.push(t);
    });
    const opt = t => '<option value="' + t.id + '"' + (t.id === S.topic ? " selected" : "") + ">" +
      esc(t.title) + "（" + problemCount(t.id) + " 题）</option>";
    sel.innerHTML = groups.map(g =>
      '<optgroup label="' + esc(g.name) + '">' + g.items.map(opt).join("") + "</optgroup>").join("");
    sel.onchange = () => {
      S.topic = sel.value; store.set("topic", S.topic);
      S.unit = null;
      drawViews(); drawTopTitle();
    };
  }

  function drawTree(scrollToCur) {
    const nav = $("#tree"), list = navList();
    nav.innerHTML = "";
    let chap = null, sec = null;
    list.forEach(n => {
      if (n.depth === 1 && (n.group || hasKids(list, n.id))) { chap = n; sec = null; }
      if (n.depth === 2) { sec = n; }
      const visible = n.depth === 1 ? true
        : n.depth === 2 ? (!chap || isOpen(chap.id))
        : (!chap || (isOpen(chap.id) && sec && isOpen(sec.id)));
      if (!visible) return;

      /* 可折叠行：真正的章节点（group）或任何有子项的节点——
         概统/线代按章拆开后，板块要点是「一级 + 有子项」，也必须能展开 */
      if (n.group || hasKids(list, n.id)) {
        const open = isOpen(n.id);
        const row = document.createElement("div");
        row.className = "row grp depth-" + n.depth;
        let extra = "";
        if (n.depth === 1 && S.view === "ex") {
          const kids = list.filter(x => x.parent === n.id && x.unit);
          const ids = kids.map(x => x.unit);
          const ps = D.problems.filter(p => ids.indexOf(p.chapter) >= 0 || p.chapter === n.title);
          let mine = D.problems.filter(p => p.topic === S.topic && p.chapter === n.title);
          if (!mine.length) mine = D.problems.filter(p => p.topic === S.topic && p.section === n.title);
          if (mine.length) {
            const dn = mine.filter(p => S.done[p.id]).length;
            extra = '<span class="cnt">' + dn + "/" + mine.length + "</span>";
          }
        }
        row.innerHTML = '<span class="caret">' + (open ? "▾" : "▸") + "</span><span class=\"lbl\">" + esc(n.title) + "</span>" + extra +
          (n.unit && S.done[n.unit] ? '<span class="done">✓</span>' : "");
        row.onclick = () => {
          const willOpen = !open;
          // 手风琴只对"真正的章节点"生效；拍平后的一级板块彼此独立展开
          if (willOpen && n.depth === 1 && n.group) {
            list.filter(x => x.depth === 1 && x.group && x.id !== n.id)
              .forEach(x => { delete S.open[x.id]; });
          }
          setOpen(n.id, willOpen);
          // 板块要点本身有正文：展开时顺手把它的正文打开（openUnit 会重画树）
          if (willOpen && n.unit && !n.group) { openUnit(n.unit, true); return; }
          drawTree();
        };
        nav.appendChild(row);
        return;
      }
      if (!n.unit) return;
      const row = document.createElement("div");
      row.className = "row depth-" + n.depth + (S.unit === n.unit ? " on" : "");
      row.innerHTML = '<span class="caret"></span><span class="lbl">' + esc(n.title) + "</span>" +
        (S.done[n.unit] ? '<span class="done">✓</span>' : "");
      row.title = n.title;
      row.onclick = () => openUnit(n.unit, true);
      nav.appendChild(row);
    });

    if (scrollToCur) {
      const cur = nav.querySelector(".row.on");
      if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: "center" }); } catch (e) {} }
    }

    const p = $("#progress");
    if (S.view === "ex" && S.topic !== "all") {
      const ps = topicProblems(), tot = ps.length, dn = ps.filter(x => S.done[x.id]).length;
      p.style.display = "";
      $("#pbar").textContent = dn + " / " + tot;
      $("#bar").firstElementChild.style.width = (tot ? dn / tot * 100 : 0) + "%";
    } else {
      p.style.display = "none";
    }
  }

  function hasKids(list, id) { return list.some(x => x.parent === id); }

  /* ================= 导航 · 记忆 · 手机框架 ================= */

  /* 当前滚动容器：宽屏滚 #main，窄屏滚页面 */
  const isPhone = () => window.matchMedia && window.matchMedia("(max-width: 860px)").matches;
  function getScroll() {
    return isPhone() ? (window.scrollY || document.documentElement.scrollTop || 0) : ($("#main").scrollTop || 0);
  }
  function setScroll(y) {
    if (isPhone()) window.scrollTo(0, y || 0);
    else $("#main").scrollTop = y || 0;
  }

  /* 每个单元的阅读位置（sessionStorage，关掉浏览器即清） */
  const scrollMem = (() => {
    try { return JSON.parse(sessionStorage.getItem("shuyi.scroll") || "{}"); } catch (e) { return {}; }
  })();
  function saveScroll(id) {
    if (!id) return;
    scrollMem[id] = getScroll();
    try { sessionStorage.setItem("shuyi.scroll", JSON.stringify(scrollMem)); } catch (e) {}
  }

  /* 最近浏览 */
  function pushRecent(id) {
    const list = store.get("recent", []).filter(x => x.id !== id);
    list.unshift({ id: id, t: Date.now() });
    store.set("recent", list.slice(0, 20));
  }
  function drawResume() {
    const box = $("#resume");
    if (!box) return;
    const last = (store.get("recent", [])[0] || {}).id;
    const u = last && D.units[last];
    if (!u || last === S.unit) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = "继续上次阅读<b>" + esc(u.title) + " · " + esc(TT[u.topic] || "") + "</b>";
    box.onclick = () => { goUnit(last); closeDrawer(); };
  }

  /* ---- 路由：#/u/<单元 id> ---- */
  let routing = false;
  function hashOf(id) { return "#/u/" + encodeURIComponent(id); }
  function parseHash() {
    const m = /^#\/u\/(.+)$/.exec(location.hash || "");
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }
  function goUnit(id) { openUnit(id, true); }

  function onRoute() {
    if (routing) return;
    const id = parseHash() || ((history.state && history.state.shuyiUnit) || null) || S.home || null;
    if (!id) return;
    const u = D.units[id];
    if (!u) return;
    if (id === S.unit && S.view === u.book && S.topic === u.topic) return;
    routing = true;
    openUnit(id, false, true, true);
    routing = false;
  }

  /* ---- 抽屉 ---- */
  function openDrawer() {
    if (!isPhone()) return;
    document.body.classList.add("drawer");
    $("#scrim").hidden = false;
    try { history.pushState({ shuyiDrawer: 1 }, "", location.href); } catch (e) {}
  }
  function closeDrawer() {
    document.body.classList.remove("drawer");
    $("#scrim").hidden = true;
  }

  /* ---- 底部工具条 ---- */
  function drawBottom(id) {
    const bar = $("#bottombar");
    if (!bar) return;
    const list = flatList().filter(x => !/preface$/.test(x));
    const i = list.indexOf(id);
    const prev = i > 0 ? list[i - 1] : null;
    const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    const pb = bar.querySelector('[data-nav="prev"]'), nb = bar.querySelector('[data-nav="next"]');
    pb.disabled = !prev; nb.disabled = !next;
    pb.onclick = () => prev && goUnit(prev);
    nb.onclick = () => next && goUnit(next);
    const pos = $("#bbPos");
    bar.style.display = S.view === "table" ? "none" : "";
    pos.textContent = i >= 0 && list.length ? (i + 1) + " / " + list.length : "—";
  }

  /* ---- 顶栏标题 ---- */
  function drawTopTitle() {
    const t = $("#topTopic");
    if (!t) return;
    const v = S.view === "kp" ? "知识点" : S.view === "ex" ? "例题" : "总表";
    t.textContent = (TT[S.topic] || "数一 · 大观") + " · " + v;
    const sub = $("#brandSub");
    if (sub) sub.textContent = TT[S.topic] || "";
  }

  /* ---- 阅读字号 ---- */
  function applyFs(v) {
    const n = String(v || "2");
    document.documentElement.dataset.fs = n;
    store.set("fs", n);
    $$("#fsRow button").forEach(b => b.classList.toggle("on", b.dataset.fs === n));
    setTimeout(() => { if (S.unit) fitMath($("#doc")); }, 60);
  }

  /* ================= 主区 ================= */
  function openUnit(id, push, fromRoute, noHash) {
    const u = D.units[id];
    if (!u) return;
    const prevId = S.unit;
    if (prevId && prevId !== id) saveScroll(prevId);
    S.unit = id;
    if (push) store.set("unit", id);
    expandPath(id);
    drawTree(true);
    drawTopTitle();

    const crumbArr = [TT[u.topic] || "全部"].concat(u.crumbs);
    $("#crumb").innerHTML =
      crumbArr.map((c, i) => (i === crumbArr.length - 1 ? "<b>" + esc(c) + "</b>" : esc(c))).join(" › ") +
      '<span class="spacer"></span>' +
      '<button class="btn' + (S.fav[id] ? " on" : "") + '" id="favBtn">' + (S.fav[id] ? "★" : "☆") + "</button>" +
      '<button class="btn' + (S.done[id] ? " on" : "") + '" id="doneBtn">' + (S.done[id] ? "✓ 已掌握" : "○ 标记掌握") + "</button>" +
      (u.book === "ex" && /\*\*解\*\*/.test(u.md) ? '<button class="btn" id="accBtn">展开全部</button>' : "");

    $("#favBtn").onclick = () => {
      if (S.fav[id]) delete S.fav[id]; else S.fav[id] = 1;
      store.set("fav", S.fav); openUnit(id, false);
    };
    $("#doneBtn").onclick = () => {
      if (S.done[id]) delete S.done[id]; else S.done[id] = 1;
      store.set("done", S.done); openUnit(id, false);
    };

    renderUnit(u);
    const keep = scrollMem[id];
    setScroll(fromRoute || push || noHash ? (keep || 0) : 0);
    if (!noHash && (fromRoute || push)) {
      const want = hashOf(id);
      if (location.hash !== want) { try { history.pushState({ shuyiUnit: id }, "", want); } catch (e) { location.hash = want; } }
    }
    pushRecent(id);
    drawResume();
    drawBottom(id);
    drawPager(id);

    const ab = $("#accBtn");
    if (ab) ab.onclick = () => {
      const ds = $$("#doc details.acc");
      const anyClosed = ds.some(d => !d.open);
      ds.forEach(d => (d.open = anyClosed));
      ab.textContent = anyClosed ? "收起全部" : "展开全部";
    };
  }

  function drawPager(id) {
    const flat = flatList(), i = flat.indexOf(id), p = $("#pager");
    const prev = i > 0 ? D.units[flat[i - 1]] : null;
    const next = i >= 0 && i < flat.length - 1 ? D.units[flat[i + 1]] : null;
    p.innerHTML =
      (prev ? '<button class="btn" data-go="' + flat[i - 1] + '">← ' + esc(prev.title) + "</button>" : "<span></span>") +
      (next ? '<button class="btn" data-go="' + flat[i + 1] + '">' + esc(next.title) + " →</button>" : "<span></span>");
    $$("[data-go]", p).forEach(b => (b.onclick = () => openUnit(b.dataset.go, true)));
  }

  /* ================= 题目总表 ================= */
  function drawTable() {
    const pool = topicProblems();
    const chapters = Array.from(new Set(pool.map(p => p.chapter)));
    $("#crumb").innerHTML = "<b>题目总表 · " + esc(TT[S.topic] || "") + "</b><span class='spacer'></span><span>" +
      pool.length + " 题 · 已掌握 " + pool.filter(p => S.done[p.id]).length + "</span>";
    $("#doc").innerHTML =
      '<h1>题目总表</h1><div class="filters">' +
      '<select id="fCh"><option value="">全部板块</option>' +
      chapters.map(c => '<option' + (S.tableFilter.chapter === c ? " selected" : "") + ">" + esc(c) + "</option>").join("") + "</select>" +
      '<select id="fKind"><option value="">全部类型</option><option' + (S.tableFilter.kind === "原题" ? " selected" : "") + '>原题</option><option' + (S.tableFilter.kind === "自编" ? " selected" : "") + '>自编</option></select>' +
      '<select id="fKp"><option value="">全部知识点</option>' +
      ((D.kpSections || {})[S.topic] || []).map(x => '<option value="' + x.no + '"' + (S.tableFilter.kp === x.no ? " selected" : "") + ">" + esc(x.title) + "</option>").join("") +
      '</select>' +
      '<input id="fText" placeholder="筛选题号 / 关键词" value="' + esc(S.tableFilter.text) + '"></div><div id="tbl"></div>';

    const rows = pool.filter(p =>
      (!S.tableFilter.chapter || p.chapter === S.tableFilter.chapter) &&
      (!S.tableFilter.kind || p.kind === S.tableFilter.kind) &&
      (!S.tableFilter.kp || (p.refsNo || []).indexOf(S.tableFilter.kp) >= 0) &&
      (!S.tableFilter.text || (p.no + " " + p.title + " " + p.section).toLowerCase().indexOf(S.tableFilter.text.toLowerCase()) >= 0));

    $("#tbl").innerHTML = '<table class="qtable"><thead><tr><th>编号</th><th>板块</th><th>知识点</th><th>类型</th><th>考点</th><th class="st">掌握</th></tr></thead><tbody>' +
      rows.map(p =>
        '<tr data-id="' + p.id + '"><td><b>' + esc(p.no) + "</b></td><td>" + esc(p.section) + "</td><td class=\"kp\">" + esc(((p.refsLabel || p.refsNo) || []).join(", ")) + "</td><td>" +
        '<span class="tag ' + (p.kind === "自编" ? "selfmade" : "") + '">' + esc(p.kind) + "</span></td><td>" +
        esc((p.short || p.title).replace(/^例\s*/, "")) + '</td><td class="st"><input type="checkbox" data-chk="' + p.id + '"' + (S.done[p.id] ? " checked" : "") + "></td></tr>"
      ).join("") + "</tbody></table>";

    $("#fCh").onchange = e => { S.tableFilter.chapter = e.target.value; drawTable(); };
    $("#fKind").onchange = e => { S.tableFilter.kind = e.target.value; drawTable(); };
    $("#fKp").onchange = e => { S.tableFilter.kp = e.target.value; drawTable(); };
    $("#fText").oninput = e => { S.tableFilter.text = e.target.value; const v = e.target.value; drawTable(); $("#fText").value = v; $("#fText").focus(); };
    $$("tr[data-id]", $("#tbl")).forEach(tr => {
      tr.onclick = ev => {
        if (ev.target.tagName === "INPUT") return;
        S.view = "ex"; store.set("view", "ex"); drawViews(); openUnit(tr.dataset.id, true);
      };
    });
    $$("input[data-chk]", $("#tbl")).forEach(cb => {
      cb.onclick = ev => {
        const id = cb.dataset.chk;
        if (cb.checked) S.done[id] = 1; else delete S.done[id];
        store.set("done", S.done); ev.stopPropagation(); drawTree();
      };
    });
    $("#pager").innerHTML = "";
  }

  /* ================= 搜索 ================= */
  function drawResults() {
    const box = $("#results");
    if (!S.q.trim()) { box.hidden = true; $("#tree").hidden = false; return; }
    const hits = search(S.q);
    box.hidden = false; $("#tree").hidden = true;
    box.innerHTML = hits.length
      ? hits.map(h => '<div class="hit" data-id="' + h.id + '"><div class="t">' + esc(h.title) +
          ' <span class="meta">· ' + esc(TT[h.topic] || "") + " · " + h.n + " 处</span></div><div class=\"s\">" +
          markSeg(h.seg, S.q) + "</div></div>").join("")
      : '<div class="empty">没有匹配的内容</div>';
    $$(".hit", box).forEach(el => (el.onclick = () => {
      const u = D.units[el.dataset.id];
      if (u.topic && u.topic !== S.topic) { S.topic = u.topic; store.set("topic", S.topic); drawTopics(); }
      S.view = u.book; store.set("view", u.book); drawViews(); openUnit(el.dataset.id, true);
    }));
  }

  /* ================= 视图 ================= */
  function drawViews() {
    $$(".views button").forEach(b => b.classList.toggle("on", b.dataset.view === S.view));
    $("#results").hidden = true;
    $("#tree").hidden = false;
    if (S.view === "table") { drawTable(); drawTree(); return; }
    drawTree();
    if (S.unit && D.units[S.unit] && D.units[S.unit].book === S.view && (D.units[S.unit].topic === S.topic)) {
      openUnit(S.unit, false);
    } else {
      const noPre = flatList().filter(id => !/preface$/.test(id) && D.units[id]);
      const first = noPre.filter(id => /^\d/.test(D.units[id].title))[0] || noPre[0] || flatList()[0];
      if (first) openUnit(first, false);
      else { $("#doc").innerHTML = '<div class="empty">暂无内容</div>'; }
    }
  }

  /* ================= 启动 ================= */
  function boot() {
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    document.documentElement.dataset.theme = store.get("theme", mq ? "dark" : "light");
    $("#theme").onclick = () => {
      const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = t; store.set("theme", t);
    };
    const aa = $("#autoAcc");
    if (aa) {
      const sync = () => { aa.textContent = "解析" + (S.autoOpen ? "常开" : "折叠"); aa.classList.toggle("on", S.autoOpen); };
      sync();
      aa.onclick = () => { S.autoOpen = !S.autoOpen; store.set("autoOpen", S.autoOpen); sync(); if (S.unit) openUnit(S.unit, false); };
    }
    $$(".views button").forEach(b => (b.onclick = () => {
      S.view = b.dataset.view; store.set("view", S.view); S.q = ""; $("#q").value = ""; drawViews();
    }));
    const q = $("#q");
    q.oninput = () => { S.q = q.value; $("#clearq").style.display = q.value ? "block" : "none"; drawResults(); };
    q.onkeydown = e => { if (e.key === "Escape") { q.value = ""; S.q = ""; $("#clearq").style.display = "none"; drawResults(); q.blur(); } };
    $("#clearq").onclick = () => { q.value = ""; S.q = ""; $("#clearq").style.display = "none"; drawResults(); };
    document.addEventListener("keydown", e => {
      if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
    });

    let rz = null;
    window.addEventListener("resize", () => {
      clearTimeout(rz);
      rz = setTimeout(() => { if (S.unit) fitMath($("#doc")); }, 160);
    });

    /* ---- 手机框架：抽屉 / 底栏 / 字号 / 回顶 ---- */
    applyFs(store.get("fs", "2"));

    const mb = $("#menuBtn"), cb = $("#closeSide"), sc = $("#scrim"), tt = $("#topTitle");
    if (mb) mb.onclick = openDrawer;
    if (tt) tt.onclick = openDrawer;
    if (cb) cb.onclick = closeDrawer;
    if (sc) sc.onclick = closeDrawer;

    const sheet = $("#fsheet");
    const openSheet = () => { if (sheet) { sheet.hidden = false; applyFs(document.documentElement.dataset.fs); } };
    const closeSheet = () => { if (sheet) sheet.hidden = true; };
    const fsb = $("#fsBtn"), more = $("#moreBtn"), fsc = $("#fsClose");
    if (fsb) fsb.onclick = openSheet;
    if (more) more.onclick = openSheet;
    if (fsc) fsc.onclick = closeSheet;
    if (sheet) sheet.onclick = ev => { if (ev.target === sheet) closeSheet(); };
    $$("#fsRow button").forEach(b => (b.onclick = () => applyFs(b.dataset.fs)));

    /* 字号面板里补一个深浅色开关 */
    const card = $(".sheet-card");
    if (card) {
      const row = document.createElement("div");
      row.className = "fs-row";
      row.style.marginTop = "8px";
      const tb = document.createElement("button");
      tb.style.gridColumn = "span 3";
      const syncTheme = () => (tb.textContent = document.documentElement.dataset.theme === "dark" ? "☾ 深色：开" : "☀ 深色：关");
      syncTheme();
      tb.onclick = () => {
        const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = t; store.set("theme", t); syncTheme();
      };
      row.appendChild(tb); card.insertBefore(row, $("#fsClose"));
    }

    /* 回顶 */
    const top = $("#toTop");
    if (top) top.onclick = () => setScroll(0);
    let st = 0;
    const onScroll = () => {
      clearTimeout(st);
      st = setTimeout(() => {
        const y = getScroll();
        if (top) top.hidden = y < 320;
        if (S.unit) saveScroll(S.unit);
      }, 120);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const mEl = $("#main");
    if (mEl) mEl.addEventListener("scroll", onScroll, { passive: true });

    /* ---- 路由：浏览器返回键 ---- */
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("popstate", () => {
      if (document.body.classList.contains("drawer")) { closeDrawer(); return; }
      onRoute();
    });

    drawTopics();
    drawViews();
    drawResume();

    /* 冷启动：有 hash 就按 hash 打开，否则用上次位置 */
    const bootId = parseHash();
    if (bootId && D.units[bootId]) openUnit(bootId, true, true);
    else if (S.unit && D.units[S.unit]) openUnit(S.unit, false, false);
    S.home = S.unit || (flatList()[0] || null);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
