/* 内容脚本：作者后台注入浮动胶囊 + 分析面板（Shadow DOM）。
   只读：不点站点按钮、不改项目，网络全部经 background 代理。 */
(function () {
  "use strict";

  if (window.top !== window) return;
  if (window.__cfdashInjected) return;
  window.__cfdashInjected = true;

  var S = window.CFDStats;
  var HOST_ID = "cfdash-host";
  var POS_KEY = "cfdash:pills";

  var state = {
    data: null,
    mode: "loading", // loading | setup | main | error
    tab: "overview",
    sortKey: "total",
    sortDir: -1,
    error: "",
    busy: false,
    collapsed: true,
    setupValue: ""
  };

  var pollTimer = null;
  var host = document.createElement("div");
  host.id = HOST_ID;
  var shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  /* ---------- 样式 ---------- */
  var CSS = `
  :host{all:initial}
  *{box-sizing:border-box}
  .wrap{position:fixed;right:18px;bottom:18px;z-index:2147483000;
    font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
    color:var(--txt);-webkit-font-smoothing:antialiased;
    --panel-top:rgba(26,29,38,.975);--panel-bot:rgba(16,18,25,.975);
    --line:rgba(255,255,255,.10);--line-soft:rgba(255,255,255,.065);
    --txt:#e9ecf3;--txt2:#cdd3e0;--txt3:#9aa3b6;--txt4:#7f8697;
    --card:rgba(255,255,255,.04);--card-b:rgba(255,255,255,.055);
    --hover:rgba(255,255,255,.045);
    --pill1:#2b3040;--pill2:#191d27;
    --thumb1:#2f3546;--thumb2:#232833;
    --pos:#46d39a;--neg:#ff7b7b;
    --shadow:0 28px 70px rgba(0,0,0,.6);
    --pill-shadow:0 12px 34px rgba(0,0,0,.45);
    --track:rgba(255,255,255,.07);
    --alert-bg:rgba(255,107,107,.12);--alert-b:rgba(255,107,107,.28);--alert-fg:#ffb3b3;
  }
  .wrap[data-theme="light"]{
    --panel-top:rgba(255,255,255,.985);--panel-bot:rgba(246,248,252,.985);
    --line:rgba(20,28,45,.14);--line-soft:rgba(20,28,45,.09);
    --txt:#141a26;--txt2:#2c3444;--txt3:#586174;--txt4:#6c7588;
    --card:rgba(20,28,45,.035);--card-b:rgba(20,28,45,.08);
    --hover:rgba(20,28,45,.05);
    --pill1:#ffffff;--pill2:#eef1f7;
    --thumb1:#e6eaf2;--thumb2:#d9dfea;
    --pos:#0f9d63;--neg:#d64545;
    --shadow:0 22px 60px rgba(20,28,45,.22);
    --pill-shadow:0 10px 26px rgba(20,28,45,.18);
    --track:rgba(20,28,45,.08);
    --alert-bg:rgba(214,69,69,.08);--alert-b:rgba(214,69,69,.3);--alert-fg:#b42318;
  }

  .pill{display:flex;align-items:center;gap:10px;padding:9px 15px 9px 9px;border-radius:999px;
    background:linear-gradient(135deg,var(--pill1),var(--pill2));border:1px solid var(--line);
    box-shadow:var(--pill-shadow);cursor:pointer;user-select:none;
    transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
  .pill:hover{transform:translateY(-1px);border-color:rgba(241,100,54,.45)}
  .logo{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;
    background:linear-gradient(135deg,#f16436,#ff9a4d);font-size:13px;font-weight:700;color:#fff;
    box-shadow:0 4px 12px rgba(241,100,54,.35)}
  .pill-text{display:flex;flex-direction:column;line-height:1.15}
  .pill-k{font-size:13px;font-weight:650;letter-spacing:.2px}
  .pill-d{font-size:11px;color:var(--txt4)}
  .pill-d.up{color:var(--pos)}
  .pill-d.down{color:var(--neg)}

  .panel{position:absolute;right:0;bottom:calc(100% + 8px);width:440px;max-height:min(80vh,680px);
    display:flex;flex-direction:column;border-radius:16px;overflow:hidden;
    background:linear-gradient(180deg,var(--panel-top),var(--panel-bot));
    border:1px solid var(--line);box-shadow:var(--shadow);
    backdrop-filter:blur(20px) saturate(1.15);animation:pop .16s ease}
  @keyframes pop{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}
  .panel.hide{display:none}
  .panel.below{top:calc(100% + 8px);bottom:auto;animation:popDown .16s ease}
  @keyframes popDown{from{opacity:0;transform:translateY(-6px) scale(.99)}to{opacity:1;transform:none}}

  .head{display:flex;align-items:flex-start;gap:10px;padding:14px 14px 10px}
  .head h1{margin:0;font-size:14px;font-weight:700;letter-spacing:.2px;color:var(--txt)}
  .head .sub{margin-top:2px;font-size:11px;color:var(--txt4);max-width:250px;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  .spacer{flex:1}
  .icon-btn{width:26px;height:26px;border-radius:8px;border:1px solid var(--line);
    background:var(--card);color:var(--txt3);cursor:pointer;display:grid;place-items:center;
    font-size:13px;transition:.15s}
  .icon-btn:hover{background:var(--hover);color:var(--txt)}
  .icon-btn:disabled{opacity:.4;cursor:default}
  .icon-btn svg{width:14px;height:14px;display:block}

  .progress{height:2px;background:var(--track);overflow:hidden}
  .progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#f16436,#ff9a4d);
    transition:width .3s ease}
  .progress.idle{visibility:hidden}

  .tabs{display:flex;gap:4px;padding:0 10px;border-bottom:1px solid var(--line-soft)}
  .tab{flex:1;padding:9px 0;background:none;border:0;border-bottom:2px solid transparent;
    color:var(--txt4);font-size:12px;font-weight:600;cursor:pointer;transition:.15s}
  .tab:hover{color:var(--txt2)}
  .tab.on{color:var(--txt);border-bottom-color:#f16436}

  .body{padding:13px 14px 15px;overflow:auto;flex:1;scrollbar-width:thin;
    scrollbar-color:var(--card-b) transparent}
  .body::-webkit-scrollbar{width:6px}
  .body::-webkit-scrollbar-thumb{background:var(--card-b);border-radius:8px}

  .kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .kpi{padding:12px 13px;border-radius:12px;background:var(--card);
    border:1px solid var(--card-b)}
  .kpi .k{font-size:11px;color:var(--txt3);margin-bottom:4px;display:flex;justify-content:space-between}
  .kpi .v{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.2px;color:var(--txt)}
  .kpi .h{font-size:10.5px;color:var(--txt3);margin-top:4px}
  .up{color:var(--pos)}.down{color:var(--neg)}.flat{color:var(--txt4)}

  .meta{display:flex;gap:14px;flex-wrap:wrap;margin:13px 2px 4px;font-size:11px;color:var(--txt3)}
  .meta b{color:var(--txt2);font-weight:600}

  .row{display:flex;align-items:center;gap:10px;padding:9px 8px;border-radius:10px;cursor:default}
  .row:hover{background:var(--hover)}
  .thumb{width:28px;height:28px;border-radius:8px;flex:0 0 auto;object-fit:cover;
    background:linear-gradient(135deg,var(--thumb1),var(--thumb2));display:grid;place-items:center;
    font-size:11px;font-weight:700;color:var(--txt3);overflow:hidden}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .row-main{min-width:0;flex:1}
  .row-name{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--txt)}
  .row-sub{font-size:10.5px;color:var(--txt3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .row-num{text-align:right;flex:0 0 auto;min-width:66px}
  .row-total{font-size:12.5px;font-weight:650;font-variant-numeric:tabular-nums;color:var(--txt)}
  .row-delta{font-size:10.5px;font-variant-numeric:tabular-nums;margin-top:1px}
  .row-deltas{display:flex;gap:10px;margin-top:3px;font-size:10.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .dl{display:inline-flex;align-items:baseline;gap:3px}
  .dl i{font-style:normal;font-size:9.5px;color:var(--txt4)}
  .dl.up{color:var(--pos)}.dl.down{color:var(--neg)}.dl.flat{color:var(--txt4)}

  .sorts{display:flex;gap:6px;margin-bottom:8px}
  .chip{padding:4px 9px;border-radius:999px;border:1px solid var(--line);
    background:var(--card);color:var(--txt3);font-size:11px;cursor:pointer}
  .chip.on{background:rgba(241,100,54,.16);border-color:rgba(241,100,54,.45);color:#c2410c}
  .wrap[data-theme="dark"] .chip.on{color:#ffb08b}

  .sec-title{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--txt4);
    margin:14px 2px 8px;display:flex;justify-content:space-between;align-items:center}
  .sec-title:first-child{margin-top:2px}

  .pri{padding:9px 10px;border-radius:11px;background:var(--card);
    border:1px solid var(--card-b);margin-bottom:7px}
  .pri-top{display:flex;align-items:center;gap:8px}
  .rank{width:18px;height:18px;border-radius:6px;display:grid;place-items:center;font-size:10px;
    font-weight:700;background:rgba(241,100,54,.18);color:#c2410c;flex:0 0 auto}
  .wrap[data-theme="dark"] .rank{color:#ffb08b}
  .pri-name{font-size:12.5px;font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;color:var(--txt)}
  .pri-score{font-size:11px;color:#c2410c;font-variant-numeric:tabular-nums}
  .wrap[data-theme="dark"] .pri-score{color:#ffb08b}
  .bar{height:4px;border-radius:4px;background:var(--track);margin:7px 0 6px;overflow:hidden}
  .bar i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#f16436,#ff9a4d)}
  .pri-reason{font-size:10.5px;color:var(--txt3);line-height:1.4}

  .ver{display:grid;grid-template-columns:58px 1fr 74px;gap:8px;align-items:center;padding:6px 2px}
  .ver-name{font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--txt2)}
  .ver-bar{height:7px;border-radius:6px;background:var(--track);overflow:hidden}
  .ver-bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#4b7bff,#8b5cf6)}
  .ver-meta{text-align:right;font-size:10.5px;color:var(--txt3)}
  .tag{display:inline-block;padding:1px 6px;border-radius:6px;font-size:10px;margin-left:5px;vertical-align:1px}
  .tag.t0{background:rgba(70,211,154,.15);color:#46d39a}
  .tag.t1{background:rgba(255,193,86,.15);color:#ffc156}
  .tag.t2{background:var(--track);color:var(--txt3)}
  .wrap[data-theme="light"] .tag.t0{background:rgba(15,157,99,.12);color:#0f7a4d}
  .wrap[data-theme="light"] .tag.t1{background:rgba(193,120,0,.14);color:#a16207}

  .note{font-size:10.5px;color:var(--txt4);line-height:1.55;margin-top:10px}
  .alert{margin-bottom:10px;padding:8px 10px;border-radius:9px;background:var(--alert-bg);
    border:1px solid var(--alert-b);color:var(--alert-fg);font-size:11px;line-height:1.5}
  .empty{padding:26px 10px;text-align:center;color:var(--txt3);font-size:12px;line-height:1.7}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;
    border-radius:10px;border:0;cursor:pointer;font-size:12.5px;font-weight:600;color:#fff;
    background:linear-gradient(135deg,#f16436,#ff9147);box-shadow:0 6px 18px rgba(241,100,54,.28)}
  .btn:hover{filter:brightness(1.06)}
  .btn:disabled{opacity:.55;cursor:default;box-shadow:none}
  .btn.ghost{background:var(--card);border:1px solid var(--line);box-shadow:none;color:var(--txt2)}
  input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);
    background:var(--card);color:var(--txt);font-size:12.5px;outline:none;font-family:inherit}
  input::placeholder{color:var(--txt4)}
  input:focus{border-color:rgba(241,100,54,.6);box-shadow:0 0 0 3px rgba(241,100,54,.12)}
  .setup{padding:6px 2px}
  .setup p{font-size:12px;color:var(--txt3);line-height:1.65;margin:0 0 12px}
  .setup .hint{font-size:10.5px;color:var(--txt4);margin-top:9px;line-height:1.6}
  .err{margin-top:9px;font-size:11px;color:var(--neg)}
  .foot{padding:9px 14px 11px;border-top:1px solid var(--line-soft);
    font-size:10px;color:var(--txt3);display:flex;justify-content:space-between;gap:8px}
  .foot a{color:var(--txt3);text-decoration:none}
  .foot a:hover{color:var(--txt2)}
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = CSS;

  var wrap = document.createElement("div");
  wrap.className = "wrap";

  var savedTheme = "dark";
  try { savedTheme = localStorage.getItem("cfdash:theme") || "dark"; } catch (e) {}
  state.theme = savedTheme;
  wrap.dataset.theme = savedTheme;

  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var pill = document.createElement("div");
  pill.className = "pill";
  pill.title = "打开下载分析面板";

  var panel = document.createElement("div");
  panel.className = "panel hide";

  shadow.appendChild(styleEl);
  shadow.appendChild(wrap);
  wrap.appendChild(panel);
  wrap.appendChild(pill);

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function cls(n) { return n > 0 ? "up" : n < 0 ? "down" : "flat"; }

  function ago(ts) {
    if (!ts) return "";
    var d = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (d < 60) return d + " 分钟前";
    var h = Math.round(d / 60);
    if (h < 24) return h + " 小时前";
    return Math.round(h / 24) + " 天前";
  }

  function send(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (res) {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(res || { ok: false, error: "无响应" });
        });
      } catch (e) {
        resolve({ ok: false, error: "扩展已重载，刷新页面后重试" });
      }
    });
  }

  /* ---------- 拖拽 + 点击（位置存 localStorage，纯 UI 状态） ---------- */
  function togglePanel() {
    state.collapsed = !state.collapsed;
    panel.classList.toggle("hide", state.collapsed);
    if (!state.collapsed) { positionPanel(); render(); }
  }

  /* 胶囊靠近视口顶部时，面板改为向下展开，避免点开却看不见 */
  function positionPanel() {
    var r = wrap.getBoundingClientRect();
    var need = Math.min(window.innerHeight * 0.8, 680);
    var roomAbove = r.top - 12;
    var roomBelow = window.innerHeight - r.bottom - 12;
    panel.classList.toggle("below", roomAbove < need && roomBelow > roomAbove);
  }

  (function enableDrag() {
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;

    try {
      var saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (saved && typeof saved.x === "number") {
        var sx0 = Math.min(Math.max(8, saved.x), Math.max(8, window.innerWidth - 140));
        var sy0 = Math.min(Math.max(8, saved.y), Math.max(8, window.innerHeight - 44));
        wrap.style.right = "auto"; wrap.style.left = sx0 + "px";
        wrap.style.top = sy0 + "px"; wrap.style.bottom = "auto";
      }
    } catch (e) {}

    window.addEventListener("resize", function () {
      if (wrap.style.left) {
        var x = Math.min(Math.max(8, parseFloat(wrap.style.left) || 8), Math.max(8, window.innerWidth - wrap.offsetWidth - 8));
        var y = Math.min(Math.max(8, parseFloat(wrap.style.top) || 8), Math.max(8, window.innerHeight - 44));
        wrap.style.left = x + "px"; wrap.style.top = y + "px";
      }
      if (!state.collapsed) positionPanel();
    });

    pill.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      var r = wrap.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { pill.setPointerCapture(e.pointerId); } catch (err) {}
    });

    pill.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      var x = Math.min(Math.max(8, ox + dx), window.innerWidth - wrap.offsetWidth - 8);
      var y = Math.min(Math.max(8, oy + dy), window.innerHeight - 44);
      wrap.style.right = "auto"; wrap.style.bottom = "auto";
      wrap.style.left = x + "px"; wrap.style.top = y + "px";
    });

    pill.addEventListener("pointerup", function (e) {
      if (!dragging) return;
      dragging = false;
      try { pill.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) {
        var r = wrap.getBoundingClientRect();
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (err) {}
        return;
      }
      togglePanel();
    });

    pill.addEventListener("pointercancel", function () { dragging = false; });
  })();

  /* ---------- 数据 ---------- */
  function load(initial) {
    send({ type: "cfd:get" }).then(function (res) {
      if (!res.ok) { state.mode = "error"; state.error = res.error || "读取失败"; render(); return; }
      state.data = res.state;
      if (!res.state.author) state.mode = "setup";
      else state.mode = "main";
      if (!res.state.author) {
        // 未配置时自动展开一次，避免只看到胶囊不知道要点
        try {
          if (!sessionStorage.getItem("cfdash:autoopened")) {
            sessionStorage.setItem("cfdash:autoopened", "1");
            state.collapsed = false;
          }
        } catch (e) {}
      }
      render();
      if (res.state.progress && res.state.progress.running) startPolling();
      else if (initial && res.state.author) maybeRefresh();
    });
  }

  function maybeRefresh() {
    var st = state.data;
    if (!st || !st.author) return;
    if (Date.now() - (st.lastRefresh || 0) > 6 * 3600 * 1000) doRefresh();
  }

  function doRefresh() {
    if (state.busy) return;
    state.busy = true;
    render();
    send({ type: "cfd:refresh" }).then(function (res) {
      if (!res.ok) { state.error = res.error || "刷新失败"; state.busy = false; render(); return; }
      startPolling();
    });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      send({ type: "cfd:get" }).then(function (res) {
        if (!res.ok) return;
        state.data = res.state;
        var p = res.state.progress || {};
        if (!p.running) {
          clearInterval(pollTimer); pollTimer = null; state.busy = false;
          if (res.state.error) state.error = res.state.error;
        }
        render();
      });
    }, 1500);
  }

  function submitSetup() {
    var input = shadow.getElementById("cfd-input");
    var v = input ? input.value.trim() : "";
    if (!v) {
      if (state.data && state.data.author) v = state.data.author.id;
      else { state.error = "请填写用户名或作者 ID"; render(); return; }
    }
    state.error = "";
    state.busy = true;
    render();
    send({ type: "cfd:setup", author: v }).then(function (res) {
      if (!res.ok) { state.busy = false; state.error = res.error || "设置失败"; render(); return; }
      state.mode = "main";
      startPolling();
      render();
    });
  }

  /* ---------- 渲染 ---------- */
  /* innerHTML 仅用于本文件的静态模板；所有来自 cfwidget 的字符串先经 esc() 转义。 */
  function renderPill() {
    var d = state.data;
    var p = (d && d.progress) || {};
    var noAuthor = !d || !d.author;
    var total = 0, delta = null;
    if (d && d.author) {
      var c = S.compute(d, Date.now());
      total = c.totals.today || 0;
      delta = c.totals.d1;
    }

    var main, sub, tone = "";
    if (state.mode === "error") { main = "面板错误"; sub = "点开查看原因"; }
    else if (noAuthor) { main = "未设置"; sub = "点开填写作者名"; }
    else if (p.running) { main = "同步中"; sub = (p.done || 0) + " / " + (p.total || "?"); }
    else if (!total) { main = "无数据"; sub = "点开检查"; }
    else {
      main = S.formatNumber(total);
      if (delta === null) sub = "待次日快照";
      else { sub = S.formatSigned(delta) + " 昨日"; tone = cls(delta); }
    }

    pill.innerHTML =
      '<div class="logo">M</div>' +
      '<div class="pill-text"><span class="pill-k">' + esc(main) + "</span>" +
      '<span class="pill-d ' + tone + '">' + esc(sub) + "</span></div>";
    pill.title = noAuthor ? "未设置 CurseForge 作者名，点开填写" : "打开下载分析面板";
  }

  function renderHead() {
    var d = state.data || {};
    var author = d.author;
    var p = d.progress || {};
    var pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    return (
      '<div class="head">' +
      '<div><h1>MC 下载面板分析</h1><div class="sub">' +
      (author ? esc(author.name) + " · " + (d.lastRefresh ? ago(d.lastRefresh) + "更新" : "等待首次同步") : "CurseForge 作者后台") +
      "</div></div><div class=\"spacer\"></div>" +
      (state.mode === "main"
        ? '<button class="icon-btn" id="cfd-refresh" title="立即刷新"' + (state.busy || p.running ? " disabled" : "") + ">⟳</button>" +
          '<button class="icon-btn" id="cfd-settings" title="更换作者">⚙</button>'
        : "") +
      '<button class="icon-btn" id="cfd-theme" title="日间 / 夜间">' + (state.theme === "light" ? ICON_MOON : ICON_SUN) + "</button>" +
      '<button class="icon-btn" id="cfd-close" title="收起">✕</button>' +
      "</div>" +
      '<div class="progress' + (p.running ? "" : " idle") + '"><i style="width:' + (p.running ? Math.max(4, pct) : 0) + '%"></i></div>' +
      (p.running ? '<div class="progress-label" style="font-size:10px;color:#8b93a5;padding:4px 14px 0">更新中 ' + p.done + "/" + p.total + "</div>" : "")
    );
  }

  function kpi(label, value, hint, tone) {
    return (
      '<div class="kpi"><div class="k"><span>' + esc(label) + "</span></div>" +
      '<div class="v ' + (tone || "") + '">' + esc(value) + "</div>" +
      '<div class="h">' + esc(hint || "") + "</div></div>"
    );
  }

  function renderOverview(c) {
    var t = c.totals;
    var d1 = t.d1, d7 = t.d7, d30 = t.d30;
    var html =
      '<div class="kpis">' +
      kpi("总下载", S.formatNumber(t.today), c.projectCount + " 个项目 · " + c.withFiles + " 个有文件") +
      kpi("昨日增长", S.formatSigned(d1), d1 === null ? "需要至少 2 天数据" : S.formatPct(t.d1pct), d1 === null ? "flat" : cls(d1)) +
      kpi("近 7 日", S.formatSigned(d7), d7 === null ? "需要至少 8 天数据" : S.formatPct(t.d7pct), d7 === null ? "flat" : cls(d7)) +
      kpi("近 30 日", S.formatSigned(d30), d30 === null ? "需要至少 31 天数据" : "已积累 " + t.daysCovered + " 天", d30 === null ? "flat" : cls(d30)) +
      "</div>" +
      '<div class="meta"><span>昨日有增长 <b>' + c.growing + "</b></span><span>已积累 <b>" + t.daysCovered + "</b> 天</span>" +
      '<span>最新版本 <b>' + esc(c.latestVersion || "—") + "</b></span></div>" +
      '<div class="sec-title"><span>增长最快</span><span>昨日</span></div>' +
      renderTopGrowth(c);
    return html;
  }

  function renderTopGrowth(c) {
    var rows = c.rows.filter(function (r) { return r.delta1 === null ? false : r.delta1 > 0; })
      .sort(function (a, b) { return (b.delta1 || 0) - (a.delta1 || 0); }).slice(0, 5);
    if (!rows.length) {
      return '<div class="empty">' + (c.totals.daysCovered < 2 ? "昨日增长需要 2 天快照，明天开一次页面即可出现。" : "昨日没有项目增长。") + "</div>";
    }
    return rows.map(function (r) {
      return rowHtml(r, "delta1");
    }).join("");
  }

  function rowHtml(r, mode) {
    var initial = (r.name || "?").slice(0, 1).toUpperCase();
    var thumb = r.thumb
      ? '<div class="thumb"><img src="' + esc(r.thumb) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></div>'
      : '<div class="thumb">' + esc(initial) + "</div>";
    var sub;
    if (mode === "delta1") sub = r.lastUpload ? "最近更新 " + r.lastUpload.slice(5, 10) : "尚无文件";
    else sub = (r.fileCount || 0) + " 个文件" + (r.lastUpload ? " · " + r.lastUpload.slice(0, 10) : "") + (r.staleDays !== null && r.staleDays > 60 ? " · " + r.staleDays + " 天未更新" : "");

    function delta(tag, v, pct) {
      var c = v === null ? "flat" : cls(v);
      var txt = v === null ? "—" : S.formatSigned(v);
      var tip = v === null ? tag + "增长需要更多天快照" : tag + "增长 " + S.formatSigned(v) + (pct !== null && pct !== undefined ? "（" + S.formatPct(pct) + "）" : "");
      return '<span class="dl ' + c + '" title="' + esc(tip) + '"><i>' + tag + "</i>" + esc(txt) + "</span>";
    }

    var deltas = '<div class="row-deltas">' +
      delta("昨日", r.delta1, r.pct1) +
      delta("7日", r.delta7, r.pct7) +
      delta("30日", r.delta30, r.pct30) +
      "</div>";

    var name = r.url
      ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">' + esc(r.name) + "</a>"
      : esc(r.name);
    return '<div class="row">' + thumb +
      '<div class="row-main"><div class="row-name">' + name + '</div><div class="row-sub">' + esc(sub) + "</div>" + deltas + "</div>" +
      '<div class="row-num"><div class="row-total">' + S.formatNumber(r.total) + "</div></div></div>";
  }

  function renderProjects(c) {
    var keys = [["total", "总下载"], ["d1", "昨日"], ["d7", "7 日"], ["d30", "30 日"], ["stale", "最久未更"]];
    var chips = keys.map(function (k) {
      return '<button class="chip' + (state.sortKey === k[0] ? " on" : "") + '" data-sort="' + k[0] + '">' + k[1] + "</button>";
    }).join("");

    var rows = c.rows.slice().sort(function (a, b) {
      var k = state.sortKey;
      var va, vb;
      if (k === "stale") { va = a.staleDays === null ? -1 : a.staleDays; vb = b.staleDays === null ? -1 : b.staleDays; }
      else if (k === "d1") { va = a.delta1 === null ? -1e9 : a.delta1; vb = b.delta1 === null ? -1e9 : b.delta1; }
      else if (k === "d7") { va = a.delta7 === null ? -1e9 : a.delta7; vb = b.delta7 === null ? -1e9 : b.delta7; }
      else if (k === "d30") { va = a.delta30 === null ? -1e9 : a.delta30; vb = b.delta30 === null ? -1e9 : b.delta30; }
      else { va = a.total; vb = b.total; }
      return (va - vb) * state.sortDir;
    });

    return '<div class="sorts">' + chips + "</div>" +
      (rows.length ? rows.map(function (r) { return rowHtml(r, "list"); }).join("")
        : '<div class="empty">还没有项目数据。<br>点右上角刷新开始同步。</div>') +
      '<div class="note">增长率 = 近 7 日增长 ÷ 7 日前的总下载；「—」表示快照天数不足。</div>';
  }

  function renderAnalysis(c) {
    var html = '<div class="sec-title"><span>更新优先级</span><span>0–1</span></div>';
    if (!c.priority.length) html += '<div class="empty">需要项目数据才能排序。</div>';
    else {
      html += c.priority.slice(0, 6).map(function (p, i) {
        return '<div class="pri"><div class="pri-top"><span class="rank">' + (i + 1) + "</span>" +
          '<span class="pri-name">' + esc(p.name) + '</span><span class="pri-score">' + p.score.toFixed(2) + "</span></div>" +
          '<div class="bar"><i style="width:' + Math.max(3, Math.round(p.score * 100)) + '%"></i></div>' +
          '<div class="pri-reason">' + esc(p.reason) + "</div></div>";
      }).join("");
    }

    html += '<div class="sec-title"><span>MC 版本分布</span><span>下载占比</span></div>';
    if (!c.versions.length) html += '<div class="empty">暂无版本数据。</div>';
    else {
      var top = c.versions.slice(0, 8);
      html += top.map(function (v) {
        var tagCls = v.tier === "主力" ? "t0" : v.tier === "维护" ? "t1" : "t2";
        return '<div class="ver"><div class="ver-name">' + esc(v.ver) + "</div>" +
          '<div class="ver-bar"><i style="width:' + Math.max(2, Math.round(v.share * 100)) + '%"></i></div>' +
          '<div class="ver-meta">' + Math.round(v.share * 100) + '%<span class="tag ' + tagCls + '">' + v.tier + "</span></div></div>";
      }).join("");
    }

    if (c.gaps.length) {
      html += '<div class="sec-title"><span>建议优先补的版本</span></div>';
      html += c.gaps.map(function (g) {
        return '<div class="pri-reason" style="margin:2px 2px 8px;font-size:11px;color:#b7bfd0">' +
          "<b>" + esc(g.ver) + "</b>（" + Math.round(g.share * 100) + "% 下载）缺：" +
          esc(g.projects.slice(0, 4).join("、")) + (g.projects.length > 4 ? " 等 " + g.projects.length + " 个" : "") + "</div>";
      }).join("");
    }

    html += '<div class="note">优先级 = 45% 近 7 日相对增速 + 30% 距上次发布天数 + 25% 最新版本缺口。' +
      "版本下载量按文件标注累加，标注多个 MC 版本的文件会重复计数。</div>";
    return html;
  }

  function renderSetup() {
    var d = state.data || {};
    var author = d.author;
    return '<div class="setup">' +
      (author
        ? '<p>当前作者：<b style="color:#fff">' + esc(author.name) + "</b>（ID " + esc(author.id) + "）。输入新的用户名或作者 ID 可切换。</p>"
        : "<p>填写你的 CurseForge 作者名（或作者 ID）后开始同步。面板只读公开数据，不需要登录凭据。</p>") +
      '<input id="cfd-input" placeholder="CurseForge 用户名或作者 ID" value="' + esc(state.setupValue || "") + '" spellcheck="false">' +
      (state.error ? '<div class="err">' + esc(state.error) + "</div>" : "") +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn" id="cfd-save"' + (state.busy ? " disabled" : "") + ">" +
      (state.busy ? "解析中…" : author && !state.setupValue ? "重新同步当前作者" : "开始同步") + "</button>" +
      (author ? '<button class="btn ghost" id="cfd-back">返回面板</button>' : "") +
      "</div>" +
      (author
        ? '<div class="hint" style="margin-top:10px">已积累 ' + Object.keys(d.days || {}).length + " 天快照 · 上次同步 " +
          (d.lastRefresh ? new Date(d.lastRefresh).toLocaleString("zh-CN", { hour12: false }) : "从未") + "</div>"
        : "") +
      (author
        ? '<div style="margin-top:10px"><button class="btn ghost" id="cfd-reset" style="padding:6px 10px;font-size:11px">清空本地快照并重新同步</button></div>'
        : "") +
      '<div class="hint">数据来自 cfwidget（CurseForge 公开数据的第三方镜像），总量与作者后台可能有几个小时延迟。<br>' +
      "「昨日增长」需要至少两天快照，首次同步后第二天才会出现。</div></div>";
  }

  function renderBody() {
    if (state.mode === "loading") return '<div class="empty">正在读取本地数据…</div>';
    if (state.mode === "setup") return renderSetup();
    if (state.mode === "error") return '<div class="empty">' + esc(state.error || "出错了") + '<br><br><button class="btn ghost" id="cfd-retry">重试</button></div>';

    var p = (state.data && state.data.progress) || {};
    var err = state.error || (state.data && state.data.error);
    var alert = err && !p.running ? '<div class="alert">' + esc(err) + "</div>" : "";

    var c = S.compute(state.data, Date.now());
    if (state.tab === "projects") return alert + renderProjects(c);
    if (state.tab === "analysis") return alert + renderAnalysis(c);
    return alert + renderOverview(c);
  }

  function renderInner() {
    renderPill();
    if (state.collapsed) { panel.classList.add("hide"); return; }
    panel.classList.remove("hide");

    var tabs =
      state.mode === "main"
        ? '<div class="tabs">' +
          ["overview:总览", "projects:项目", "analysis:分析"].map(function (t) {
            var kv = t.split(":");
            return '<button class="tab' + (state.tab === kv[0] ? " on" : "") + '" data-tab="' + kv[0] + '">' + kv[1] + "</button>";
          }).join("") + "</div>"
        : "";

    panel.innerHTML = renderHead() + tabs + '<div class="body">' + renderBody() + "</div>" +
      '<div class="foot"><span>数据：cfwidget · 仅本机存储</span><span>' +
      (state.data && state.data.lastRefresh ? "同步于 " + new Date(state.data.lastRefresh).toLocaleString("zh-CN", { hour12: false }).slice(5, -3) : "尚未同步") +
      "</span></div>";

    bindPanelEvents();
  }

  function render() {
    try {
      renderInner();
    } catch (e) {
      var msg = (e && e.message) || String(e);
      pill.innerHTML = '<div class="logo">!</div><div class="pill-text"><span class="pill-k">面板错误</span>' +
        '<span class="pill-d">' + esc(msg.slice(0, 60)) + "</span></div>";
      pill.title = msg;
      try { console.error("[MC下载面板分析]", e); } catch (err) {}
    }
  }

  function bindPanelEvents() {
    var close = shadow.getElementById("cfd-close");
    if (close) close.onclick = function () { state.collapsed = true; render(); };

    var themeBtn = shadow.getElementById("cfd-theme");
    if (themeBtn) themeBtn.onclick = function () {
      var t = state.theme === "dark" ? "light" : "dark";
      state.theme = t;
      wrap.dataset.theme = t;
      try { localStorage.setItem("cfdash:theme", t); } catch (e) {}
      render();
    };

    var refresh = shadow.getElementById("cfd-refresh");
    if (refresh) refresh.onclick = doRefresh;

    var settings = shadow.getElementById("cfd-settings");
    if (settings) settings.onclick = function () {
      state.mode = "setup";
      state.error = "";
      render();
    };

    var back = shadow.getElementById("cfd-back");
    if (back) back.onclick = function () { state.mode = "main"; state.error = ""; render(); };

    var save = shadow.getElementById("cfd-save");
    if (save) save.onclick = submitSetup;

    var input = shadow.getElementById("cfd-input");
    if (input) {
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") submitSetup(); });
      input.addEventListener("input", function () { state.setupValue = input.value; });
    }

    var retry = shadow.getElementById("cfd-retry");
    if (retry) retry.onclick = function () { state.mode = "loading"; load(true); };

    var resetBtn = shadow.getElementById("cfd-reset");
    if (resetBtn) resetBtn.onclick = function () {
      if (!window.confirm("清空本地快照并重新同步？历史增长数据会丢失。")) return;
      state.busy = true;
      render();
      send({ type: "cfd:reset" }).then(function (res) {
        state.busy = false;
        if (!res.ok) { state.error = res.error || "清空失败"; render(); return; }
        state.error = "";
        state.mode = "main";
        load(true);
        startPolling();
      });
    };

    shadow.querySelectorAll("[data-tab]").forEach(function (b) {
      b.onclick = function () { state.tab = b.getAttribute("data-tab"); render(); };
    });

    shadow.querySelectorAll("[data-sort]").forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-sort");
        if (state.sortKey === k) state.sortDir = -state.sortDir;
        else { state.sortKey = k; state.sortDir = -1; }
        render();
      };
    });
  }

  /* ---------- 启动 ---------- */
  render();
  load(true);
})();
