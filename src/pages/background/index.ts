import { getSubtitles } from 'youtube-caption-extractor';
const DEBUG = true;
const dbg = (...args: any[]) => {
  console.log('[background]', ...args);
  try {
    chrome.runtime.sendMessage({ type: 'DEBUG_LOG', from: 'background', args: args.map(String) });
  } catch {}
};

dbg('background script loaded');
// @ts-ignore
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: any) => dbg('sidePanel.setPanelBehavior error', error));

// no manual parsing or injection — rely solely on youtube-caption-extractor

// Handle transcript requests from panel/content
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (DEBUG) dbg('onMessage', message);
  if (message?.type === 'GET_TRANSCRIPT') {
    const { videoID, lang = 'en' } = message.payload || {};
    if (!videoID) {
      dbg('missing videoID in payload');
      sendResponse({ ok: false, error: 'Missing videoID' });
      return; // no async work, do not keep channel open
    }
    (async () => {
      try {
        dbg('fetching subtitles', { videoID, lang });
        const lines = await getSubtitles({ videoID, lang });
        dbg('fetched subtitles count', lines?.length ?? 0);
        sendResponse({ ok: true, lines });
      } catch (err: any) {
        dbg('getSubtitles error', err?.message || String(err));
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true; // keep message channel open for async response
  }
});
