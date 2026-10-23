# DocuMind frontend

React + TypeScript single-page app for the DocuMind RAG backend: upload documents,
ask questions with streamed answers, and verify every claim through its citations.

## Stack

- **Vite 7 + React 19 + TypeScript** — build tooling and views
- **react-router-dom** — routing and auth guards
- **react-markdown + remark-gfm** — answer rendering, with a small custom remark
  plugin (`src/components/remarkCitations.ts`) that turns `[1]`-style markers
  into interactive citation chips
- **Hand-written CSS** (`src/styles/`) — design tokens in `tokens.css`, no UI framework
- Native `fetch` — no HTTP client library; the access token lives in memory and the
  refresh token stays in an HttpOnly cookie (`src/lib/api.ts` retries once through
  `POST /api/token/refresh/` on any 401)

## Commands

```bash
npm install        # install dependencies
npm run dev        # dev server on :3000, proxying nothing — calls the API directly
npm run test       # vitest, single pass
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build locally
```

## Configuration

Copy `.env.example` to `.env`:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the Django API (default `http://127.0.0.1:8000/api`) |
| `VITE_GOOGLE_CLIENT_ID` | Enables the Google sign-in button (Google Identity Services) |
| `VITE_MICROSOFT_CLIENT_ID` | Enables Microsoft sign-in (OAuth redirect flow) |
| `VITE_GITHUB_CLIENT_ID` | Enables GitHub sign-in (OAuth redirect flow) |
| `VITE_MOCK` | `1` runs the UI against built-in fixtures, no backend needed |

The backend must list the frontend origin in `DJANGO_CORS_ALLOWED_ORIGINS`
(credentials are sent with every request). Microsoft/GitHub OAuth redirect URIs are
`<origin>/auth/callback/microsoft` and `<origin>/auth/callback/github`.

### Demo mode

`VITE_MOCK=1 npm run dev` starts the app with an in-browser mock of the API
(`src/mocks/`) — streaming answers, task progress, admin data. Useful for design
work and demos; the session survives reloads within a tab.

## Structure

```
src/
  lib/          API client, SSE stream parser, citation parsing, formatting
  state/        Auth provider (silent refresh at boot) and toasts
  components/   Icon set, logo, modal, drawer, markdown renderer
  views/        One module per screen (auth, chat, documents, search,
                evaluation, settings, admin) plus chat/ subcomponents
  mocks/        Fetch-level mock of the backend
  styles/       tokens.css (design tokens) + per-area stylesheets
```

## Design notes

The interface is built around the product's core promise — verifiable answers:

- **Dark is the default theme** (`data-theme='dark'` set pre-paint in `index.html`);
  the light theme remains available via the Appearance toggle in Settings and the
  choice persists in `localStorage`. Both palettes are pure token overrides in
  `src/styles/tokens.css`.
- A deep pine-ink rail on cool paper; the chartreuse **highlighter** color is
  reserved for exactly two jobs: marking the active nav item and highlighting
  retrieved text (`<mark>` in search results, citation chips).
- Newsreader (serif) for statements, Instrument Sans for UI, Spline Sans Mono for
  file names, metadata, and citation markers.
- Answers render `[n]` markers as buttons that open the citations drawer with the
  exact passages.
