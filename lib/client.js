window.__ModuleLoader__.load({id:"dsh-douyin-companion",factory:(require)=>{const module={exports:{}};const exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);

// src/activity.js
function activityFor(sessionId, sessions, statuses, connected = true) {
  if (!connected) return { state: "disconnected" };
  if (!sessionId) return { state: "idle" };
  const related = /* @__PURE__ */ new Set([sessionId]);
  let added;
  do {
    added = false;
    for (const row of Object.values(sessions.byId)) {
      if (row.origin === "subagent" && related.has(row.parentId) && !related.has(row.id)) {
        related.add(row.id);
        added = true;
      }
    }
  } while (added);
  for (const id of related) {
    if (statuses.get(id)?.pendingInteraction) return { state: "awaiting", attentionId: id };
  }
  return { state: [...related].some((id) => statuses.get(id)?.running ?? sessions.byId[id]?.running) ? "thinking" : "idle" };
}
function decisionFor(state) {
  return state === "thinking" || state === "tool" ? "play" : "pause";
}

// src/media.js
function installMediaController() {
  if (window.__dshDouyinCompanion) return;
  let action = "pause";
  let selected = null;
  let selectedSource = "";
  let generation = 0;
  let queued = false;
  let disposed = false;
  let error = "";
  let needsGesture = false;
  const videos = () => [...document.querySelectorAll("video")];
  function selectVideo() {
    return videos().map((video) => {
      const r = video.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      return { video, visible: video.currentSrc || video.src || video.readyState > 0 ? visible : 0 };
    }).sort((a, b) => b.visible - a.visible).find((item) => item.visible > 0)?.video;
  }
  function pauseAll() {
    for (const video of videos()) if (!video.paused) video.pause();
  }
  async function play(video, unmute = false) {
    const revision = ++generation;
    const source = video.srcObject || video.currentSrc || video.src;
    const current = () => revision === generation && action === "play" && !disposed && selected === video && source === (video.srcObject || video.currentSrc || video.src);
    if (unmute) video.muted = false;
    try {
      if (video.paused) {
        try {
          await video.play();
        } catch (e) {
          if (!current()) return;
          if (e.name !== "NotAllowedError" || unmute) throw e;
          video.muted = true;
          needsGesture = true;
          await video.play();
        }
      }
      if (current()) error = "";
    } catch (e) {
      if (current() && e.name !== "AbortError") {
        error = e.message;
        needsGesture = e.name === "NotAllowedError";
      }
    } finally {
      if (action !== "play" || disposed) pauseAll();
      else if (selected !== video) video.pause();
    }
  }
  function reconcile(force = false) {
    if (disposed) return;
    if (action !== "play") {
      pauseAll();
      return;
    }
    const video = selectVideo();
    if (!video) return;
    const source = video.srcObject || video.currentSrc || video.src;
    if (force || selected !== video || selectedSource !== source) {
      selected = video;
      selectedSource = source;
      error = "";
      needsGesture = false;
      void play(video);
    }
  }
  function schedule() {
    if (queued || disposed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      reconcile();
    });
  }
  function guard(event) {
    if (action !== "play" && event.target.tagName === "VIDEO") event.target.pause();
  }
  document.addEventListener("play", guard, true);
  document.addEventListener("loadeddata", schedule, true);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.__dshDouyinCompanion = {
    setAction(next) {
      if (next !== action) {
        action = next;
        generation++;
        reconcile(true);
      } else reconcile();
      return this.snapshot();
    },
    async unmute() {
      needsGesture = false;
      const video = selectVideo();
      if (video && action === "play") {
        selected = video;
        selectedSource = video.srcObject || video.currentSrc || video.src;
        await play(video, true);
      }
      return this.snapshot();
    },
    snapshot() {
      const all = videos();
      return {
        action,
        videos: all.length,
        playing: all.filter((v) => !v.paused).length,
        muted: selected?.muted ?? true,
        needsGesture,
        error
      };
    },
    dispose() {
      disposed = true;
      generation++;
      pauseAll();
      observer.disconnect();
      document.removeEventListener("play", guard, true);
      document.removeEventListener("loadeddata", schedule, true);
      delete window.__dshDouyinCompanion;
    }
  };
  pauseAll();
}
var installScript = `(${installMediaController.toString()})()`;

// src/style.css
var style_default = ".douyin-companion-player{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:#111;color:#f5f5f5;font:13px/1.5 system-ui,sans-serif}\n.douyin-companion-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 12px;background:#1b1b20;border-bottom:1px solid #333;z-index:3}\n.douyin-companion-bar span{flex:1;white-space:nowrap}.douyin-companion-bar label{display:flex;align-items:center;gap:4px;white-space:nowrap}\n.douyin-companion-bar button,.douyin-companion-sound{cursor:pointer;color:inherit;background:#303038;border:1px solid #50505a;border-radius:6px;padding:4px 10px}\n.douyin-companion-frame{flex:1;min-height:0;display:flex}.douyin-companion-webview{width:100%;height:100%;flex:1;border:0;min-height:0;-webkit-app-region:no-drag}\n.douyin-companion-mask{position:absolute;inset:52px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:28px;background:rgba(12,12,18,.82);z-index:2}\n.douyin-companion-mask strong{font-size:20px}.douyin-companion-mask p{max-width:300px;color:#c7c7d4;font-size:14px}\n.douyin-companion-notice{position:absolute;left:12px;right:12px;top:64px;padding:10px 12px;border-radius:8px;background:#252530;z-index:4}.douyin-companion-error{color:#ffb7ba}\n.douyin-companion-sound{position:absolute;right:16px;bottom:20px;background:#dc2557;z-index:3}\n.douyin-companion-launch{border:0;border-radius:8px;padding:6px 9px;cursor:pointer;background:transparent;color:inherit;font:inherit;white-space:nowrap}.douyin-companion-launch:hover{background:#8882}\nhtml:has([data-dockkit-pointer]) .douyin-companion-webview{pointer-events:none}\n";

// src/client.jsx
var inject = ["slots", "sidebarRight", "sidebarRightTabs", "uiSession", "sessions", "connection"];
var KIND = "douyin-companion";
var ID = "dsh-douyin-companion";
var URL = "https://www.douyin.com/";
var SETTING = "dsh.douyin-companion.enabled";
function apply(ctx) {
  const bridge = globalThis.dshDesktop?.browser;
  if (!bridge) throw new Error("\u6296\u97F3\u8054\u52A8\u9700\u8981 DSH \u684C\u9762\u7248");
  const listeners = /* @__PURE__ */ new Set();
  let enabled = localStorage.getItem(SETTING) !== "false";
  let snapshot = { enabled, state: "idle", sessionId: void 0 };
  let pendingOpen;
  const store = {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
  function openPlayer() {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot();
    if (!sessionId) return;
    const existing = ctx.sidebarRight.openTabs.getSnapshot().find((t) => t.sessionId === sessionId && t.kind === KIND);
    if (existing) {
      if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded();
      ctx.sidebarRight.focus(existing.tabId);
    } else ctx.sidebarRight.openTab(KIND);
  }
  function update() {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot();
    const activity = activityFor(
      sessionId,
      ctx.sessions.list.getSnapshot(),
      ctx.uiSession.sessionStatus.getSnapshot(),
      ctx.connection.generation.getSnapshot() !== void 0
    );
    const next = { ...activity, enabled, sessionId };
    if (next.state === snapshot.state && next.sessionId === snapshot.sessionId && next.attentionId === snapshot.attentionId && next.enabled === snapshot.enabled) return;
    snapshot = next;
    for (const listener of listeners) listener();
    clearTimeout(pendingOpen);
    if (enabled && sessionId && (next.state === "thinking" || next.state === "awaiting")) {
      pendingOpen = setTimeout(() => {
        if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return;
        try {
          openPlayer();
        } catch (error) {
          console.error("[douyin-companion] \u6253\u5F00\u4FA7\u680F\u5931\u8D25", error);
        }
      }, 0);
    }
  }
  function toggle() {
    enabled = !enabled;
    localStorage.setItem(SETTING, String(enabled));
    update();
  }
  function Launcher() {
    const state = import_react.default.useSyncExternalStore(store.subscribe, store.getSnapshot);
    return /* @__PURE__ */ import_react.default.createElement("button", { className: "douyin-companion-launch", onClick: openPlayer, title: "\u6253\u5F00\u6296\u97F3\u8054\u52A8\u4FA7\u680F" }, "\u6296\u97F3", state.enabled ? " \xB7 \u81EA\u52A8" : " \xB7 \u5173\u95ED");
  }
  function Player({ useTabInfo, sessionId }) {
    const { tab } = useTabInfo();
    const activity = import_react.default.useSyncExternalStore(store.subscribe, store.getSnapshot);
    const host = import_react.default.useRef(null);
    const guest = import_react.default.useRef(null);
    const ready = import_react.default.useRef(false);
    const [error, setError] = import_react.default.useState("");
    const [media, setMedia] = import_react.default.useState(null);
    const [loading, setLoading] = import_react.default.useState(true);
    const [reload, setReload] = import_react.default.useState(0);
    const visible = tab.visible && activity.sessionId === sessionId;
    const action = activity.enabled && visible ? decisionFor(activity.state) : "pause";
    const desired = import_react.default.useRef(action);
    desired.current = action;
    const control = import_react.default.useRef(null);
    import_react.default.useEffect(() => {
      void control.current?.();
    }, [action]);
    import_react.default.useEffect(() => {
      let ended = false;
      let lease;
      let timer;
      let stopOpen;
      let element;
      const events = new AbortController();
      let inflight = false;
      const report = (e) => {
        if (!ended) setError(e.message || String(e));
      };
      async function sync() {
        if (ended || !ready.current || inflight) return;
        inflight = true;
        const command = desired.current;
        try {
          const result = await element.executeJavaScript(`window.__dshDouyinCompanion?.setAction(${JSON.stringify(command)})`);
          if (!ended && result) setMedia(result);
        } catch (e) {
          report(e);
        } finally {
          inflight = false;
          if (!ended && command !== desired.current) void sync();
        }
      }
      control.current = sync;
      setError("");
      setMedia(null);
      setLoading(true);
      async function mount() {
        const reservation = await bridge.acquire(ID);
        if (ended) {
          await bridge.release(reservation.lease);
          return;
        }
        lease = reservation.lease;
        element = document.createElement("webview");
        element.className = "douyin-companion-webview";
        element.setAttribute("useragent", navigator.userAgent.replace(/ @deepseek-ai\/dsh-desktop\/\S+| Electron\/\S+/g, ""));
        element.setAttribute("name", lease);
        element.setAttribute("partition", reservation.partition);
        element.setAttribute("allowpopups", "");
        element.setAttribute("src", "about:blank#" + lease);
        element.setAttribute("aria-label", "\u6296\u97F3");
        guest.current = element;
        stopOpen = bridge.onOpenRequested(lease, (url) => {
          ctx.sidebarRight.openTab("browser", { params: { url } });
        });
        element.addEventListener("dom-ready", async () => {
          ready.current = false;
          try {
            if (element.getURL().startsWith("about:blank")) {
              await element.loadURL(URL);
              return;
            }
            await element.executeJavaScript(installScript);
            if (ended) return;
            ready.current = true;
            setLoading(false);
            await sync();
          } catch (e) {
            report(e);
          }
        }, { signal: events.signal });
        element.addEventListener("did-start-navigation", (e) => {
          if (e.isMainFrame && !e.isInPlace) ready.current = false;
        }, { signal: events.signal });
        element.addEventListener("did-fail-load", (e) => {
          if (e.isMainFrame && e.errorCode !== -3) {
            setLoading(false);
            report(new Error(`\u6296\u97F3\u52A0\u8F7D\u5931\u8D25\uFF1A${e.errorDescription}`));
          }
        }, { signal: events.signal });
        element.addEventListener("render-process-gone", () => {
          ready.current = false;
          report(new Error("\u89C6\u9891\u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF0C\u8BF7\u5237\u65B0"));
        }, { signal: events.signal });
        host.current.append(element);
        timer = setInterval(sync, 1e3);
      }
      void mount().catch(report);
      return () => {
        ended = true;
        ready.current = false;
        control.current = null;
        clearInterval(timer);
        events.abort();
        stopOpen?.();
        element?.remove();
        guest.current = null;
        if (lease) void bridge.release(lease).catch((e) => console.error("[douyin-companion] \u91CA\u653E\u89C6\u9891\u9875\u9762\u5931\u8D25", e));
      };
    }, [sessionId, reload]);
    const awaiting = activity.state === "awaiting";
    const message = !activity.enabled ? "\u6296\u97F3\u8054\u52A8\u5DF2\u5173\u95ED" : awaiting ? "\u9700\u8981\u4F60\u5BA1\u6838\u6216\u56DE\u7B54" : activity.state === "disconnected" ? "DSH \u8FDE\u63A5\u5DF2\u65AD\u5F00" : "\u7B49\u5F85 Agent \u8FD0\u884C";
    return /* @__PURE__ */ import_react.default.createElement("section", { className: "douyin-companion-player", "data-douyin-companion-state": activity.state, "data-douyin-companion-action": action }, /* @__PURE__ */ import_react.default.createElement("header", { className: "douyin-companion-bar" }, /* @__PURE__ */ import_react.default.createElement("span", null, action === "play" ? "\u25CF Agent \u5DE5\u4F5C\u4E2D" : "\u2161 \u89C6\u9891\u5DF2\u6682\u505C"), /* @__PURE__ */ import_react.default.createElement("label", null, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: activity.enabled, onChange: toggle }), "\u81EA\u52A8\u8054\u52A8"), /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => setReload((r) => r + 1), title: "\u91CD\u65B0\u52A0\u8F7D\u6296\u97F3" }, "\u5237\u65B0")), /* @__PURE__ */ import_react.default.createElement("div", { className: "douyin-companion-frame", ref: host }), loading && /* @__PURE__ */ import_react.default.createElement("div", { className: "douyin-companion-notice" }, "\u6B63\u5728\u6253\u5F00\u6296\u97F3\u2026"), (error || media?.error) && /* @__PURE__ */ import_react.default.createElement("div", { className: "douyin-companion-notice douyin-companion-error", role: "alert" }, error || media.error), action === "play" && media?.playing > 0 && media?.muted && /* @__PURE__ */ import_react.default.createElement("button", { className: "douyin-companion-sound", onClick: async () => {
      try {
        setMedia(await guest.current.executeJavaScript("window.__dshDouyinCompanion.unmute()", true));
      } catch (e) {
        setError(e.message);
      }
    } }, "\u5F00\u542F\u58F0\u97F3"), action === "pause" && visible && /* @__PURE__ */ import_react.default.createElement("div", { className: "douyin-companion-mask", role: awaiting ? "alert" : "status" }, /* @__PURE__ */ import_react.default.createElement("strong", null, message), /* @__PURE__ */ import_react.default.createElement("p", null, awaiting ? "\u89C6\u9891\u5DF2\u6682\u505C\uFF0C\u8BF7\u5728\u5BF9\u8BDD\u533A\u5904\u7406\uFF1BAgent \u7EE7\u7EED\u540E\u81EA\u52A8\u7EED\u64AD\u3002" : "Agent \u5F00\u59CB\u5DE5\u4F5C\u65F6\u4F1A\u81EA\u52A8\u64AD\u653E\u3002")));
  }
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = style_default;
    document.head.append(style);
    return () => style.remove();
  });
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: ID,
    kind: KIND,
    title: () => "\u6296\u97F3\u4F34\u968F",
    keepMounted: true,
    guide: [{ id: "open", title: () => "\u6296\u97F3", description: () => "Agent \u5DE5\u4F5C\u65F6\u64AD\u653E\uFF0C\u5BA1\u6838\u65F6\u6682\u505C", order: 35 }]
  }));
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: ID }, Player)));
  ctx.effect(() => ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({ name: "conversation.session.header.utilities", id: ID, order: 10 }, Launcher)));
  ctx.effect(() => {
    const stops = [ctx.sidebarRight.mounted, ctx.sessions.list, ctx.uiSession.sessionStatus, ctx.connection.generation].map((s) => s.subscribe(update));
    update();
    return () => {
      clearTimeout(pendingOpen);
      stops.forEach((stop) => stop());
      listeners.clear();
    };
  });
}
return module.exports;}});
