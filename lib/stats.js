/* 指标计算：纯函数，不碰 DOM / 网络。
   Node 下 require 得到 API，扩展里挂到 globalThis.CFDStats。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CFDStats = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAY_MS = 86400000;

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function dateKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function dayStart(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function parseVer(s) {
    if (typeof s !== "string" || !/^\d+(\.\d+)*$/.test(s)) return null;
    return s.split(".").map(Number);
  }

  function cmpVer(a, b) {
    var A = parseVer(a) || [], B = parseVer(b) || [];
    var n = Math.max(A.length, B.length);
    for (var i = 0; i < n; i++) {
      var x = A[i] || 0, y = B[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  function sortVersions(list) {
    return list.slice().sort(cmpVer);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function formatNumber(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    n = Math.round(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K";
    return n.toLocaleString("en-US");
  }

  function formatSigned(n) { return n === null || n === undefined || isNaN(n) ? "—" : (n > 0 ? "+" : "") + formatNumber(n); }

  function formatPct(v) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    var p = v * 100;
    return (p > 0 ? "+" : "") + (Math.abs(p) >= 10 ? p.toFixed(0) : p.toFixed(1)) + "%";
  }

  function daysBetween(aTs, bTs) { return Math.round((dayStart(bTs) - dayStart(aTs)) / DAY_MS); }

  /* 取距 now 往前 offset 天的那份快照；缺失返回 null（不拿更早的凑数，避免口径漂移） */
  function pickDay(days, offset, now) {
    if (!days) return null;
    var key = dateKey(dayStart(now) - offset * DAY_MS);
    return days[key] ? { key: key, data: days[key] } : null;
  }

  function sumSnapshot(snap) {
    if (!snap) return null;
    var t = 0;
    for (var k in snap.data) if (Object.prototype.hasOwnProperty.call(snap.data, k)) t += snap.data[k] || 0;
    return t;
  }

  function allMcVersions(projects) {
    var set = {};
    for (var id in projects) {
      if (!Object.prototype.hasOwnProperty.call(projects, id)) continue;
      var v = projects[id].versions || {};
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) set[k] = 1;
    }
    return sortVersions(Object.keys(set));
  }

  /* 最高版本与「上一个不同主版本线」用于版本缺口判定 */
  function latestTwo(versions) {
    if (!versions.length) return [null, null];
    var latest = versions[versions.length - 1];
    var prev = null;
    for (var i = versions.length - 2; i >= 0; i--) {
      if (cmpVer(versions[i], latest) < 0) { prev = versions[i]; break; }
    }
    return [latest, prev];
  }

  function stateTotals(state, now) {
    var today = pickDay(state.days, 0, now);
    var d1 = pickDay(state.days, 1, now);
    var d7 = pickDay(state.days, 7, now);
    var d30 = pickDay(state.days, 30, now);
    var tToday = sumSnapshot(today);
    var out = {
      today: tToday,
      d1: d1 && today ? tToday - sumSnapshot(d1) : null,
      d7: d7 && today ? tToday - sumSnapshot(d7) : null,
      d30: d30 && today ? tToday - sumSnapshot(d30) : null,
      daysCovered: Object.keys(state.days || {}).length,
      sourceDate: today ? today.key : null
    };
    var base7 = d7 ? sumSnapshot(d7) : null;
    out.d7pct = out.d7 !== null && base7 ? out.d7 / base7 : null;
    var base1 = d1 ? sumSnapshot(d1) : null;
    out.d1pct = out.d1 !== null && base1 ? out.d1 / base1 : null;
    return out;
  }

  function computeRows(state, now) {
    var projects = state.projects || {};
    var days = state.days || {};
    var today = pickDay(days, 0, now);
    var d1 = pickDay(days, 1, now);
    var d7 = pickDay(days, 7, now);
    var d30 = pickDay(days, 30, now);
    var ids = Object.keys(projects);

    return ids.map(function (id) {
      var p = projects[id];
      var total = p.total || 0;
      var todayVal = today && today.data[id] !== undefined ? today.data[id] : null;
      var prev1 = d1 && d1.data[id] !== undefined ? d1.data[id] : null;
      var prev7 = d7 && d7.data[id] !== undefined ? d7.data[id] : null;
      var prev30 = d30 && d30.data[id] !== undefined ? d30.data[id] : null;
      var base = todayVal === null ? total : todayVal;
      var delta1 = prev1 === null || todayVal === null ? null : todayVal - prev1;
      var delta7 = prev7 === null || todayVal === null ? null : todayVal - prev7;
      var delta30 = prev30 === null || todayVal === null ? null : todayVal - prev30;
      var lastTs = p.lastUpload ? Date.parse(p.lastUpload) : null;
      var staleDays = lastTs ? Math.max(0, daysBetween(lastTs, now)) : null;

      return {
        id: id,
        name: p.name || id,
        slug: p.slug || "",
        url: p.url || "",
        thumb: p.thumb || "",
        total: base,
        fileCount: p.fileCount || 0,
        lastUpload: p.lastUpload || null,
        staleDays: staleDays,
        versions: p.versions || {},
        delta1: delta1,
        delta7: delta7,
        delta30: delta30,
        pct1: delta1 !== null && prev1 ? delta1 / prev1 : null,
        pct7: delta7 !== null && prev7 ? delta7 / prev7 : null,
        empty: !p.fileCount
      };
    });
  }

  function priority(rows, projects, now) {
    var versions = allMcVersions(projects);
    var pair = latestTwo(versions);
    var latest = pair[0], prev = pair[1];

    var scored = rows.filter(function (r) { return !r.empty; }).map(function (r) {
      var growth = r.delta7 !== null && r.total - (r.delta7 || 0) > 0
        ? (r.delta7 / Math.max(r.total - r.delta7, 1)) / 0.10
        : 0;
      var growthScore = clamp(growth, 0, 1);
      var staleScore = clamp((r.staleDays === null ? 120 : r.staleDays) / 90, 0, 1);
      var gap = 0;
      if (latest && !r.versions[latest]) gap = 1;
      else if (prev && !r.versions[prev]) gap = 0.6;

      var score = 0.45 * growthScore + 0.30 * staleScore + 0.25 * gap;
      var reasons = [];
      if (gap) reasons.push((latest ? latest : "最新版本") + " 无文件");
      if (r.staleDays !== null && r.staleDays >= 30) reasons.push(r.staleDays + " 天未更新");
      if (r.pct7 !== null && r.pct7 > 0) reasons.push("7 日 " + formatPct(r.pct7));
      if (!reasons.length) reasons.push("状态稳定");

      return {
        id: r.id, name: r.name, url: r.url, score: Math.round(score * 100) / 100,
        growthScore: growthScore, staleScore: staleScore, gap: gap,
        reason: reasons.join(" · "), total: r.total, delta7: r.delta7
      };
    });

    return scored.sort(function (a, b) { return b.score - a.score; });
  }

  function versionBreakdown(projects, rows) {
    var agg = {};
    for (var id in projects) {
      if (!Object.prototype.hasOwnProperty.call(projects, id)) continue;
      var p = projects[id];
      var vs = p.versions || {};
      for (var v in vs) {
        if (!Object.prototype.hasOwnProperty.call(vs, v)) continue;
        if (!agg[v]) agg[v] = { ver: v, downloads: 0, projects: 0, lastUpload: null };
        agg[v].downloads += (vs[v].dl || 0);
        agg[v].projects += 1;
        if (vs[v].last && (!agg[v].lastUpload || vs[v].last > agg[v].lastUpload)) agg[v].lastUpload = vs[v].last;
      }
    }

    var list = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return cmpVer(a.ver, b.ver); });
    var totalDl = list.reduce(function (s, x) { return s + x.downloads; }, 0) || 1;
    var totalProjects = rows.filter(function (r) { return !r.empty; }).length || 1;
    var nowTs = Date.now();

    list.forEach(function (x) {
      x.share = x.downloads / totalDl;
      var recent = x.lastUpload ? daysBetween(Date.parse(x.lastUpload), nowTs) <= 30 : false;
      if (x.share >= 0.2 && recent) x.tier = "主力";
      else if (x.share >= 0.2) x.tier = "维护";
      else if (x.share < 0.05 && !recent) x.tier = "观望";
      else x.tier = "常规";
      x.coverPct = x.projects / totalProjects;
    });

    return list.sort(function (a, b) { return b.downloads - a.downloads; });
  }

  /* 缺版本的项目：按该版本下载占比排序，输出「谁该先补」 */
  function versionGaps(projects, rows, versions) {
    var out = [];
    versions.forEach(function (v) {
      if (v.tier !== "主力" && v.tier !== "维护") return;
      var missing = rows.filter(function (r) { return !r.empty && !(r.versions[v.ver]); });
      if (!missing.length) return;
      out.push({ ver: v.ver, share: v.share, projects: missing.map(function (r) { return r.name; }) });
    });
    return out.slice(0, 3);
  }

  function compute(state, now) {
    now = now || Date.now();
    var projects = state.projects || {};
    var rows = computeRows(state, now);
    var totals = stateTotals(state, now);
    var versions = versionBreakdown(projects, rows);
    var priorityList = priority(rows, projects, now);
    var growing = rows.filter(function (r) { return r.delta1 !== null && r.delta1 > 0; }).length;

    return {
      totals: totals,
      rows: rows,
      priority: priorityList,
      versions: versions,
      gaps: versionGaps(projects, rows, versions),
      withFiles: rows.filter(function (r) { return !r.empty; }).length,
      growing: growing,
      projectCount: rows.length,
      latestVersion: allMcVersions(projects).slice(-1)[0] || null
    };
  }

  return {
    DAY_MS: DAY_MS,
    dateKey: dateKey,
    dayStart: dayStart,
    parseVer: parseVer,
    cmpVer: cmpVer,
    sortVersions: sortVersions,
    formatNumber: formatNumber,
    formatSigned: formatSigned,
    formatPct: formatPct,
    daysBetween: daysBetween,
    pickDay: pickDay,
    allMcVersions: allMcVersions,
    latestTwo: latestTwo,
    compute: compute
  };
});
