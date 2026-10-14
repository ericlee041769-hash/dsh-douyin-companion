import React from 'react';
import { activityFor, decisionFor } from './activity.js';
import { installScript } from './media.js';
import css from './style.css';

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'uiSession', 'sessions', 'connection'];
const KIND = 'douyin-companion';
const ID = 'dsh-douyin-companion';
const URL = 'https://www.douyin.com/';
const SETTING = 'dsh.douyin-companion.enabled';

export function apply(ctx) {
  const bridge = globalThis.dshDesktop?.browser;
  if (!bridge) throw new Error('抖音联动需要 DSH 桌面版');
  const listeners = new Set();
  let enabled = localStorage.getItem(SETTING) !== 'false';
  let snapshot = { enabled, state: 'idle', sessionId: undefined };
  let pendingOpen;
  const store = {
    getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  };
  function openPlayer() {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot();
    if (!sessionId) return;
    const existing = ctx.sidebarRight.openTabs.getSnapshot().find(t => t.sessionId === sessionId && t.kind === KIND);
    if (existing) {
      if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded();
      ctx.sidebarRight.focus(existing.tabId);
    } else ctx.sidebarRight.openTab(KIND);
  }
  function update() {
    const sessionId = ctx.sidebarRight.mounted.getSnapshot();
    const activity = activityFor(sessionId, ctx.sessions.list.getSnapshot(), ctx.uiSession.sessionStatus.getSnapshot(),
      ctx.connection.generation.getSnapshot() !== undefined);
    const next = { ...activity, enabled, sessionId };
    if (next.state === snapshot.state && next.sessionId === snapshot.sessionId &&
        next.attentionId === snapshot.attentionId && next.enabled === snapshot.enabled) return;
    snapshot = next;
    for (const listener of listeners) listener();
    clearTimeout(pendingOpen);
    // Sidebar creates the arriving session's surface in the next React commit.
    if (enabled && sessionId && (next.state === 'thinking' || next.state === 'awaiting')) {
      pendingOpen = setTimeout(() => {
        if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return;
        try { openPlayer(); } catch (error) { console.error('[douyin-companion] 打开侧栏失败', error); }
      }, 0);
    }
  }
  function toggle() {
    enabled = !enabled;
    localStorage.setItem(SETTING, String(enabled));
    update();
  }
  function Launcher() {
    const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
    return <button className="douyin-companion-launch" onClick={openPlayer} title="打开抖音联动侧栏">抖音{state.enabled ? ' · 自动' : ' · 关闭'}</button>;
  }
  function Player({ useTabInfo, sessionId }) {
    const { tab } = useTabInfo();
    const activity = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
    const host = React.useRef(null);
    const guest = React.useRef(null);
    const ready = React.useRef(false);
    const [error, setError] = React.useState('');
    const [media, setMedia] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [reload, setReload] = React.useState(0);
    const visible = tab.visible && activity.sessionId === sessionId;
    const action = activity.enabled && visible ? decisionFor(activity.state) : 'pause';
    const desired = React.useRef(action);
    desired.current = action;
    const control = React.useRef(null);
    React.useEffect(() => { void control.current?.(); }, [action]);
    React.useEffect(() => {
      let ended = false;
      let lease;
      let timer;
      let stopOpen;
      let element;
      const events = new AbortController();
      let inflight = false;
      const report = e => { if (!ended) setError(e.message || String(e)); };
      async function sync() {
        if (ended || !ready.current || inflight) return;
        inflight = true;
        const command = desired.current;
        try {
          const result = await element.executeJavaScript(`window.__dshDouyinCompanion?.setAction(${JSON.stringify(command)})`);
          if (!ended && result) setMedia(result);
        } catch (e) { report(e); }
        finally {
          inflight = false;
          if (!ended && command !== desired.current) void sync();
        }
      }
      control.current = sync;
      setError(''); setMedia(null); setLoading(true);
      async function mount() {
        // Share Douyin login storage across conversations; each tab still owns its lease.
        const reservation = await bridge.acquire(ID);
        if (ended) { await bridge.release(reservation.lease); return; }
        lease = reservation.lease;
        element = document.createElement('webview');
        element.className = 'douyin-companion-webview';
        // Use the bundled Chromium version as the browser identity for Douyin.
        element.setAttribute('useragent', navigator.userAgent.replace(/ @deepseek-ai\/dsh-desktop\/\S+| Electron\/\S+/g, ''));
        element.setAttribute('name', lease);
        element.setAttribute('partition', reservation.partition);
        element.setAttribute('allowpopups', '');
        element.setAttribute('src', 'about:blank#' + lease);
        element.setAttribute('aria-label', '抖音');
        guest.current = element;
        stopOpen = bridge.onOpenRequested(lease, url => { ctx.sidebarRight.openTab('browser', { params: { url } }); });
        element.addEventListener('dom-ready', async () => {
          ready.current = false;
          try {
            if (element.getURL().startsWith('about:blank')) { await element.loadURL(URL); return; }
            await element.executeJavaScript(installScript);
            if (ended) return;
            ready.current = true; setLoading(false);
            await sync();
          } catch (e) { report(e); }
        }, { signal: events.signal });
        element.addEventListener('did-start-navigation', e => { if (e.isMainFrame && !e.isInPlace) ready.current = false; }, { signal: events.signal });
        element.addEventListener('did-fail-load', e => {
          if (e.isMainFrame && e.errorCode !== -3) { setLoading(false); report(new Error(`抖音加载失败：${e.errorDescription}`)); }
        }, { signal: events.signal });
        element.addEventListener('render-process-gone', () => { ready.current = false; report(new Error('视频进程已退出，请刷新')); }, { signal: events.signal });
        host.current.append(element);
        // Player health sampling; Agent transitions are subscribed, not polled.
        timer = setInterval(sync, 1000);
      }
      void mount().catch(report);
      return () => {
        ended = true; ready.current = false; control.current = null;
        clearInterval(timer); events.abort(); stopOpen?.();
        element?.remove(); guest.current = null;
        if (lease) void bridge.release(lease).catch(e => console.error('[douyin-companion] 释放视频页面失败', e));
      };
    }, [sessionId, reload]);
    const awaiting = activity.state === 'awaiting';
    const message = !activity.enabled ? '抖音联动已关闭' : awaiting ? '需要你审核或回答' :
      activity.state === 'disconnected' ? 'DSH 连接已断开' : '等待 Agent 运行';
    return <section className="douyin-companion-player" data-douyin-companion-state={activity.state} data-douyin-companion-action={action}>
      <header className="douyin-companion-bar">
        <span>{action === 'play' ? '● Agent 工作中' : 'Ⅱ 视频已暂停'}</span>
        <label><input type="checkbox" checked={activity.enabled} onChange={toggle} />自动联动</label>
        <button onClick={() => setReload(r => r + 1)} title="重新加载抖音">刷新</button>
      </header>
      <div className="douyin-companion-frame" ref={host} />
      {loading && <div className="douyin-companion-notice">正在打开抖音…</div>}
      {(error || media?.error) && <div className="douyin-companion-notice douyin-companion-error" role="alert">{error || media.error}</div>}
      {action === 'play' && media?.playing > 0 && media?.muted && <button className="douyin-companion-sound" onClick={async () => {
        try { setMedia(await guest.current.executeJavaScript('window.__dshDouyinCompanion.unmute()', true)); }
        catch (e) { setError(e.message); }
      }}>开启声音</button>}
      {action === 'pause' && visible && <div className="douyin-companion-mask" role={awaiting ? 'alert' : 'status'}>
        <strong>{message}</strong>
        <p>{awaiting ? '视频已暂停，请在对话区处理；Agent 继续后自动续播。' : 'Agent 开始工作时会自动播放。'}</p>
      </div>}
    </section>;
  }
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    return () => style.remove();
  });
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: ID, kind: KIND, title: () => '抖音伴随', keepMounted: true,
    guide: [{ id: 'open', title: () => '抖音', description: () => 'Agent 工作时播放，审核时暂停', order: 35 }] }));
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID }, Player)));
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: ID, order: 10 }, Launcher)));
  ctx.effect(() => {
    const stops = [ctx.sidebarRight.mounted, ctx.sessions.list, ctx.uiSession.sessionStatus, ctx.connection.generation].map(s => s.subscribe(update));
    update();
    return () => { clearTimeout(pendingOpen); stops.forEach(stop => stop()); listeners.clear(); };
  });
}
