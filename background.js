/* 后台：cfwidget 网络封装、每日快照、消息代理。
   所有 fetch 都走 fetchJson（超时 / 非 200 / 非 JSON / 202 排队重试）。 */
"use strict";

const API = "https://api.cfwidget.com";
const KEY = "cfdash:v1";
const MAX_DAYS = 400;
const THROTTLE_MS = 60 * 1000;
const CONCURRENCY = 3;
const FETCH_TIMEOUT = 15000;

let inflight = null;
let progress = { running: false, done: 0, total: 0, error: null };
let lastError = null;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function readState() {
  const raw = await chrome.storage.local.get(KEY);
  return raw[KEY] || { v: 1, days: {}, projects: {}, author: null, lastRefresh: 0 };
}

async function writeState(state) {
  const keys = Object.keys(state.days || {}).sort();
  while (keys.length > MAX_DAYS) delete state.days[keys.shift()];
  await chrome.storage.local.set({ [KEY]: state });
}

function localDayKey(d) {
  const p = (n) => (n < 10 ? "0" + n : String(n));
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* 只回传最近 31 天，够算 30 日增长，避免每条消息塞 400 天数据 */
function publicState(state) {
  const cutoff = Date.now() - 31 * 86400000;
  const startKey = localDayKey(new Date(cutoff));
  const days = {};
  for (const k of Object.keys(state.days || {})) {
    if (k >= startKey) days[k] = state.days[k];
  }
  return {
    v: state.v,
    author: state.author || null,
    projects: state.projects || {},
    days,
    lastRefresh: state.lastRefresh || 0,
    progress,
    error: lastError
  };
}

async function fetchJson(path, tries = 3) {
  let lastErr = new Error("请求失败");
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(API + path, { signal: ctl.signal, headers: { Accept: "application/json" } });
      if (res.status === 202) {
        lastErr = new Error("数据源排队中，稍后重试");
        await sleep(3000);
        continue;
      }
      if (!res.ok) {
        lastErr = new Error("HTTP " + res.status);
        if (res.status === 404) return null;
        if (res.status === 429) { await sleep(4000); continue; }
        await sleep(1000);
        continue;
      }
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("接口可能已变动（返回非 JSON）");
      }
      return data;
    } catch (e) {
      lastErr = e && e.name === "AbortError" ? new Error("请求超时") : e;
      await sleep(800);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function cleanQuery(q) {
  return String(q || "")
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/^members\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^@/, "");
}

async function resolveAuthor(q) {
  const name = cleanQuery(q);
  if (!name) throw new Error("请填写 CurseForge 用户名或作者 ID");
  const path = /^\d+$/.test(name) ? "/author/" + name : "/author/search/" + encodeURIComponent(name);
  const data = await fetchJson(path);
  if (!data || !data.id) throw new Error("未找到该作者（检查用户名拼写）");
  return { id: String(data.id), name: data.username || name };
}

/* 只保留属于当前作者的项目与其快照 */
function pruneToAuthor(state, ids) {
  const keep = new Set(ids.map(String));
  const projects = state.projects || {};
  for (const id of Object.keys(projects)) {
    if (!keep.has(id)) delete projects[id];
  }
  const days = state.days || {};
  for (const dayKey of Object.keys(days)) {
    const day = days[dayKey];
    for (const id of Object.keys(day)) {
      if (!keep.has(id)) delete day[id];
    }
    if (!Object.keys(day).length) delete days[dayKey];
  }
}

function projectFromDetail(d) {
  const files = Array.isArray(d.files) ? d.files : [];
  const versions = {};
  let lastUpload = null;

  for (const f of files) {
    const up = f.uploaded_at || null;
    if (up && (!lastUpload || up > lastUpload)) lastUpload = up;
    const dl = typeof f.downloads === "number" ? f.downloads : 0;
    for (const v of f.versions || []) {
      if (!/^\d+(\.\d+)+$/.test(v)) continue;
      if (!versions[v]) versions[v] = { dl: 0, last: null };
      versions[v].dl += dl;
      if (up && (!versions[v].last || up > versions[v].last)) versions[v].last = up;
    }
  }

  const projectUrl = (d.urls && (d.urls.project || d.urls.curseforge)) || "";
  return {
    id: String(d.id),
    name: d.title || String(d.id),
    slug: projectUrl.split("/").filter(Boolean).pop() || "",
    url: projectUrl,
    thumb: d.thumbnail || "",
    total: (d.downloads && Number(d.downloads.total)) || 0,
    fileCount: files.length,
    lastUpload,
    versions
  };
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function refresh(opts) {
  const force = !!(opts && opts.force);
  if (inflight) return inflight;

  inflight = (async () => {
    const state = await readState();
    if (!state.author || !state.author.id) throw new Error("尚未设置作者");

    if (!force && state.lastRefresh && Date.now() - state.lastRefresh < THROTTLE_MS) {
      return state;
    }

    progress = { running: true, done: 0, total: 0, error: null };
    lastError = null;

    try {
      const author = await fetchJson("/author/" + state.author.id);
      if (!author || !author.projects) throw new Error("作者项目列表获取失败");

      state.author = { id: String(author.id), name: author.username || state.author.name };
      const ids = author.projects.map((p) => String(p.id));
      progress.total = ids.length;

      // 换作者/项目被删后，清掉不属于当前作者的项目与快照，避免两个人的数据混在一起
      pruneToAuthor(state, ids);

      const details = await mapLimit(ids, CONCURRENCY, async (id) => {
        try {
          const d = await fetchJson("/" + id);
          progress.done++;
          if (!d) return { __error: "项目不存在或已隐藏", id };
          return projectFromDetail(d);
        } catch (e) {
          progress.done++;
          return { __error: e.message || String(e), id };
        }
      });

      const todayKey = localDayKey(new Date());
      const day = state.days[todayKey] || {};
      let failed = 0;

      for (const item of details) {
        if (item.__error) {
          failed++;
          // 保留上一份总下载量，不让曲线掉到 0
          const old = state.projects[item.id];
          if (old && day[item.id] === undefined) day[item.id] = old.total || 0;
          continue;
        }
        const prev = day[item.id];
        day[item.id] = prev === undefined ? item.total : Math.max(prev, item.total);
        state.projects[item.id] = item;
      }

      state.days[todayKey] = day;
      state.lastRefresh = Date.now();
      await writeState(state);

      if (failed) lastError = `${failed} 个项目未取到最新数据，已沿用上次快照`;
      progress = { running: false, done: progress.done, total: progress.total, error: null };
      return state;
    } catch (e) {
      lastError = e.message || String(e);
      progress = { running: false, done: progress.done, total: progress.total, error: lastError };
      throw e;
    }
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function startRefresh(force) {
  refresh({ force }).catch(() => {});
}

const hasChrome = typeof chrome !== "undefined" && chrome.runtime && chrome.storage;

if (hasChrome) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        if (!msg || !msg.type) return sendResponse({ ok: false, error: "未知消息" });

        if (msg.type === "cfd:get") {
          return sendResponse({ ok: true, state: publicState(await readState()) });
        }

        if (msg.type === "cfd:setup") {
          const author = await resolveAuthor(msg.author);
          const state = await readState();
          const changed = !state.author || String(state.author.id) !== String(author.id);
          if (changed) {
            // 换作者：旧作者的快照与项目不再适用，直接重置
            state.projects = {};
            state.days = {};
          }
          state.author = author;
          state.lastRefresh = 0;
          await writeState(state);
          startRefresh(true);
          return sendResponse({ ok: true, author, progress });
        }

        if (msg.type === "cfd:refresh") {
          startRefresh(true);
          return sendResponse({ ok: true, progress });
        }

        if (msg.type === "cfd:storage") {
          let bytes = 0;
          try {
            bytes = await chrome.storage.local.getBytesInUse(null);
          } catch (e) {}
          return sendResponse({ ok: true, id: chrome.runtime.id, bytes });
        }

        if (msg.type === "cfd:reset") {
          const state = await readState();
          state.projects = {};
          state.days = {};
          state.lastRefresh = 0;
          await writeState(state);
          progress = { running: false, done: 0, total: 0, error: null };
          lastError = null;
          if (state.author && state.author.id) startRefresh(true);
          return sendResponse({ ok: true });
        }

        return sendResponse({ ok: false, error: "未知消息类型" });
      } catch (e) {
        return sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("cfd-snapshot", { periodInMinutes: 360 });
  });

  chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create("cfd-snapshot", { periodInMinutes: 360 });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== "cfd-snapshot") return;
    readState()
      .then((state) => {
        if (!state.author || !state.author.id) return;
        if (Date.now() - (state.lastRefresh || 0) < 6 * 3600 * 1000) return;
        return refresh({ force: true });
      })
      .catch(() => {});
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = { projectFromDetail, publicState, resolveAuthor, refresh, localDayKey, pruneToAuthor };
}
