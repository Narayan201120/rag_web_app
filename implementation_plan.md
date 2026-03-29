# YouTube Transcript Ingestion for RAG Web App

Add YouTube video transcript ingestion as a new source type in the RAG app. Users paste a YouTube URL into the existing "Upload URL" input, and the backend automatically detects it, fetches the transcript with timestamps, and indexes it for RAG queries.

## Proposed Changes

### Backend — Ingestion Pipeline

#### [MODIFY] [views.py](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/backend/api/views.py)

1. **Add YouTube URL detection helper** — `_is_youtube_url(url)` parses the URL and returns the video ID if it matches `youtube.com/watch?v=`, `youtu.be/`, or `m.youtube.com` patterns. Returns `None` otherwise.

2. **Add transcript fetcher** — `_fetch_youtube_transcript(video_id)` uses `youtube-transcript-api` to fetch the transcript, formats it as timestamped text (`[MM:SS] text`), and returns the full content as a string.

3. **Modify [_download_url_to_document()](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/backend/api/views.py#504-622)** — Add a YouTube check at the top (similar to the existing Wikipedia check at line 520). If `_is_youtube_url()` returns a video ID, call `_fetch_youtube_transcript()`, save as [.md](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/README.md) file, and return early. Falls through to existing HTML scraping for non-YouTube URLs.

```diff
 def _download_url_to_document(user_id, url, update=None, is_cancelled=None):
     clean_url = (url or "").strip()
     ...
+    # YouTube transcript ingestion
+    video_id = _is_youtube_url(clean_url)
+    if video_id:
+        if update:
+            update(25, "Fetching YouTube transcript...")
+        transcript_text = _fetch_youtube_transcript(video_id)
+        filename = f"youtube_{video_id}.md"
+        filepath = os.path.join(user_dir, filename)
+        with open(filepath, "w", encoding="utf-8") as f:
+            f.write(transcript_text)
+        return filename
+
     parsed = urlparse(clean_url)
     # Wikipedia check (existing)
     ...
```

---

#### [MODIFY] [requirements.txt](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/backend/requirements.txt)

Add `youtube-transcript-api` to the dependencies.

---

### Frontend — No Changes Needed

The existing URL upload input in [Documents.js](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/frontend/src/components/Documents.js) already sends any URL to `/api/upload-url/`. YouTube URLs will flow through the same UI — no new components needed.

---

## Verification Plan

### Automated Tests

Add new test cases in [tests.py](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/backend/api/tests.py):

1. **`test_is_youtube_url_detects_standard_url`** — Asserts `_is_youtube_url("https://www.youtube.com/watch?v=aircAruvnKk")` returns `"aircAruvnKk"`
2. **`test_is_youtube_url_detects_short_url`** — Asserts `_is_youtube_url("https://youtu.be/aircAruvnKk")` returns `"aircAruvnKk"`
3. **`test_is_youtube_url_returns_none_for_non_youtube`** — Asserts `_is_youtube_url("https://example.com")` returns `None`
4. **`test_upload_url_creates_task_for_youtube_url`** — Patches [_is_safe_user_url](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/backend/api/views.py#85-92) and `submit_task`, sends a YouTube URL to `/api/upload-url/`, asserts 202 response with a pending task (mirrors existing [test_upload_url_creates_pending_task_for_safe_url](file:///c:/Users/naray/OneDrive/Desktop/Projects/rag_web_app/backend/api/tests.py#556-571))

Run tests with:
```bash
cd c:\Users\naray\OneDrive\Desktop\Projects\rag_web_app\backend
python manage.py test api
```

### Manual Verification

After implementation, the user can manually test by:
1. Starting the backend server (`python manage.py runserver`)
2. Starting the frontend (`cd frontend && npm start`)
3. In the app, pasting a YouTube URL (e.g., `https://www.youtube.com/watch?v=aircAruvnKk`) into the URL upload field
4. Verifying the transcript appears in the documents list
5. Asking a question about the video content and checking the RAG response
