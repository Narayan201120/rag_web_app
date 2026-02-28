# RAG Web App Progress Log

Last updated: February 28, 2026

## Snapshot

- Project type: Django backend + React frontend RAG application.
- Backend API surface previously documented as 30 implemented endpoints.
- Active database: PostgreSQL (`rag_db` on `localhost:5432`).
- Local SQLite file removed after PostgreSQL migration (`db.sqlite3` no longer used).

## What Has Been Completed

- Endpoint coverage was reviewed from the former `API_ENDPOINTS.md` and consolidated here.
- High-level implemented backend areas:
- Auth: signup, signin, token refresh, logout.
- Password flow: forgot/reset password.
- Account: fetch account, delete account.
- RAG/search: ask, search, rerank, suggest.
- Chat/history: chat, history, feedback, citations, export.
- Documents: upload, upload via URL, list, delete, move.
- Collections: list/create.
- User settings: API key get/save.
- System: ingest, status, health.
- Admin: usage stats, vector stats.
- Security features documented: JWT + blacklist, password reset timeout, email uniqueness, anti-enumeration behavior, staff-only admin endpoints, usage tracking, per-user API keys.
- Stack documented: Django/DRF, FAISS, sentence-transformers, cross-encoder reranking, Gemini, BeautifulSoup4, SQLite, React.
- Added first backend automated test: health endpoint in `api/tests.py`.
- Migrated all Django and app tables into PostgreSQL successfully.
- Verified end-to-end app flow in UI with PostgreSQL:
- normal user login
- document upload
- ingestion/indexing
- chat answer generation with source citation

## Validation Work Done

- Backend tests now run successfully in venv:
- `venv\Scripts\python.exe manage.py test`
- Result: `Ran 1 test`, `OK`.
- Warning observed: `google.generativeai` is deprecated in `api/generator.py`.

- PostgreSQL schema migration run:
- `venv\Scripts\python.exe manage.py migrate`
- Result: all migrations applied for `admin`, `api`, `auth`, `contenttypes`, `sessions`, `token_blacklist`.

- Frontend test command behavior:
- `npm test -- --watchAll=false` fails in PowerShell due to `npm.ps1` execution policy.
- `npm.cmd test -- --watchAll=false` fails with `spawn EPERM` (Jest worker process spawn).
- `npm.cmd test -- --watchAll=false --runInBand` works (single-process mode).
- Result: tests pass after fixing default CRA assertion.

## Current Known Blockers

- No backend dependency blocker in venv for current test command.
- Frontend parallel Jest workers are blocked in this environment (`spawn EPERM`); use `--runInBand`.
- Only minimal backend test coverage exists (1 test).

## What Remains Next

- Expand backend tests beyond the current health test.
- Optionally fix environment permissions so frontend tests run without `--runInBand`.
- Migrate from deprecated `google.generativeai` to `google.genai`.
- Extend smoke coverage for remaining flows:
- chat history/export
- feedback/citations endpoints
- admin usage/vector endpoints

## Notes For New Sessions

- This file is intended as the running handoff state.
- Previous endpoint reference file `API_ENDPOINTS.md` was intentionally removed and replaced by this consolidated progress log.
- Always work in project virtual environment (`venv`). Use `venv\Scripts\python.exe` for Python commands.
- Frontend test command to use in this environment: `npm.cmd test -- --watchAll=false --runInBand`.
- Frontend test file updated: `frontend/src/App.test.js` now asserts login heading (`RAG / DOCUMENT AI`) instead of default CRA "learn react" text.
- PostgreSQL local env setup in `.env`:
- `DATABASE_URL=postgresql://postgres:***@localhost:5432/rag_db?sslmode=disable`
- `DJANGO_DB_SSL_REQUIRE=false`
- Local runserver settings in `.env`:
- `DJANGO_DEBUG=true`
- `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1`
