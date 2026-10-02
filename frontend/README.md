# Case Files Assistant (frontend)

A small React chat interface for the Filevine RAG API. One page: ask a question about a
client or case, read the answer, see which documents it came from.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. In development the app calls `/api/*` and Vite proxies those
requests to the deployed backend (see `vite.config.ts`), so nothing needs to run locally
and no CORS setup is required.

To point the dev proxy at a backend on your machine, change `BACKEND` in `vite.config.ts`
to `http://localhost:8000`.

## Build and deploy

```bash
npm run build
```

This type-checks the code and writes a static site to `dist/`. Host it anywhere that serves
static files (Render Static Site, Netlify, Vercel, S3).

Two settings matter in production:

| Where | Setting | Value |
|---|---|---|
| Frontend build | `VITE_API_URL` (optional) | API base URL. Defaults to `https://filevine-rag.onrender.com` |
| Backend (Render env) | `ALLOWED_ORIGINS` | Comma-separated list of sites allowed to call the API, e.g. `https://your-frontend.onrender.com` |

Without `ALLOWED_ORIGINS` containing the frontend's exact origin, the browser blocks every
request (CORS). Do not set it to `*`: the API serves confidential case documents.

## How it works

```
src/
├── main.tsx                 entry point
├── App.tsx                  page layout, wires the pieces together
├── config.ts                API base URL, timeouts
├── api.ts                   the only file that talks to the backend (POST /chat)
├── types.ts                 shared types
├── hooks/
│   ├── useChat.ts           conversation state: send, retry, stop, reset, session id
│   ├── useReveal.ts         prints an answer progressively, word by word
│   └── useStickToBottom.ts  keeps the thread scrolled to the newest text
├── components/
│   ├── Header.tsx           title and "New conversation"
│   ├── EmptyState.tsx       first-screen guidance and starter prompts
│   ├── Message.tsx          user bubble, answer, pending and error states
│   ├── Sources.tsx          documents an answer was drawn from
│   └── Composer.tsx         message box (Enter sends, Shift+Enter adds a line)
└── styles.css               all styling; colours and sizes are CSS variables at the top
```

**Conversation memory.** The backend returns a `session_id` with every answer. The app
sends it back with the next question so follow-ups ("the second one", "same for medical
bills") keep their context. The id and the messages live in `sessionStorage`: they survive
a reload and disappear when the tab closes. "New conversation" drops the id.

**Answer printing.** `POST /chat` returns the whole answer in one JSON response, so the
progressive printing is done in the browser (`useReveal`). If the backend later exposes a
real streaming endpoint (Server-Sent Events), replace `sendChat` in `api.ts` and feed the
chunks into the message text; the rest of the UI does not change.

**Slow first answer.** The backend sleeps when idle and can take up to a minute to wake.
The app says so after 8 seconds and gives up after 2 minutes with a "Try again" button.

**Accessibility.** Labelled input, full keyboard operation, visible focus, AA contrast in
light and dark themes, each finished answer announced once to screen readers, and no
animation for users who ask for reduced motion.
