отлично — вот «боевой» план запуска MVP **YouTube→Учёба (Local AI)**.

# Дорожная карта по этапам

**Этап 1 — Скелет и транскрипт**

* Repo: `extension/`, `pwa/`, `shared/`, `README.md`, `LICENSE (MIT)`.
* MV3 манифест, иконка, content script для `youtube.com`.
* Извлечение транскрипта (auto-captions) + fallback для этого видео не доступно расширение
  * Улучшение: YouTube timedtext API (`type=list` + `fmt=vtt`, поддержка `kind=asr`) и парсинг VTT
  * Фолбэк: `ytInitialPlayerResponse.captionTracks[].baseUrl` с надёжным извлечением JSON (баланс скобок)
  * SPA-навигация: повторное извлечение на `yt-navigate-finish` / `popstate`
* Заглушки вызовов **Summarizer/Writer/Rewriter/Proofreader** (интерфейсы).
* UI сайдбара (React/Lit): вкладки **Summary · Timeline · Cards**. ( shadcn ui )
* IndexedDB (Dexie): схема `{videoId, bullets[], terms[], timeline[], cards[]}`.

**Этап 2 — Summarizer + Timeline**

* Чанкование транскрипта, progress-индикатор.
* Вызов **Summarizer** → TL;DR (5–10 пунктов) + разметка блоков.
* Склейка **Timeline** `{start,end,title,oneLiner}`; кликабельные тайм-метки → `YT.player.seekTo`.
* Автотесты на парсинг субтитров и тайм-коды (Vitest).

**Этап 3 — Cards + Simplify**

* **Writer** → 8–12 карточек `{front,back,ts}` из TL;DR.
* **Proofreader** → чистка карточек.
* **Rewriter (Simplify)** для выделенного абзаца (контекстное меню).
* UX: копирование карточки в буфер, кнопка «Regenerate».

**Этап 4 — PWA офлайн + экспорт**

* PWA (React): «My Lectures», просмотр сохранённого офлайн.
* Service Worker (Workbox): cache-first статика.
* Экспорт/импорт JSON (одним файлом для сабмита).
* Связка Extension↔PWA (IndexedDB или message-based экспорт).

**Этап 5 — Полировка и доступность**

* A11y: клавиатура, контраст, aria-лейблы.
* Пустые состояния и ошибки (нет транскрипта, слишком короткое видео).
* Мини-онбординг (3 шага в сайдбаре).
* Локализация UI (en/ru), README — на английском.

**Этап 6 — Деморолик и GitHub**

* Скрипт и запись **видео ≤3 мин** (см. ниже).
* GitHub: публичный, теги, релиз `v0.1.0`, MIT, скриншоты.
* README: установка, как запустить, какие Chrome AI API используются, сценарий проверки для судей.

**Этап 7 — Финальное тестирование и сабмит**

* Smoke-тесты на 3 видео: лекция по алгоритмам, по физике, по дизайну.
* Airplane-mode: проверка PWA и сохранённых данных.
* Чек-лист сабмита Devpost (ниже) и загрузка.

**Финальный резерв**

* Резерв на исправление мелочей + отправка формы Devpost.

---

# Технические задачи (конкретика)

* **Транскрипт:**
  * YouTube timedtext API (вкл. авто‑субтитры `kind=asr`), VTT парсер, SRT парсер.
  * Фолбэк: `ytInitialPlayerResponse` — извлечение JSON с балансом скобок; `captionTracks[].baseUrl`.
  * SPA-навигация: авто‑рефетч при смене видео.
* **Чанкование:** по тайм-кодам или ~2–3k симв; очередь задач с отменой.
* **AI-вызовы (локально):**

  * `summarize(chunk) -> {bullets[], terms[], blocks[]}`
  * `makeCards(tldr) -> Card[]`
  * `proofread(jsonText) -> jsonText`
  * `simplify(text) -> text`
* **Хранилище:** Dexie модели и миграции; cleanup старых записей.
* **YouTube control:** `window.postMessage` ↔ content script, `seekTo(ts)`.
* **PWA:** манифест, SW, офлайн-страницы; общий тип `shared/types.ts`.
* **Тесты:** парсинг srt/vtt; генерация таймлайна; сохранение/загрузка из IndexedDB.

---

# Front (React + shadcn)

Переезд сайдбара на React + shadcn/ui с бандлингом в статические файлы для MV3:

1. Создать `extension/ui-react` (Vite + React + TypeScript + Tailwind).
2. Подключить shadcn/ui, сгенерировать компоненты: Tabs, Button, Card, ScrollArea, Input.
3. Реализовать Sidebar на React, источник данных — текущие API контент-скрипта (`window._ytStudy.extractTranscript`, `window.aiSummarize`).
4. Сборка: `sidebar.bundle.js` и `sidebar.css` выкладывать в `extension/ui/`.
5. В `manifest.json` оставляем подключение `ui/sidebar.js` → меняем на собранный бандл при готовности.
6. A11y: aria-атрибуты, фокус, клавиатура; локализация en/ru.


---

# Mini-prompts (ready to use)

* **Summarizer/Outline:**
  "Create a concise outline of the transcript. Return JSON: `{bullets: [5-10 short bullet points], terms: [key terms]}`. No filler."
* **Summarizer/Time Blocks:**
  "Split into meaningful blocks with timestamps. Return `[{start, end, title, oneLiner}]`."
* **Writer/Cards:**
  "Generate 8–12 Q/A flashcards based on the outline. Format: `[{front, back, ts}]`. Be brief and accurate."
* **Rewriter/Simplify:**
  "Explain in simpler terms (for a 15-year-old), ≤120 words. Keep accuracy and key terms."
* **Proofreader:**
  "Fix grammar and punctuation. Preserve JSON format."

---

# Репозиторий (минимум)

```
/extension
  manifest.json
  /content  extractTranscript.ts  playerControl.ts
  /ui       Sidebar.tsx  styles.css
  /ai       summarize.ts  cards.ts  simplify.ts  proofread.ts
  sw.ts
/pwa
  index.html  main.tsx  sw.js
  /db schema.ts
/shared
  types.ts
README.md
LICENSE
```

---
