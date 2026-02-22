# RAG Web App — API Endpoints

> **Total Endpoints Implemented: 19**

---

## Authentication

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/sign-up/` | POST | ❌ | Register a new user (username, email, password) |
| `/api/sign-in/` | POST | ❌ | Login and receive JWT access + refresh tokens |
| `/api/token/refresh/` | POST | ❌ | Get a new access token using a refresh token |
| `/api/logout/` | POST | ✅ | Blacklist the refresh token (invalidate session) |

## Password Management

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/forgot-password/` | POST | ❌ | Request a password reset token |
| `/api/reset-password/` | POST | ❌ | Reset password using the reset token + uid |

## Account

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/account/` | GET | ✅ | View current user's username and email |
| `/api/account/delete/` | DELETE | ✅ | Permanently delete the account (requires password confirmation) |

## RAG (Retrieval-Augmented Generation)

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/ask/` | POST | ✅ | Ask a question — retrieves relevant docs + generates AI answer |
| `/api/search/` | POST | ✅ | Search documents — returns matching chunks (no AI, fast) |

## Chat (with History)

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/chat/` | POST | ✅ | Ask a question + save Q&A to database |
| `/api/chat/history/` | GET | ✅ | View all past conversations for the logged-in user |

## Document Management

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/upload/` | POST | ✅ | Upload a document (.txt, .md, .pdf, .docx) and re-index |
| `/api/upload-url/` | POST | ✅ | Download a file or scrape a webpage from a URL and index it |
| `/api/documents/` | GET | ✅ | List all documents with file sizes |
| `/api/documents/<filename>/` | DELETE | ✅ | Delete a specific document and rebuild the index |

## Ingestion & System

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/ingest/` | POST | ✅ | Trigger the pipeline to parse, chunk, embed, and index all documents |
| `/api/status/` | GET | ✅ | Check server + vector database connection, chunk count, and system info |
| `/api/health/` | GET | ❌ | Basic health check — confirms the API is running |

---

## Security Features

- **Password Hashing**: PBKDF2-SHA256 with automatic salting (Django default)
- **JWT Tokens**: Access token (30 min) + Refresh token (1 day)
- **Token Blacklisting**: Refresh tokens are invalidated on logout
- **Password Reset Timeout**: Configurable (default 15 min)
- **Email Uniqueness**: Enforced at signup
- **Password Minimum Length**: 8 characters
- **Account Deletion**: Requires password re-entry for confirmation
- **Email Enumeration Prevention**: Forgot-password returns the same message regardless of whether the email exists

## Tech Stack

- **Django 6.0** + **Django REST Framework**
- **JWT Authentication** (djangorestframework-simplejwt)
- **FAISS** (vector search)
- **Sentence Transformers** (all-MiniLM-L6-v2 for embeddings)
- **Google Gemini** (AI answer generation)
- **BeautifulSoup4** (web scraping for URL uploads)
- **SQLite** (database for users, chat history, token blacklist)

---

## Planned Endpoints (To Do)

<!-- Add endpoints you'd like to build next below -->

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

### Ideas to Consider

- [ ] `PUT /api/account/` — Update username or email
- [ ] `POST /api/change-password/` — Change password while logged in
- [ ] `DELETE /api/chat/<id>/` — Delete a specific chat message
- [ ] `DELETE /api/chat/history/` — Clear all chat history
- [ ] `POST /api/documents/rename/` — Rename a document
- [ ] Rate limiting on all endpoints
- [ ] Frontend web UI
