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
  function fitMath(root) {
    /* 行内公式：比所在段落还宽就缩一点，避免出现横向滚动 */
    $$(".mth", root).forEach(el => {
      if (el.classList.contains("mth-display")) return;
      const p = el.parentElement;
      if (!p || !p.clientWidth) return;
      el.style.fontSize = "";
      if (el.getBoundingClientRect().width <= p.clientWidth) return;
      let fs = 1;
      while (fs > 0.7 && el.getBoundingClientRect().width > p.clientWidth && fs > 0.7) {
        fs -= 0.05;
        el.style.fontSize = fs.toFixed(2) + "em";
      }
    });

    const nodes = $$(".mth-display", root);
    nodes.forEach(el => {
      el.style.fontSize = "";
      if (!el.clientWidth) return;          // 折叠状态下量不到宽度，跳过
      const floor = el.clientWidth < 420 ? 0.52 : 0.74;   // 竖屏允许缩更多
      let fs = 1;
      for (let i = 0; i < 20 && el.scrollWidth > el.clientWidth + 2 && fs > floor; i++) {
        fs = Math.max(floor, fs - 0.03);
        el.style.fontSize = fs.toFixed(2) + "em";
      }
    });
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
    if (u.book !== "ex") { render(u.md, root); relatedInto(root, u); return; }
    const meta = metaOf(u.md);
    const parts = splitQ(meta.md);
    root.innerHTML = "";
    root.appendChild(metaBar(u, meta.src));
    root.appendChild(buildPart(parts.q));
    if (parts.hint) root.appendChild(wrapAcc(buildPart(parts.hint), "考点细则（先自己想）", "hint"));
    if (parts.sol) root.appendChild(wrapAcc(buildPart(parts.sol), "展开解析（解 + 答案）", "sol"));
    fitMath(root);
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
    sel.innerHTML = TOPICS.map(t =>
      '<option value="' + t.id + '"' + (t.id === S.topic ? " selected" : "") + '>' +
      esc(t.title) + "（" + problemCount(t.id) + " 题）</option>").join("");
    sel.onchange = () => {
      S.topic = sel.value; store.set("topic", S.topic);
      S.unit = null;
      drawViews();
    };
  }

  function drawTree() {
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

      if (n.group || (n.depth === 2 && hasKids(list, n.id))) {
        const open = isOpen(n.id);
        const row = document.createElement("div");
        row.className = "row grp depth-" + n.depth;
        row.innerHTML = '<span class="caret">' + (open ? "▾" : "▸") + "</span><span class=\"lbl\">" + esc(n.title) + "</span>" +
          (n.unit && S.done[n.unit] ? '<span class="done">✓</span>' : "");
        row.onclick = () => { setOpen(n.id, !open); drawTree(); };
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

  /* ================= 主区 ================= */
  function openUnit(id, push) {
    const u = D.units[id];
    if (!u) return;
    S.unit = id;
    if (push) store.set("unit", id);
    expandPath(id);
    drawTree();

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
    $("#doc").parentElement.scrollTop = 0;
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

    drawTopics();
    drawViews();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
