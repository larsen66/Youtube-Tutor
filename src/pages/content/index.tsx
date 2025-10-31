import { createRoot } from 'react-dom/client';
const dbg = (...args: any[]) => {
  console.log('[CONTENT]', ...args);
  try { chrome.runtime.sendMessage({ type: 'DEBUG_LOG', from: 'content', args: args.map(String) }); } catch {}
};
const div = document.createElement('div');
document.body.appendChild(div);

const root = createRoot(div);
root.render(
    <div>
      Content from content/index.tsx
    </div>
);

try {
  dbg('content script loaded', window.location.href);
} catch (e) {
  console.error(e);
}

// Respond with current YouTube video ID when asked
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  dbg('onMessage', JSON.stringify(message));
  if (message?.type === 'GET_YT_VIDEO_ID') {
    try {
      const url = new URL(window.location.href);
      const isYouTubeWatch = /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/watch';
      const videoID = isYouTubeWatch ? url.searchParams.get('v') : null;
      dbg('computed videoID', String(videoID), 'isWatch', String(isYouTubeWatch));
      sendResponse({ ok: true, videoID });
    } catch (err: any) {
      dbg('error computing videoID', err?.message || String(err));
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
    // synchronous response; no need to keep channel open
  }
});

// Detect YouTube SPA navigations and notify when the video ID changes
(function setupYouTubeVideoChangeDetection() {
  let lastVideoId: string | null = null;

  const parseVideoId = (): string | null => {
    try {
      const url = new URL(window.location.href);
      const isWatch = /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/watch';
      return isWatch ? url.searchParams.get('v') : null;
    } catch {
      return null;
    }
  };

  const maybeNotifyChange = () => {
    const current = parseVideoId();
    if (current && current !== lastVideoId) {
      lastVideoId = current;
      try {
        dbg('YT_VIDEO_CHANGED', current);
        chrome.runtime.sendMessage({ type: 'YT_VIDEO_CHANGED', payload: { videoID: current } });
      } catch (e) {
        dbg('error sending YT_VIDEO_CHANGED', String(e));
      }
    }
  };

  // Initial check
  lastVideoId = parseVideoId();

  // Listen to YouTube-specific SPA events if available
  window.addEventListener('yt-navigate-finish', maybeNotifyChange, true);
  window.addEventListener('yt-page-data-updated', maybeNotifyChange, true);

  // Intercept history API changes
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = function pushState(this: History, ...args: any[]): void {
    const result = originalPushState.apply(history, args as any);
    queueMicrotask(maybeNotifyChange);
    return result as void;
  } as any;
  history.replaceState = function replaceState(this: History, ...args: any[]): void {
    const result = originalReplaceState.apply(history, args as any);
    queueMicrotask(maybeNotifyChange);
    return result as void;
  } as any;

  window.addEventListener('popstate', maybeNotifyChange);

  // Fallback polling in case events are missed
  const intervalId = window.setInterval(maybeNotifyChange, 1500);

  // Cleanup on unload (best-effort)
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('yt-navigate-finish', maybeNotifyChange, true);
    window.removeEventListener('yt-page-data-updated', maybeNotifyChange, true);
    window.removeEventListener('popstate', maybeNotifyChange);
    try { clearInterval(intervalId); } catch {}
  });
})();
