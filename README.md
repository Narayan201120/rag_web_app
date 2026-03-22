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

- Python 3.11+
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
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup/` | Register a new user |
| POST | `/api/auth/signin/` | Obtain JWT access + refresh tokens |
| POST | `/api/auth/refresh/` | Refresh access token |
| POST | `/api/auth/logout/` | Blacklist refresh token |
| GET/POST | `/api/settings/api-key/` | Get or save LLM provider + API key |
| POST | `/api/settings/api-key/test/` | Test LLM provider connectivity |
| POST | `/api/documents/upload/` | Upload a file |
| POST | `/api/documents/upload-url/` | Ingest a URL |
| GET | `/api/documents/list/` | List user documents |
| DELETE | `/api/documents/delete/<id>/` | Delete a document |
| POST | `/api/ingest/` | Trigger indexing |
| POST | `/api/ask/` | Ask a question (RAG) |
| POST | `/api/search/` | Semantic search |
| GET | `/api/history/` | Chat history |
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
│   │   └── models.py       # UserProfile, ChatHistory, Collection, Task
│   ├── config/             # Django project settings and URL config
│   ├── manage.py
│   └── requirements.txt
├── frontend/               # React application
│   └── src/components/     # Login, Signup, Chat, Documents, Search, Settings, Admin
└── render.yaml             # Render deployment config
```

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
