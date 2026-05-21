# RAG Document Intelligence

A full-stack Retrieval-Augmented Generation (RAG) application that lets you upload documents and web pages, then ask questions about them using any major LLM provider.

---

## Features

- **Multi-source ingestion** — upload PDFs, DOCX, Markdown, and plain text files, or paste a URL to scrape and index web pages
- **Semantic search** — FAISS-powered vector search using `sentence-transformers` embeddings
- **Cross-encoder reranking** — improves retrieval precision by reranking top candidates before generation
- **Multi-provider LLM support** — works with Google Gemini, OpenAI, Anthropic, Mistral, xAI, Qwen, MiniMax, Meta Llama, and more
- **Per-user isolation** — documents, indexes, and API keys are scoped to individual accounts
- **Chat history** — persisted conversation history with source citations and feedback
- **Document preview** — rendered Markdown with KaTeX math typesetting in the document viewer
- **Admin dashboard** — usage statistics and vector index inspection for staff users
- **Collections** — organise documents into named collections

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Django 6, Django REST Framework |
| Auth | JWT (SimpleJWT) with token blacklisting |
| Vector search | FAISS + `sentence-transformers` |
| Reranking | `cross-encoder/ms-marco-MiniLM-L-6-v2` |
| LLM routing | OpenAI-compatible SDK + Google GenAI SDK |
| Web scraping | BeautifulSoup4, Trafilatura |
| Database | PostgreSQL (SQLite fallback for dev) |
| Frontend | React (Create React App) |
| Math rendering | KaTeX |

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node 18+
- PostgreSQL (or use SQLite for local dev)

### Backend

```bash
# 1. Clone and create virtual environment
git clone https://github.com/Narayan201120/rag_web_app.git
cd rag_web_app/backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env         # edit with your values (see below)

# 4. Run migrations
python manage.py migrate

# 5. Start the dev server
python manage.py runserver
```

### Frontend

```bash
cd frontend
cp .env.example .env         # edit if your backend URL differs
npm install
npm start
```

The app is available at `http://localhost:3000`.

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Django
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Database (omit to use SQLite)
DATABASE_URL=postgresql://user:password@localhost:5432/rag_db
DJANGO_DB_SSL_REQUIRE=false

# JWT
JWT_SECRET_KEY=your-jwt-secret

# CORS (comma-separated)
DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:3000

# Optional: encrypt stored provider API keys
FIELD_ENCRYPTION_KEY=

# Optional: Redis/Celery background tasks
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

For the frontend, create `frontend/.env` from `frontend/.env.example`:

```env
REACT_APP_API_URL=http://127.0.0.1:8000/api
REACT_APP_GOOGLE_CLIENT_ID=
```

When `DJANGO_DEBUG=false`, the backend requires production values for
`DJANGO_SECRET_KEY`, `JWT_SECRET_KEY`, `FIELD_ENCRYPTION_KEY`,
`DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, and `DATABASE_URL`.
Generate `FIELD_ENCRYPTION_KEY` with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sign-up/` | Register a new user |
| POST | `/api/sign-in/` | Obtain JWT access token and refresh cookie |
| POST | `/api/token/refresh/` | Refresh access token from the refresh cookie |
| POST | `/api/logout/` | Blacklist refresh token and clear refresh cookie |
| POST | `/api/auth/social/` | Sign in with a supported social provider |
| GET | `/api/account/` | Get current account details |
| DELETE | `/api/account/delete/` | Delete the current account |
| POST | `/api/forgot-password/` | Request a password reset |
| POST | `/api/reset-password/` | Reset password with a valid token |
| GET/POST | `/api/settings/api-key/` | Get or save LLM provider + API key |
| POST | `/api/settings/api-key/test/` | Test LLM provider connectivity |
| POST | `/api/upload/` | Upload a file |
| POST | `/api/upload-url/` | Ingest a web page or YouTube URL |
| GET | `/api/documents/` | List user documents |
| GET/DELETE | `/api/documents/<filename>/` | Preview or delete a document |
| PUT | `/api/documents/<filename>/move/` | Move a document to a collection |
| GET/POST | `/api/collections/` | List or create document collections |
| POST | `/api/ingest/` | Trigger indexing |
| POST | `/api/ask/` | Ask a single RAG question |
| POST | `/api/chat/` | Ask a question in a persisted conversation |
| GET | `/api/chat/history/` | List conversations |
| GET | `/api/chat/conversations/<conversation_id>/` | Get messages in a conversation |
| POST | `/api/chat/<chat_id>/feedback/` | Submit answer feedback |
| GET | `/api/chat/<chat_id>/citations/` | Get citations for a chat answer |
| GET | `/api/chat/<chat_id>/export/` | Export a chat answer |
| POST | `/api/search/` | Semantic search |
| POST | `/api/search/rerank/` | Semantic search with cross-encoder reranking |
| GET | `/api/search/suggest/?q=<query>` | Search suggestions |
| GET | `/api/tasks/<task_id>/` | Get background task status |
| POST | `/api/tasks/<task_id>/cancel/` | Cancel a background task |
| GET | `/api/status/` | Authenticated system/vector status |
| GET | `/api/admin/usage/` | Staff-only API usage stats |
| GET | `/api/admin/vectors/` | Staff-only vector index stats |
| POST | `/api/evaluate/generate/` | Generate evaluation questions |
| POST | `/api/evaluate/run/` | Run RAG evaluation |
| GET | `/api/evaluate/results/` | List evaluation results |
| GET | `/api/health/` | Health check |

---

## Project Structure

```
rag_web_app/
├── backend/                # Django backend
│   ├── api/                # Django app (views, models, serializers, tasks)
│   │   ├── views.py        # All API endpoints + web scraping + RAG pipeline
│   │   ├── generator.py    # LLM provider routing
│   │   ├── retriever.py    # FAISS index + embedding logic
│   │   └── models.py       # UserProfile, Conversation, ChatMessage, Collection, Task
│   ├── config/             # Django project settings and URL config
│   ├── manage.py
│   └── requirements.txt
├── frontend/               # React application
│   └── src/components/     # Login, Signup, Chat, Documents, Search, Settings, Admin
└── render.yaml             # Render deployment config
```

Uploaded and scraped documents are stored locally under `backend/documents/`.
That directory is ignored by Git because it may contain private user data.

---

## Running Tests

```bash
# Backend (from backend/ directory)
venv\Scripts\python.exe manage.py test

# Frontend (from frontend/ directory)
npm.cmd run test:ci
```

---

## License

MIT
