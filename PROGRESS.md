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
- Migrated Gemini integration from deprecated `google.generativeai` to `google.genai` in `api/generator.py` (with compatibility fallback if new SDK is unavailable at runtime).
- Removed server-default LLM API key usage; answer generation now requires per-user saved provider + API key.
- Added per-user provider selection support (dropdown-backed) with popular providers:
- `google-gemini`, `openai`, `anthropic`, `mistral`, `xai`, `qwen`, `minimax`, `meta-llama`, `other`.
- Added per-user model selection tied to provider (`llm_model`), with provider-specific model lists returned by backend.
- Added backend profile fields for provider-based key storage:
- `UserProfile.llm_provider`
- `UserProfile.llm_api_key` (renamed from `gemini_api_key`).
- `UserProfile.llm_model`
- Added migration `api/migrations/0009_userprofile_llm_provider_and_api_key.py` and applied successfully.
- Added migration `api/migrations/0010_userprofile_llm_model.py` and applied successfully.
- Updated `settings/api-key` API contract:
- `GET` returns current provider/model, supported providers list, provider->models map, and masked key
- `POST` now requires `provider`, `model`, and `api_key` with provider-model validation.
- Added `POST /api/settings/api-key/test/` endpoint to verify provider/model/key connectivity and return provider error messages for incompatibility/tier issues.
- Updated frontend Settings page with provider dropdown + key save flow and no server-default fallback text.
- Updated frontend Settings page with model dropdown that updates when provider changes.
- Added frontend `Test Connection` button in Settings (uses selected provider/model and typed/saved key; displays success or provider error).
- Updated generation routing for all listed providers and now passes through provider API errors (including model access/tier errors) back to users.
- Added backend automated tests in `api/tests.py` for:
- health endpoint
- multi-user document isolation
- chat history
- chat export (JSON + markdown)
- chat feedback
- chat citations
- admin usage (staff/non-staff)
- admin vectors (staff/non-staff)
- auth flows (sign-up/sign-in)
- account endpoint
- forgot/reset password flow
- search endpoint validation/smoke
- task status/cancel flows
- upload endpoint (success + validation)
- upload-url endpoint (validation + task creation)
- ingest endpoint task creation
- collections create/list + duplicate validation
- move document to collection + invalid collection handling
- task transition edge cases (`pending`/`processing` cancel allowed, `completed`/`cancelled` rejected)
- task endpoint user scoping (cross-user status/cancel denied)
- upload edge cases (missing file, alternate `file` key support, per-user file path assertion)
- upload-url edge cases (malformed/unsafe URL rejection)
- Fixed multi-user document isolation bug in backend:
- documents are now stored and served per user directory (`documents/<user_id>/...`)
- upload/list/delete/url-ingest/indexing paths are user-scoped
- retrieval/index loading now respects logged-in user context
- Added regression test for document isolation (`user B` cannot see `user A` documents).
- Migrated all Django and app tables into PostgreSQL successfully.
- Verified end-to-end app flow in UI with PostgreSQL:
- normal user login
- document upload
- ingestion/indexing
- chat answer generation with source citation

## Validation Work Done

- Backend tests now run successfully in venv:
- `venv\Scripts\python.exe manage.py test`
- Result: `Ran 39 tests`, `OK`.
- Deprecation warning for `google.generativeai` no longer appears in current backend test runs.
- JWT HMAC key length warning resolved by configuring explicit `JWT_SECRET_KEY` in `.env` and wiring `SIMPLE_JWT['SIGNING_KEY']` in settings.

- PostgreSQL schema migration run:
- `venv\Scripts\python.exe manage.py migrate`
- Result: all migrations applied for `admin`, `api`, `auth`, `contenttypes`, `sessions`, `token_blacklist`.

- Frontend test command behavior:
- `npm test -- --watchAll=false` fails in PowerShell due to `npm.ps1` execution policy.
- `npm.cmd test -- --watchAll=false` now passes in this environment.
- `npm.cmd test -- --watchAll=false --runInBand` works (single-process mode).
- Added frontend npm script `test:ci` to enforce stable single-process test execution.
- Result: tests pass after fixing default CRA assertion.
- Frontend tests re-validated after provider settings UI update:
- `npm.cmd run test:ci` -> `1 passed`.
- Frontend auth/lint cleanup completed:
- Added token-refresh-aware request handling for `Settings`, `Chat`, and `Documents` API calls to avoid persistent 401s on expired access tokens.
- Fixed React hook dependency warnings by stabilizing callbacks in:
- `frontend/src/components/Settings.js`
- `frontend/src/components/Chat.js`
- `frontend/src/components/Documents.js`
- `npm.cmd run build` now compiles successfully without prior ESLint hook warnings.
- Remaining frontend console output includes Node/react-scripts deprecation notices (`webpack-dev-server`/`fs.F_OK`) due to legacy CRA tooling on Node 24.
- Frontend UI styling refresh applied:
- Updated app theme tokens in `frontend/src/App.css` to a cleaner neutral dark palette (reworked accent, line, destructive, ring, and shadow variables).
- Refined component visuals in `frontend/src/App.css`:
- tighter button/input radii and spacing, cleaner nav/sidebar styles, simplified chat/document card look, updated compose/search/settings/admin visual consistency.
- Updated branding text casing in `frontend/src/App.js`:
- `DOCUMENT INTELLIGENCE`, `SYSTEM ONLINE`.
- Updated search mode controls in `frontend/src/components/Search.js` to use explicit `search-pill` styling class hooks.
- Updated global base styles in `frontend/src/index.css`:
- Inter import and typography alignment, background/foreground token alignment, and polished scrollbar styling.

- Git push status:
- PostgreSQL + test/progress changes pushed in commit `9e70787`.
- Document isolation fix pushed in commit `c097bb5`.

## Current Known Blockers

- No backend dependency blocker in venv for current test command.
- Backend test coverage remains partial but now includes smoke coverage for auth/account/password/search/task, chat history/export, feedback/citations, and admin usage/vector endpoints.

## What Remains Next

- No pending items currently tracked in this progress log.

## Notes For New Sessions

- This file is intended as the running handoff state.
- Previous endpoint reference file `API_ENDPOINTS.md` was intentionally removed and replaced by this consolidated progress log.
- Always work in project virtual environment (`venv`). Use `venv\Scripts\python.exe` for Python commands.
- Frontend test command in this environment: `npm.cmd test -- --watchAll=false`.
- Optional stable single-process script: `npm.cmd run test:ci`.
- Frontend test file updated: `frontend/src/App.test.js` now asserts login heading (`RAG / DOCUMENT AI`) instead of default CRA "learn react" text.
- PostgreSQL local env setup in `.env`:
- `DATABASE_URL=postgresql://postgres:***@localhost:5432/rag_db?sslmode=disable`
- `DJANGO_DB_SSL_REQUIRE=false`
- Local runserver settings in `.env`:
- `DJANGO_DEBUG=true`
- `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1`
