// Runs inside the Douyin guest, without Node or DSH capabilities.
export function installMediaController() {
  if (window.__dshDouyinCompanion) return;
  let action = 'pause';
  let selected = null;
  let selectedSource = '';
  let generation = 0;
  let queued = false;
  let disposed = false;
  let error = '';
  let needsGesture = false;
  const videos = () => [...document.querySelectorAll('video')];
  function selectVideo() {
    return videos().map(video => {
      const r = video.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      return { video, visible: (video.currentSrc || video.src || video.readyState > 0) ? visible : 0 };
    }).sort((a, b) => b.visible - a.visible).find(item => item.visible > 0)?.video;
  }
  function pauseAll() { for (const video of videos()) if (!video.paused) video.pause(); }
  async function play(video, unmute = false) {
    const revision = ++generation;
    const source = video.srcObject || video.currentSrc || video.src;
    const current = () => revision === generation && action === 'play' && !disposed &&
      selected === video && source === (video.srcObject || video.currentSrc || video.src);
    if (unmute) video.muted = false;
    try {
      // Douyin owns live-stream reconnection; an already playing stream needs no extra play().
      if (video.paused) {
        try { await video.play(); }
        catch (e) {
          if (!current()) return;
          if (e.name !== 'NotAllowedError' || unmute) throw e;
          video.muted = true; needsGesture = true;
          await video.play();
        }
      }
      if (current()) error = '';
    } catch (e) {
      // load(), source replacement and live-stream switching cancel play with AbortError.
      if (current() && e.name !== 'AbortError') {
        error = e.message; needsGesture = e.name === 'NotAllowedError';
      }
    } finally {
      // An old request must not pause a newer stream or a resumed task.
      if (action !== 'play' || disposed) pauseAll();
      else if (selected !== video) video.pause();
    }
  }
  function reconcile(force = false) {
    if (disposed) return;
    if (action !== 'play') { pauseAll(); return; }
    const video = selectVideo();
    if (!video) return;
    const source = video.srcObject || video.currentSrc || video.src;
    if (force || selected !== video || selectedSource !== source) {
      selected = video; selectedSource = source; error = ''; needsGesture = false;
      void play(video);
    }
  }
  function schedule() {
    if (queued || disposed) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; reconcile(); });
  }
  function guard(event) { if (action !== 'play' && event.target.tagName === 'VIDEO') event.target.pause(); }
  document.addEventListener('play', guard, true);
  document.addEventListener('loadeddata', schedule, true);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.__dshDouyinCompanion = {
    setAction(next) {
      if (next !== action) { action = next; generation++; reconcile(true); }
      else reconcile();
      return this.snapshot();
    },
    async unmute() {
      needsGesture = false;
      const video = selectVideo();
      if (video && action === 'play') {
        selected = video; selectedSource = video.srcObject || video.currentSrc || video.src;
        await play(video, true);
      }
      return this.snapshot();
    },
    snapshot() {
      const all = videos();
      return { action, videos: all.length, playing: all.filter(v => !v.paused).length,
        muted: selected?.muted ?? true, needsGesture, error };
    },
    dispose() {
      disposed = true; generation++; pauseAll(); observer.disconnect();
      document.removeEventListener('play', guard, true);
      document.removeEventListener('loadeddata', schedule, true);
      delete window.__dshDouyinCompanion;
    },
  };
  pauseAll();
}

export const installScript = `(${installMediaController.toString()})()`;
