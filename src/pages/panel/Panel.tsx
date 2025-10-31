import React, { useEffect, useRef, useState } from 'react';
import '@pages/panel/Panel.css';
import systemPrompt from '@pages/panel/promt.md?raw';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import StudyMode from './StudyMode';
import PDFExport from './PDFExport';
import Lottie from 'lottie-react';
import emptyChatAnimation from '/public/Emptychat.json';
import loadingScreenAnimation from '/public/loadingscreen.json';

type ViewMode = 'chat' | 'study' | 'pdf';

export default function Panel(): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Array<{ start: string; dur: string; text: string }>>([]);
  const [aiStatus, setAiStatus] = useState<string>('idle');
  const [availability, setAvailability] = useState<string>('unknown');
  const [messages, setMessages] = useState<Array<{ role: 'user'|'assistant'|'system'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [videoTitle, setVideoTitle] = useState<string>('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<any>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const retryRef = useRef<{ attempts: number; timer: number | null }>({ attempts: 0, timer: null });

  const MAX_RETRIES = 20; // ~1 minute with 3s delay
  const RETRY_DELAY_MS = 3000;
  // No typewriter effect; we update assistant bubble directly with incoming stream

  const loadTranscript = async () => {
    try {
      setLoading(true);
      setError(null);
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) =>
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve)
      );
      const tab = tabs[0];
      if (!tab?.id) {
        setError('No active tab');
        // schedule retry if panel opened before the YouTube tab
        if (retryRef.current.attempts < MAX_RETRIES) scheduleRetry();
        return;
      }

      // Extract video title from tab
      if (tab.title) {
        setVideoTitle(tab.title.replace(' - YouTube', ''));
      }

      const vidResp = await new Promise<any>((resolve) =>
        chrome.tabs.sendMessage(tab.id!, { type: 'GET_YT_VIDEO_ID' }, resolve)
      );
      if (!vidResp?.ok || !vidResp?.videoID) {
        setError('Open a YouTube video to see its transcript');
        // schedule retry waiting for user to open video tab
        if (retryRef.current.attempts < MAX_RETRIES) scheduleRetry();
        return;
      }
      const { videoID } = vidResp;
      const trResp = await new Promise<any>((resolve) =>
        chrome.runtime.sendMessage(
          { type: 'GET_TRANSCRIPT', payload: { videoID, lang: 'en' } },
          resolve
        )
      );
      if (trResp?.ok) {
        setLines(trResp.lines || []);
        // reset retry state on success
        retryRef.current.attempts = 0;
        if (retryRef.current.timer) {
          clearTimeout(retryRef.current.timer as any);
          retryRef.current.timer = null;
        }
      } else {
        setError(trResp?.error || 'Failed to fetch transcript');
        if (retryRef.current.attempts < MAX_RETRIES) scheduleRetry();
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      if (retryRef.current.attempts < MAX_RETRIES) scheduleRetry();
    } finally {
      setLoading(false);
    }
  };

  const scheduleRetry = () => {
    // prevent multiple timers
    if (retryRef.current.timer) return;
    retryRef.current.attempts += 1;
    retryRef.current.timer = (setTimeout(async () => {
      retryRef.current.timer = null;
      await loadTranscript();
    }, RETRY_DELAY_MS) as unknown) as number;
  };

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        if (!canceled) await loadTranscript();
      } catch {}
    })();
    const onMessage = (message: any) => {
      if (message?.type === 'YT_VIDEO_CHANGED') {
        // reload transcript for the new video
        // cancel pending retry when we know video changed
        if (retryRef.current.timer) {
          clearTimeout(retryRef.current.timer as any);
          retryRef.current.timer = null;
        }
        retryRef.current.attempts = 0;
        loadTranscript();
      }
    };
    try {
      chrome.runtime.onMessage.addListener(onMessage);
    } catch {}
    return () => {
      canceled = true;
      if (retryRef.current.timer) {
        clearTimeout(retryRef.current.timer as any);
        retryRef.current.timer = null;
      }
      try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    };
  }, []);

  // Auto-initialize AI when transcript is loaded
  useEffect(() => {
    if (lines.length > 0 && aiStatus === 'idle' && !sessionRef.current) {
      initModel();
    }
  }, [lines, aiStatus]);

  const initModel = async () => {
    try {
      setAiStatus('checking');
      const LM = (globalThis as any).LanguageModel;
      if (!LM) {
        setAiStatus('unavailable');
        setError('LanguageModel API not available in this Chrome.');
        return;
      }
      const opts = {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      } as any;
      const avail = await LM.availability(opts);
      setAvailability(String(avail));
      if (avail === 'unavailable') {
        setAiStatus('unavailable');
        setError('Model unavailable. Check Chrome version and on-device model.');
        return;
      }
      setAiStatus('creating');
      const transcriptText = lines.map((l) => l.text).join(' ').slice(0, 12000);
      const params = await LM.params();
      let topK = Number(params?.defaultTopK);
      if (!Number.isFinite(topK) || topK < 1) topK = 3;
      const maxTopK = Number(params?.maxTopK ?? 128);
      topK = Math.min(Math.max(1, Math.floor(topK)), Math.max(1, Math.floor(maxTopK)));
      let temperature = Number(params?.defaultTemperature);
      if (!Number.isFinite(temperature)) temperature = 1;
      const maxTemperature = Number(params?.maxTemperature ?? 2);
      if (temperature < 0) temperature = 0;
      if (temperature > maxTemperature) temperature = maxTemperature;
      const controller = new AbortController();
      const session = await LM.create({
        ...opts,
        monitor(m: any) {
          m.addEventListener('downloadprogress', (e: any) => {
            const pct = Math.round((e.loaded || 0) * 100);
            setAiStatus(`downloading ${pct}%`);
          });
        },
        temperature,
        topK,
        signal: controller.signal,
        initialPrompts: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Transcript (possibly partial):\n${transcriptText}` },
        ],
      });
      sessionRef.current = session;
      setAiStatus('ready');
    } catch (e: any) {
      setAiStatus('error');
      setError(e?.message || String(e));
    }
  };

  const sendPrompt = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    
    // Подготовка ассистентского сообщения
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    
    try {
      const session = sessionRef.current;
      if (!session) {
        setError('AI session not ready. Click Initialize AI first.');
        return;
      }
      setAiStatus('inference');
      setIsStreaming(true);
      
      // Попытка использовать streaming если доступно
      try {
        const stream = await session.promptStreaming(text);
        for await (const chunk of stream) {
          const incoming = String(chunk || '');
          setMessages((prev) => {
            const newMessages = [...prev];
            const idx = newMessages.length - 1;
            const current = newMessages[idx]?.content ?? '';
            let nextContent = current;
            if (incoming.startsWith(current)) {
              // cumulative chunk: replace with the fuller text
              nextContent = incoming;
            } else if (current.startsWith(incoming)) {
              // regression or partial: keep current
              nextContent = current;
            } else {
              // delta chunk: append
              nextContent = current + incoming;
            }
            newMessages[idx] = { role: 'assistant', content: nextContent };
            return newMessages;
          });
        }
        setIsStreaming(false);
        setAiStatus('ready');
      } catch (streamError: any) {
        // Fallback к обычному prompt если streaming не поддерживается
        console.log('Streaming not supported, falling back to regular prompt');
        const result = String(await session.prompt(text));
        setMessages((prev) => {
          const newMessages = [...prev];
          const idx = newMessages.length - 1;
          newMessages[idx] = { role: 'assistant', content: result };
          return newMessages;
        });
        setIsStreaming(false);
        setAiStatus('ready');
      }
    } catch (e: any) {
      setIsStreaming(false);
      setAiStatus('error');
      setError(e?.message || String(e));
    }
  };

  const statusColor = aiStatus.startsWith('downloading') || aiStatus === 'creating' ? 'bg-yellow-500' : aiStatus === 'ready' ? 'bg-green-500' : aiStatus === 'error' ? 'bg-red-500' : 'bg-gray-500';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!settingsRef.current) return;
      if (!settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // Handle mode changes and check if AI is initialized
  const handleModeChange = (mode: ViewMode) => {
    if (mode !== 'chat' && !sessionRef.current) {
      setError('Please initialize AI first before using Study or PDF features');
      return;
    }
    setViewMode(mode);
  };

  // Render different views based on mode
  if (viewMode === 'study') {
    return (
      <StudyMode
        session={sessionRef.current}
        onClose={() => setViewMode('chat')}
        isStreaming={isStreaming}
        setIsStreaming={setIsStreaming}
      />
    );
  }

  if (viewMode === 'pdf') {
    return (
      <PDFExport
        session={sessionRef.current}
        videoTitle={videoTitle}
        transcriptLines={lines}
        onClose={() => setViewMode('chat')}
      />
    );
  }

  return (
    <div className="container h-screen flex flex-col">
      {/* Unified Header with Tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        {/* Left: Mode Tabs */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleModeChange('chat')}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors ${
              viewMode === 'chat'
                ? 'bg-white text-black'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => handleModeChange('study')}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors ${
              viewMode === 'study'
                ? 'bg-white text-black'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Study
          </button>
          <button
            onClick={() => handleModeChange('pdf')}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors ${
              viewMode === 'pdf'
                ? 'bg-white text-black'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Export
          </button>
        </div>

        {/* Right: Status, Settings, and Initialize AI */}
        <div className="flex items-center gap-3">
          {(aiStatus === 'error' || aiStatus === 'unavailable') && (
            <button onClick={initModel} className="btn-primary text-xs rounded-xl">
              Initialize AI
            </button>
          )}
          
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className={`status-dot ${aiStatus === 'ready' ? 'status-ready' : aiStatus.includes('downloading') || aiStatus === 'creating' ? 'status-loading' : aiStatus === 'error' ? 'status-error' : ''}`} />
            <span className="hidden sm:inline">{aiStatus}</span>
          </div>

          <div ref={settingsRef} className="relative">
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className="btn-ghost p-2 text-xs rounded-xl"
              aria-label="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="currentColor"/>
                <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.05 7.05 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 13 2h-4a.5.5 0 0 0-.49.42l-.38 2.65c-.6.22-1.17.52-1.69.88l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98L1.6 14.63a.5.5 0 0 0-.12.64l2 3.46c.13.23.39.32.6.22l2.49-1c.52.36 1.09.66 1.69.88l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.6-.22 1.17-.52 1.69-.88l2.49 1c.21.1.47.01.6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="currentColor"/>
              </svg>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-black/95 border border-white/10 rounded-xl shadow-lg overflow-hidden z-20 animate-fadeIn">
                <button
                  onClick={() => { setShowTranscript(true); setSettingsOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors"
                >
                  View transcript
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        {loading && (
          <div className="text-xs text-white/50 text-center py-2">
            Loading transcript…
          </div>
        )}

        {/* Empty state animation when no messages */}
        {messages.filter((m) => m.role !== 'system').length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <div className="w-48 h-48 mb-4">
              <Lottie animationData={emptyChatAnimation} loop={true} />
            </div>
            <div className="text-center text-white/40 text-sm">
              <p className="mb-1">No messages yet</p>
              <p className="text-xs">Ask a question about the video to get started</p>
            </div>
          </div>
        )}

        {messages
          .filter((m) => m.role !== 'system')
          .map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideUp`}>
              <div
                className={`px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'max-w-[80%] bg-white/20 text-white rounded-2xl'
                    : 'w-full bg-white/5 text-white rounded-2xl border border-white/10'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="markdown-content">
                    {m.content === '' && isStreaming ? (
                      <div className="flex gap-1 items-center py-1">
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                        components={{
                          a: ({ node, ...props }: any) => (
                            <a {...props} target="_blank" rel="noopener noreferrer" />
                          ),
                          code: (props: any) => {
                            const { inline, className, children, ...rest } = props || {};
                            return inline ? (
                              <code className={className} {...rest}>{children}</code>
                            ) : (
                              <pre><code className={className} {...rest}>{children}</code></pre>
                            );
                          },
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    )}
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}

        {messages.some((m) => m.role === 'system') && (
          <div className="text-center text-xs text-white/40 py-2">
            {messages.find((m) => m.role === 'system')?.content}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="px-4 py-3 border-t border-white/10">
        <div className="relative">
          <input
            className="w-full rounded-full py-2.5 pl-4 pr-10 text-sm"
            placeholder="Ask about the video…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendPrompt(); }}
          />
          <button
            onClick={sendPrompt}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-white/5 transition-colors"
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12L21 3L16 21L12 13L3 12Z" fill="currentColor" className="text-white/60" />
            </svg>
          </button>
        </div>
      </div>

      {showTranscript && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-20 backdrop-blur-sm animate-fadeIn">
          <div className="bg-black/95 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-xl border border-white/10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="text-sm font-medium">Transcript</div>
              <button
                onClick={() => setShowTranscript(false)}
                className="text-white/60 hover:text-white transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-y-auto text-white/80 text-sm leading-relaxed space-y-2">
              {lines.length === 0 ? (
                <div className="text-center text-white/50">No transcript found.</div>
              ) : (
                lines.map((l, idx) => (
                  <div key={idx} className="flex gap-3 hover:bg-white/5 p-2 rounded-lg transition-colors">
                    <div className="text-white/40 text-xs font-mono shrink-0 w-16">
                      {Math.floor(parseFloat(l.start) / 60)}:{String(Math.floor(parseFloat(l.start) % 60)).padStart(2, '0')}
                    </div>
                    <div className="flex-1">{l.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading screen overlay - only during initial setup, NOT during inference */}
      {(loading || (aiStatus === 'checking' || aiStatus === 'creating' || aiStatus.startsWith('downloading'))) && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-30 animate-fadeIn">
          <div className="text-center">
            <div className="w-64 h-64 mb-4">
              <Lottie animationData={loadingScreenAnimation} loop={true} />
            </div>
            <div className="text-white/60 text-sm">
              {loading && 'Loading transcript...'}
              {aiStatus === 'checking' && 'Checking AI availability...'}
              {aiStatus === 'creating' && 'Creating AI session...'}
              {aiStatus.startsWith('downloading') && aiStatus}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
