# DocuMind : Interview Questions

## Project Facts

- Purpose: A full-stack retrieval-augmented generation app for uploading documents or web pages and asking questions with source citations.
- Primary technologies: Django 6, Django REST Framework, React 19 with Create React App, PostgreSQL with SQLite development fallback, Sentence Transformers, FAISS, BM25, Celery, and Redis.
- Architecture: A React client calls a Django REST API. The backend extracts and chunks documents, builds dense and lexical retrieval indexes, reranks and compresses context, then calls a selected LLM provider.
- Main components: Django API views, document parsers and URL ingestion, semantic chunker, FAISS/BM25 retriever, cross-encoder reranker, context compressor, LLM provider adapter, Celery tasks, and React screens.
- Database: PostgreSQL in the documented deployment, with SQLite fallback for local development. Django models store users' document metadata, collections, conversations, messages, task state, provider settings, feedback, usage logs, and evaluation data. Document files are stored in per-user directories on disk.
- APIs: DRF endpoints cover signup/signin/refresh/logout, social auth, account settings, upload and URL ingestion, document and collection management, search, chat and SSE streaming, tasks, feedback, evaluation, admin statistics, and health.
- Authentication/authorization: JWT access tokens and a refresh token in an HttpOnly cookie. Authenticated views scope documents and tasks to the current user. Social sign-in supports Google, Microsoft, and GitHub.
- Async/background processing: Celery with Redis handles upload, URL ingestion, and indexing tasks. The Task model records progress and supports status polling and cancellation. If Celery enqueueing fails, submit_task starts a thread in the API process.
- External services: Configurable LLM providers, Google/Microsoft/GitHub OAuth, web page fetches, Wikipedia parsing, and YouTube transcript retrieval.
- Deployment/infrastructure: Docker Compose defines PostgreSQL, Redis, Django, a Celery worker, and React frontend. render.yaml describes a Render backend and PostgreSQL database. GitHub Actions runs backend and frontend checks.
- Testing: Django tests cover auth, user-scoped documents and tasks, ingestion validation, collections, search, chunking/compression, security helpers, logging, and API behavior. The frontend includes a Create React App test.
- Important design decisions: Retrieval combines FAISS dense search and BM25 with reciprocal rank fusion, then applies cross-encoder reranking, overlap removal, and context compression. Chat responses can stream as SSE.
- Known limitations: Uploaded files are local to the backend filesystem. Dense/BM25 indexes are module-level in-memory state, loaded for one current user per process and rebuilt from files. The Celery fallback uses an in-process daemon thread.
- Important implementation details: Semantic chunking groups related sentences; the chat path retrieves up to ten hybrid candidates, reranks to three, removes high-overlap chunks, compresses context, and invokes the chosen provider.

## Must-Know Questions

### Q. How would you explain DocuMind in one minute?

**Suggested answer:** DocuMind lets someone upload documents or add a web page, then ask questions and get answers linked back to relevant sources. The React app sends requests to a Django API, which extracts and chunks the content, searches it with both embeddings and BM25, and uses reranking to choose context for an LLM. It stores document and conversation data by user and can process ingestion in the background with Celery and Redis. One important limit in the current design is that retrieval indexes are held in process memory, so I would revisit that before supporting many users at once. I would describe my own contribution as: "I personally worked on [the parts you actually implemented]."

**Key points to prepare:**
- Explain the upload or URL-ingestion path, retrieval pipeline, answer generation, and citations.
- Mention user accounts and document isolation, plus which parts you personally implemented.

**Likely follow-ups:**
- What problem does it solve for a user?
  - **Suggested answer:** It helps a person search their own documents and web sources without reading every page manually. The citations make it easier to check where an answer came from.
- What is the most technically difficult component?
  - **Suggested answer:** A strong example is the retrieval pipeline, because chunking, hybrid search, reranking, deduplication, and context limits all affect whether the model sees the right evidence. Use the part you personally worked on as your example.
- What would you change before serving many users?
  - **Suggested answer:** I would first replace the single-active-user, in-memory indexes with user-scoped retrieval state that can be shared safely across workers. I would also move uploaded files to durable shared storage and verify the design with concurrent-user tests.

### Q. Walk through a document from upload to an answer.

**Suggested answer:** When a user uploads a supported file, the API checks the request, associates the document with that user, stores the file, and creates a task record. A background task extracts text, splits it into semantically related chunks, and prepares the dense and keyword indexes. When the user asks a question, the backend searches their available content, combines the dense and BM25 rankings, reranks the strongest candidates, removes redundant overlap, and compresses the context. It then calls the selected LLM provider, saves the response and its source information, and streams the answer to the browser when streaming is used.

**Key points to prepare:**
- Upload creates a user-scoped file and task; extraction and indexing happen in a background task.
- A question loads the user's documents, retrieves context, reranks and compresses it, calls the configured provider, and stores chat output and sources.

**Likely follow-ups:**
- Which formats are extracted?
  - **Suggested answer:** The parser handles PDF, DOCX, Markdown, and plain text files. URL ingestion also has specialized paths for sources such as Wikipedia and YouTube transcripts.
- How does the client learn that ingestion finished?
  - **Suggested answer:** The API returns a task identifier, and the client checks the task endpoint for progress and a final state such as completed or failed. The task record also carries progress and a status message.
- What happens if extraction fails?
  - **Suggested answer:** The task runner catches the exception, marks the task failed, records an error, and sets its finish time. The client can then show that the upload did not complete instead of treating the file as indexed.

### Q. Explain the current retrieval pipeline.

**Suggested answer:** First, the question is embedded and compared with the document chunks in FAISS, while BM25 separately finds chunks with matching terms. The two ranked lists are combined with reciprocal rank fusion, which lets us use rank positions without comparing unlike score scales. The system reranks the strongest candidates with a cross-encoder, keeps a small set of useful passages, filters excessive overlap, and compresses the context before sending it to the LLM. The current chat path retrieves up to ten hybrid candidates and reranks them down to three.

**Key points to prepare:**
- Semantic chunks are indexed in FAISS and BM25.
- Hybrid search fuses dense and lexical results with RRF, then a cross-encoder ranks candidates, overlapping chunks are removed, and context is compressed.

**Likely follow-ups:**
- Why retrieve ten and rerank to three?
  - **Suggested answer:** Retrieving ten gives the system a broader candidate set, which helps recall, while a more expensive cross-encoder then selects three stronger passages. The smaller final set saves context tokens and reduces unrelated material sent to the LLM.
- What does RRF contribute?
  - **Suggested answer:** RRF adds a contribution based on each chunk's rank in the dense and BM25 lists. In this implementation the constant is 60; that softens the effect of small rank differences and avoids adding scores that have different scales.
- What happens if compression fails?
  - **Suggested answer:** The chat path catches a compression error and uses the reranked chunks instead. If compression succeeds but removes every chunk, it also falls back to those reranked chunks so the model still receives evidence.

### Q. Why combine dense search and BM25?

**Suggested answer:** Dense search is useful when the question and the source use different words but express a similar idea. BM25 is useful when an exact name, phrase, identifier, or uncommon term matters. Combining their ranked results gives the system both kinds of evidence. Reciprocal rank fusion is a practical way to combine them because it uses each result's position rather than assuming the two search methods produce directly comparable scores.

**Key points to prepare:**
- Dense retrieval can match semantic similarity; BM25 can match exact terms.
- RRF combines ranked lists without requiring their raw scores to share a scale.

**Likely follow-ups:**
- How is BM25 tokenization implemented?
  - **Suggested answer:** The current implementation lowercases each chunk and splits it on whitespace to make the BM25 token lists; the query is normalized the same way. That is simple and predictable, but it does not do sophisticated stemming or language-aware tokenization.
- What does the RRF K value affect?
  - **Suggested answer:** K controls how quickly a rank's contribution shrinks as it appears lower in a list. A larger K makes rank differences less sharp, while a smaller K gives more weight to top-ranked results.
- How would you evaluate hybrid search against dense-only search?
  - **Suggested answer:** I would use the same set of real questions and known relevant chunks for both systems, then compare retrieval metrics such as recall at a chosen cutoff, mean reciprocal rank, or nDCG. I would also inspect examples where BM25 helps exact terms and where dense search helps paraphrases, then check downstream answer faithfulness.

### Q. How does semantic chunking work?

**Suggested answer:** The chunker first splits the extracted text into sentences, then compares neighboring sentence embeddings to decide which sentences are about related ideas. It groups related sentences while respecting a maximum chunk size, so each indexed piece has enough context without becoming too broad. If that semantic step cannot complete, the loader has a paragraph-based fallback. I would compare this approach with fixed-size chunks using retrieval measurements and representative questions, because a better-looking chunk size alone does not prove better answers.

**Key points to prepare:**
- It uses sentence embeddings and cosine similarity to group related sentences, with a maximum chunk size.
- If semantic chunking fails, the loader falls back to paragraph splitting.

**Likely follow-ups:**
- How does chunk size affect retrieval?
  - **Suggested answer:** Small chunks can make a match more precise, but they may separate a fact from the explanation it depends on. Larger chunks preserve more context but can bring irrelevant sentences into the prompt and use more tokens, so I would compare sizes against representative questions.
- What happens to very long sentences?
  - **Suggested answer:** The chunker begins a new chunk when adding the next sentence would exceed the maximum character limit. A single sentence longer than the limit can still form a chunk on its own, so an additional split strategy would be needed if that case must be strictly bounded.
- How would you compare it with fixed-size chunking?
  - **Suggested answer:** I would index the same documents both ways and evaluate retrieval recall and ranking quality on a labeled question set, then compare answer grounding and latency. I would also manually inspect cases where a sentence boundary or topic shift creates a better or worse chunk.

### Q. How are documents isolated between users?

**Suggested answer:** The durable document and task records are associated with a user, API queries use the authenticated user to scope what they can access, and uploaded files are stored under per-user directories. There is a separate limitation in retrieval: the FAISS and BM25 index objects are module-level state and currently hold one active user's data per process. That means overlapping requests for different users and multiple server workers need careful handling; database scoping alone does not make those in-memory indexes safe for concurrent multi-user retrieval. I would move index ownership to a user-aware service or shared durable store and test concurrent access before a multi-user production launch.

**Key points to prepare:**
- Files are placed under a per-user directory, and document/task API queries are scoped to the authenticated user.
- The dense and BM25 index objects are module-level and hold one current user's data per process; explain the consequences for simultaneous users and multiple workers.

**Likely follow-ups:**
- Can two requests for different users overlap while rebuilding indexes?
  - **Suggested answer:** They can overlap in one process, and because index state is module-level, a rebuild for one user can replace or conflict with the state another request expects. I would treat that as a real multi-user correctness risk and make the index lookup explicitly keyed by user before relying on concurrent requests.
- What state is shared across Gunicorn workers?
  - **Suggested answer:** Python module-level objects are shared by requests handled inside one worker process, but they are not shared between separate Gunicorn worker processes. Each worker can therefore have its own model and index state, which can diverge and consume extra memory.
- How would you redesign indexes for concurrent multi-user access?
  - **Suggested answer:** I would make retrieval receive a user or collection scope and load the matching index from a durable shared store, or use a vector service with metadata filtering. I would also make index versions explicit and add tests where different users query and reindex at the same time.

### Q. How do background tasks work?

**Suggested answer:** The API creates a database task record so the work has an identifier and a visible state such as pending, processing, completed, failed, or cancelled. Celery sends the job through Redis to a worker, which performs ingestion or indexing and updates progress. The client can poll the task status and request cancellation, while the task code checks whether cancellation was requested. This gives long-running work a lifecycle outside the original HTTP request, although the current fallback path is less durable than the normal queue.

**Key points to prepare:**
- A database Task row tracks pending, processing, completed, failed, and cancelled states.
- Celery runs the task through Redis; clients poll status and can request cancellation.

**Likely follow-ups:**
- What happens if Redis is unavailable?
  - **Suggested answer:** Celery cannot reliably enqueue the job through its broker, so the current helper catches the enqueue error and starts a daemon thread in the API process. That keeps a development flow usable, but it is not durable and should be visible as a degraded mode.
- How does cancellation reach a running ingestion step?
  - **Suggested answer:** The task helper checks the database task state through an `is_cancelled` callback. Ingestion passes that callback into its longer steps and raises a cancellation exception when it sees the request; the runner then marks the task cancelled.
- Could a task run twice, and how would it stay idempotent?
  - **Suggested answer:** Yes, distributed jobs can be retried or delivered more than once, so I would not assume exactly-once execution. I would make ingestion identify work by task and document version, use safe upserts or replaceable index builds, and ensure a retry cannot create duplicate documents or messages.

### Q. What happens if Celery cannot enqueue a task?

**Suggested answer:** The current `submit_task` helper catches an enqueue failure and starts a daemon thread inside the API process. That can keep work moving in a local or degraded setup, but it is not a durable queue: if that process exits, the task can disappear, and the web server is now doing background work. I would make the degraded state visible in logs and monitoring, and for production I would usually prefer a durable broker or return a clear retryable error over silently treating an in-process thread as equivalent to Celery.

**Key points to prepare:**
- submit_task catches enqueue errors and starts a daemon thread in the API process.
- This keeps some work moving locally but does not provide a durable external queue.

**Likely follow-ups:**
- What happens if the web process exits?
  - **Suggested answer:** A daemon thread running inside that process stops with it, so the work may be lost even if the task record still says it was processing. A durable queue and worker restart policy are needed for reliable production processing.
- How would you expose this degraded mode to operations?
  - **Suggested answer:** I would log the broker failure with the task ID, expose a metric or health signal for fallback executions, and show an explicit degraded status in monitoring. That lets an operator distinguish normal queued work from work that depends on the web process staying alive.
- Would you rather fail the request or use a durable fallback?
  - **Suggested answer:** For production I would prefer a durable fallback queue or a clear retryable response, because a daemon thread can lose work on process restart. The in-process thread is useful as a local convenience, but I would not describe it as equal reliability.

### Q. How are LLM provider keys stored?

**Suggested answer:** The selected provider and model settings are associated with the user's profile. When `FIELD_ENCRYPTION_KEY` is configured, Fernet encryption protects stored provider credentials; the production settings expect a valid encryption key, while development can allow an unencrypted value. I would avoid returning the secret in API responses or writing it to logs. For rotation, I would decrypt existing values with the old key and re-encrypt them with the new key through a controlled migration, while making sure a wrong key fails safely rather than exposing the stored value.

**Key points to prepare:**
- Provider and model settings are stored in UserProfile.
- Fernet encryption is used when FIELD_ENCRYPTION_KEY is configured; production settings require a valid key, while development can store a value without encryption.

**Likely follow-ups:**
- How is the key rotated?
  - **Suggested answer:** The current implementation reads one Fernet key from configuration and does not provide an automatic key-rotation workflow. I would plan a controlled migration that reads each existing value with the old key, encrypts it with the new key, verifies the result, and only then removes the old key.
- What happens when an encrypted value is read with the wrong key?
  - **Suggested answer:** Fernet rejects the value, and the helper logs a decryption error and returns an empty string. That avoids returning the ciphertext as a usable credential, but operators still need a clear recovery path so the user can replace the provider key.
- How should credentials be excluded from logs and API responses?
  - **Suggested answer:** Return only whether a key is configured or a masked hint, never the full value. Log provider names and request IDs for diagnosis, but redact authorization headers, tokens, and credential fields before logging exceptions or request data.

### Q. How does authentication work in the browser?

**Suggested answer:** After sign-in, the browser uses a short-lived JWT access token in API authorization headers. The refresh token is kept in an HttpOnly cookie, which prevents JavaScript from reading that token directly; when the access token expires, the client calls the refresh endpoint to get a new access token. On logout, the API blacklists the refresh token and clears the cookie. In production the cookie needs secure settings appropriate for HTTPS and the deployment's cross-site behavior, and the client should handle both access-token and refresh-token expiry cleanly.

**Key points to prepare:**
- The API uses JWT access tokens; the refresh token is set in an HttpOnly cookie.
- The refresh endpoint returns a new access token, and logout blacklists the refresh token and clears the cookie.

**Likely follow-ups:**
- Why keep the refresh token in an HttpOnly cookie?
  - **Suggested answer:** JavaScript cannot read an HttpOnly cookie, which reduces the chance that an XSS bug can directly steal the refresh token. The browser can still send it to the refresh endpoint, while the short-lived access token is used for ordinary API calls.
- How do production cookie settings differ from development?
  - **Suggested answer:** Production should use HTTPS and set the cookie as Secure, HttpOnly, and with an appropriate SameSite policy and narrow path or domain. Development often needs relaxed settings for local HTTP, so I would verify the actual deployed settings rather than assume them.
- What happens when access and refresh tokens expire?
  - **Suggested answer:** If the access token expires while the refresh token is valid, the client can request a new access token. If refresh also expires or is blacklisted, the refresh call fails and the user needs to sign in again.

### Q. How does URL ingestion limit SSRF risk?

**Suggested answer:** The ingestion path accepts only HTTP or HTTPS URLs, resolves the host, and rejects addresses that point to private or local networks. Generic redirects are not followed, which reduces the chance that a seemingly public URL redirects the server to an internal service; YouTube and Wikipedia use their own specialized handling. There is still a DNS time-of-check/time-of-use risk if the address changes between validation and connection, so I would bind validation to the actual connection or use a hardened fetch layer. I would test localhost, private IPv4 and IPv6 ranges, redirect chains, and DNS edge cases.

**Key points to prepare:**
- User URLs must use HTTP or HTTPS, resolve away from private/local addresses, and generic redirects are not followed.
- YouTube and Wikipedia have specialized handling paths.

**Likely follow-ups:**
- Which IP ranges are rejected?
  - **Suggested answer:** The helper rejects hostnames resolving to local or non-public addresses, including loopback, private, and link-local destinations. I would name the exact IPv4 and IPv6 cases only after checking the validator implementation for the current branch.
- Can DNS change between validation and connection?
  - **Suggested answer:** Yes. If the code validates one DNS answer and the HTTP client resolves the hostname again later, an attacker could return a public address first and a private address next. A robust fetcher should validate the address it actually connects to and repeat the checks after redirects.
- How would you test redirects and local-address attempts?
  - **Suggested answer:** I would write request-level tests for localhost, private IPv4 and IPv6 addresses, and a public-looking URL that redirects to a local target. I would mock or control DNS answers to test rebinding behavior and assert that no request is made to a rejected destination.

### Q. How does streaming chat reach the UI?

**Suggested answer:** The chat endpoint returns a Django `StreamingHttpResponse` with server-sent events. The React client reads the response as a stream and updates the visible answer as events arrive, rather than waiting for the full generation to finish. The API client also has token-refresh handling around requests. Once streaming has begun, an error needs to be represented as an event because the HTTP status can no longer be changed; the connection should also stop cleanly if the client disconnects, and the final answer and source data should still be persisted consistently.

**Key points to prepare:**
- ChatStreamView returns server-sent events through StreamingHttpResponse.
- The React client reads the stream and progressively renders tokens, with token refresh support in the API client.

**Likely follow-ups:**
- How are errors represented after the stream starts?
  - **Suggested answer:** Once response headers and body bytes have been sent, the server cannot change the HTTP status, so it needs to emit an SSE error event with a clear event type and safe message. The client should stop rendering the answer as successful and present the error state.
- What happens if the browser disconnects?
  - **Suggested answer:** The event generator should stop writing when the connection closes and release any provider stream or worker resources. Whether the underlying model call is cancelled depends on the provider adapter, so I would verify and test that behavior rather than assume disconnect automatically cancels generation.
- How is the final answer persisted?
  - **Suggested answer:** The stream path accumulates generated output and then stores the completed assistant message and its source information in the conversation. If the client disconnects or generation fails partway through, the persistence behavior should be checked so partial text is not mistaken for a completed answer.

### Q. How are RAG answers evaluated?

**Suggested answer:** The project has evaluation support for creating question sets and running DeepEval checks such as faithfulness, answer relevance, and context relevance. Those checks help separate "did retrieval find useful material?" from "did the answer stay supported by that material?" User feedback can also be recorded and difficult queries can be selected for later evaluation. I would not treat a single synthetic benchmark score as proof of quality; I would keep representative human-reviewed examples, track changes over time, and check that generated evaluation questions do not simply match the wording of the system prompt or source documents.

**Key points to prepare:**
- The project includes endpoints to generate evaluation questions and run DeepEval metrics for faithfulness, answer relevance, and context relevance.
- Feedback records can be tagged and hard queries can be selected for re-evaluation.

**Likely follow-ups:**
- What does each metric measure?
  - **Suggested answer:** Faithfulness estimates whether claims in the answer are supported by the retrieved context. Answer relevance checks whether the response addresses the question, while context relevance checks whether the retrieved passages are useful for that question.
- How do you prevent synthetic evaluation questions from biasing results?
  - **Suggested answer:** I would mix generated questions with questions written or reviewed by people, cover different document types and difficulty levels, and keep a held-out set that is not used to tune prompts. I would inspect failures and avoid relying on one aggregate score.
- How would feedback change retrieval or prompts?
  - **Suggested answer:** Feedback should first help identify repeated failure patterns, such as missing evidence, irrelevant retrieval, or unclear wording. I would turn those patterns into a reviewed evaluation set, change one part of the pipeline at a time, and compare results before rolling the change out.

### Q. What does the deployment setup run?

**Suggested answer:** The Docker Compose setup defines PostgreSQL, Redis, the Django backend, a Celery worker, and the React frontend. The Render configuration describes a backend and a PostgreSQL database, but configuration in a repository does not prove that a live deployment exists. Uploaded files are stored on the backend filesystem in the current design, so persistence and shared access need to be addressed if the service moves across hosts. Outside development, I would explicitly provide the required database, broker, Django, authentication, and encryption settings through the deployment environment.

**Key points to prepare:**
- Compose starts PostgreSQL, Redis, backend, Celery worker, and frontend.
- render.yaml describes a backend service and PostgreSQL; do not infer a live deployment from configuration alone.

**Likely follow-ups:**
- Where are uploaded files persisted in production?
  - **Suggested answer:** The current app stores uploaded files on the backend filesystem under per-user directories. Unless the deployment mounts durable shared storage, that location is tied to the instance, so I would use object storage or another shared durable volume before scaling across hosts.
- What happens if the worker restarts during ingestion?
  - **Suggested answer:** With Celery, the exact outcome depends on acknowledgement and retry settings; a task may be retried, redelivered, or left incomplete. I would make ingestion idempotent, record task state, and test the configured worker behavior instead of assuming a restart automatically resumes at the last step.
- Which environment variables are required outside development?
  - **Suggested answer:** The deployment needs its Django secret and allowed-host settings, database and Redis connection details, and a valid `FIELD_ENCRYPTION_KEY`; provider credentials and OAuth settings are needed for the integrations that are enabled. I would use the deployment configuration as the source of truth and never commit those secrets.

### Q. What does the test suite establish?

**Suggested answer:** The backend tests exercise important pieces such as authentication, user scoping, task state, ingestion validation, collections, retrieval helpers, encryption, logging, and API behavior, and there is a frontend test and CI build checks. That gives evidence that those cases work under the tested setup. It does not establish performance at production scale or prove behavior for every external provider and concurrent index access pattern. I would add a concurrency test for two users sharing a process and a failure test for worker restart or broker loss near the top of my list.

**Key points to prepare:**
- Backend tests cover representative auth, user scoping, task transitions, ingestion, retrieval utilities, encryption, logging, and API behavior.
- Frontend tests and build checks exist, but coverage is not proof of production-scale behavior.

**Likely follow-ups:**
- Which external calls are mocked?
  - **Suggested answer:** The tests isolate external provider and network behavior with mocks where they are testing application logic, so the suite does not prove that every live LLM, OAuth, or website integration is healthy. I would check the test fixtures before naming a specific mocked call.
- How would you test concurrent user index loads?
  - **Suggested answer:** I would run two authenticated requests for different users in parallel, force each to load or rebuild its index, and assert that each answer only contains that user's documents. I would repeat the case within one worker and across workers to catch both shared-state and process-local-state problems.
- What missing test would you add first?
  - **Suggested answer:** I would add the concurrent-user isolation test first because the module-level index design makes it a high-impact correctness risk. I would also add a worker-restart test for task recovery once the intended Celery acknowledgement and retry policy is clear.

### Q. Which changes would you discuss from Git history?

**Suggested answer:** The committed history includes the move to hybrid BM25 plus dense retrieval and the addition of SSE streaming; the latest committed change adds conversation pinning. I would explain the design reason and the user-visible effect of any change I personally made, then point to its commit or code. The current checkout also contains local changes, so I would distinguish those from committed work and would not claim authorship based only on the history. A truthful way to answer the contribution part is: "My work was [specific files or behavior I implemented], and I verified it by [actual evidence]."

**Key points to prepare:**
- Recent history adds hybrid BM25+dense search and SSE streaming.
- The latest committed change adds conversation pinning; the current checkout also has local changes, so separate committed work from the current working tree.

**Likely follow-ups:**
- What changed in the retrieval pipeline?
  - **Suggested answer:** The retrieval work added BM25 keyword search alongside FAISS dense search and combined their ranked results with reciprocal rank fusion. The results then pass through reranking and context cleanup before generation.
- How did the frontend consume streamed events?
  - **Suggested answer:** The React client reads the `text/event-stream` response incrementally, parses the SSE events, and updates the displayed answer as text arrives. It also needs to handle stream errors and token refresh through the API client.
- What work remains uncommitted in the current tree?
  - **Suggested answer:** I would inspect `git status` and the diff immediately before the interview, then summarize the actual changed files and behavior. The interview notes indicate there are local changes, but I should not guess what they are or claim work I did not do.

## Comprehensive Project-Specific Question Bank

## Architecture and request flow

- Which logic remains in api/views.py, and what responsibilities are split into retriever.py, generator.py, chunker.py, and compressor.py?
  - **Suggested answer:** The views still coordinate request validation, authentication, persistence, and the overall chat or ingestion flow. The retriever handles FAISS/BM25 search and reranking, the generator calls an LLM provider, the chunker groups extracted text, and the compressor keeps the most query-relevant sentences. I would move more orchestration into application services if the views continue to grow.
- How does the React client refresh an expired access token?
  - **Suggested answer:** The API client sends the access token with a request and, when it receives an authentication failure, calls the refresh endpoint using the browser's refresh cookie. It stores the returned access token and retries the original request; if refresh fails, it should send the user back through sign-in.
- Which response data is stored in ChatMessage?
  - **Suggested answer:** A chat record stores the question and answer, the user, an optional conversation link, source references, retrieved chunks, and a creation time. Keeping sources and chunks makes it possible to show citations and inspect what context supported an answer.
- How does a conversation relate to its messages?
  - **Suggested answer:** A conversation belongs to one user, and each message can point to its conversation through a foreign key. That makes the relationship one-to-many: one conversation groups many messages, and deleting a conversation cascades to its messages.
- How are collection membership and document ownership represented?
  - **Suggested answer:** Both collections and documents belong to a user. A document can optionally reference one collection, so the current schema models a document in zero or one collection rather than arbitrary membership in many collections.
- How would you separate view orchestration from domain services further?
  - **Suggested answer:** I would keep views responsible for HTTP concerns such as authentication, validation, and response codes, then move use cases like upload, reindex, and chat into service functions with explicit inputs and outputs. That makes the workflow easier to test without constructing a full request and reduces the amount of business logic in `api/views.py`.

## Retrieval and RAG quality

- How are files converted to text for PDF, DOCX, Markdown, and plain text?
  - **Suggested answer:** The ingestion code uses format-specific parsers to extract text from PDFs and DOCX files, while Markdown and plain text can be read as text directly. The extracted text is then passed to chunking and indexing; parser errors should be surfaced as a failed task rather than silently indexing empty content.
- How does semantic chunking decide sentence boundaries?
  - **Suggested answer:** It first splits on sentence-ending punctuation, with a small set of common abbreviation exceptions. It embeds the sentences and starts a new chunk when the similarity between adjacent sentences falls below a threshold or when adding a sentence would exceed the 1,500-character limit.
- Why use exact FAISS IndexFlatL2 here?
  - **Suggested answer:** `IndexFlatL2` performs exact nearest-neighbor search using L2 distance, so it is straightforward and does not require tuning an approximate index. It is a reasonable baseline for a local prototype, but its search cost grows with the number of vectors, so a larger corpus may need an approximate or managed vector index.
- How are dense and BM25 rankings fused?
  - **Suggested answer:** Dense search and BM25 each return ranked chunk IDs, and reciprocal rank fusion adds `1 / (K + rank)` for each appearance. The implementation uses K equal to 60, sorts by the combined score, and keeps the top candidates.
- Why rerank before removing overlap?
  - **Suggested answer:** The cross-encoder first orders candidates by how well each chunk matches the actual question. Overlap removal then keeps the higher-ranked version when two chunks repeat much of the same text, preserving prompt space for distinct evidence.
- How does the compressor choose query-relevant sentences?
  - **Suggested answer:** It splits each selected chunk into sentences, embeds the query and sentences, and keeps sentences whose cosine similarity meets a threshold. Very short chunks stay intact, and if every sentence falls below the threshold it retains the best-scoring sentence so the chunk is not erased completely.
- Which retrieval and answer metrics are used by evaluation?
  - **Suggested answer:** The evaluation results store faithfulness, answer relevance, and context relevance scores. Those cover whether the answer is supported by retrieved text, whether it addresses the question, and whether the retrieved context was useful.
- What happens when no useful context is found?
  - **Suggested answer:** If there are no indexed documents, the API returns a client error telling the user to upload and ingest documents first. If retrieval produces weak but non-empty candidates, the current flow still sends the selected context to the provider, so a stronger design would detect low confidence and clearly say it cannot find supporting material.

## APIs and data

- Which endpoints create asynchronous task rows?
  - **Suggested answer:** Upload, URL ingestion, and explicit reindexing create task records before submitting their work. Each record has a UUID, user, task type, status, progress, message, result, and error fields.
- How are task identifiers scoped to the logged-in user?
  - **Suggested answer:** The task status and cancel views look up a task using both its identifier and the current authenticated user. That prevents a user from reading or cancelling another user's task just by guessing its UUID.
- How do task status and cancellation transitions work?
  - **Suggested answer:** A task starts pending, moves to processing when a worker begins, and then ends completed, failed, or cancelled. The worker checks the database for a cancellation request between steps and updates progress and timestamps as it runs.
- How are API errors normalized by the custom exception handler?
  - **Suggested answer:** The custom handler converts framework and application exceptions into a consistent JSON error shape while preserving appropriate HTTP status codes. For a concrete interview answer, I would point to the handler and name its exact fields rather than promise that every third-party exception has the same message.
- Which tables hold evaluation datasets and results?
  - **Suggested answer:** `EvaluationDataset` stores a user's question, an optional expected answer, and reference context. `EvaluationResult` stores the question, generated answer, retrieved context, metric scores, and any error for a run.
- What database operations should be transactional?
  - **Suggested answer:** Operations that must succeed or fail together should use a transaction, such as creating related conversation/message records or updating ownership metadata alongside an associated record. File writes and external provider calls cannot be rolled back by a SQL transaction, so they need explicit cleanup or retry handling.

## Authentication and security

- How does token refresh work between the cookie and access-token header?
  - **Suggested answer:** Normal API requests use the short-lived access token in the authorization header. When it expires, the client calls the refresh endpoint; the browser sends the HttpOnly refresh cookie automatically, and the API returns a new access token if the refresh token is still valid.
- Which cookie flags change in production?
  - **Suggested answer:** Production uses HTTPS, so the refresh cookie should be Secure and HttpOnly, with SameSite and domain/path values chosen for the frontend and API origins. The project settings also distinguish development from production, so I would confirm their actual values in the deployed environment.
- How are user-supplied URLs checked before network access?
  - **Suggested answer:** The server accepts only HTTP and HTTPS, resolves the hostname, and rejects local or private destinations before fetching. It does not follow generic redirects; special handling is used for supported services such as YouTube and Wikipedia.
- What can still go wrong between DNS validation and a request?
  - **Suggested answer:** DNS rebinding can make a hostname resolve to a public address during validation and a private address during the actual connection. To close that gap, the fetcher must validate the resolved address it connects to and repeat the check on every redirect, or use a network layer that blocks private destinations.
- What happens if FIELD_ENCRYPTION_KEY is missing or rotated?
  - **Suggested answer:** In development, values may be stored without encryption when the key is absent; production configuration requires a valid key. If the key changes without re-encrypting existing values, they cannot be decrypted, so rotation needs a planned read-old/write-new migration and a secure backup of the old key during the transition.
- Which endpoint requires staff permission?
  - **Suggested answer:** The administrative statistics endpoint is restricted to staff, while ordinary document, task, and chat endpoints require an authenticated user and apply user scoping. I would verify the permission class in the route before naming an exact endpoint in an interview.
- How are uploaded file names constrained to a user's directory?
  - **Suggested answer:** The backend resolves document paths beneath the authenticated user's storage directory and sanitizes file names before using them. The important invariant is that a supplied name cannot traverse upward and escape that user's directory; I would test path separators, `..`, and unusual encodings.

## Async, concurrency, and scale

- What happens when the Celery broker is unavailable?
  - **Suggested answer:** The enqueue helper catches the broker error and launches the task in a daemon thread in the API process. That fallback can keep a local workflow running, but it is not durable because it ends if the process stops.
- How does a background task report progress and cancellation?
  - **Suggested answer:** The worker writes progress and a status message to the Task row, which the client can poll. It checks the row for a cancellation request and raises a controlled cancellation exception when it reaches a check point.
- What state is lost if the in-process fallback thread dies?
  - **Suggested answer:** The work being done by the thread stops, and any progress that was not saved to the database is lost. The task row may remain incomplete until recovery logic detects it, so a production system needs durable queueing and stale-task handling.
- How are the in-memory embedding and retrieval models shared?
  - **Suggested answer:** The embedding model, reranker, and loaded retrieval data are cached in Python module-level variables. Requests in one worker process reuse those objects, but different worker processes have separate copies and can each consume model memory.
- What happens when multiple users query one process at once?
  - **Suggested answer:** User metadata and document records are scoped, but the current index variables represent one active user's loaded documents per process. Concurrent requests can therefore see the wrong index if one request reloads it for another user; this needs a user-keyed index design or a shared retrieval service.
- What changes if the service runs multiple Gunicorn workers or hosts?
  - **Suggested answer:** Each worker or host has its own in-memory indexes, so loading and rebuilding work can be duplicated and results may differ between workers. Files also need to be available on every host, which points toward shared object storage and a shared index service or durable index files.
- How would you move document files and indexes to shared durable storage?
  - **Suggested answer:** I would put uploaded files in object storage with user-scoped keys and store their object references in the database. I would persist versioned index artifacts or move vectors to a shared vector database, then rebuild indexes asynchronously and switch to a new version only after validation.

## Deployment, testing, and failure scenarios

- How does Docker Compose order database and Redis startup?
  - **Suggested answer:** Compose defines the database, Redis, backend, worker, and frontend services, with dependencies to express startup ordering. A dependency order alone does not prove a service is ready, so health checks and application-level retry behavior are important before workers start consuming jobs.
- What does the GitHub Actions PostgreSQL service validate?
  - **Suggested answer:** It lets backend CI run against a real PostgreSQL service instead of relying only on SQLite, which can reveal database-specific behavior such as constraint or query differences. It still validates the CI configuration and test cases, not a production database under load.
- Which frontend test path runs in CI?
  - **Suggested answer:** CI runs the frontend checks defined in the workflow, including its Create React App test command and build validation. I would read the current workflow before giving exact command names because scripts can change.
- What happens if the LLM provider times out after retrieval succeeds?
  - **Suggested answer:** The API handles provider failures and returns a controlled error response, while the retrieved context can be recomputed on a retry. A robust retry should use a bounded timeout and avoid saving a partial answer as complete; provider-specific retries should also avoid multiplying cost or duplicate side effects.
- How would you make ingestion idempotent after worker restart?
  - **Suggested answer:** I would give each ingestion a stable task/document version, write extracted text and index artifacts to a temporary version, and atomically mark that version active only when the work succeeds. Repeating the same task would replace or reuse that version instead of creating duplicate documents or mixing partial index state.
- How should a health endpoint distinguish API readiness from dependencies?
  - **Suggested answer:** Liveness should answer whether the process itself is running, while readiness should check whether the service can accept work, including required database and broker dependencies. Optional provider APIs should usually be reported separately so one provider outage does not make every endpoint appear dead.

## Trade-offs and difficult questions

- What is the most important scalability boundary in the current index design?
  - **Suggested answer:** The main boundary is the module-level index state that is loaded for one current user per process. It can cause correctness problems with concurrent users and multiple workers, and storing the full corpus in each process also limits memory and startup performance.
- Which part of a RAG answer can be wrong even when retrieval returns a relevant chunk?
  - **Suggested answer:** The model can misread the passage, combine separate facts incorrectly, or add details that the passage does not support. Retrieval quality is only one part of correctness, so the answer must be checked for grounding and clearly cite the supporting source.
- How would you handle a very large document collection without rebuilding all indexes?
  - **Suggested answer:** I would index documents incrementally and track a version or checksum for each one, so only changed documents need new embeddings. Then I would update a shared index through a background job and use a safe swap or version pointer when the update is complete.
- What security issue would you audit first in URL ingestion?
  - **Suggested answer:** I would audit whether the server can be redirected or DNS-rebound into contacting loopback, private, or cloud metadata addresses. I would verify the resolved address at connection time and ensure redirects cannot bypass the same checks.
- Which current design decision would you change before a multi-tenant production launch?
  - **Suggested answer:** I would replace the one-active-user-per-process in-memory retrieval indexes with a user-scoped, shared retrieval layer and test tenant isolation under concurrency. I would also move local file storage to durable shared object storage so different workers can access the same documents safely.

## API questions

- Which endpoints create background tasks, and which task transitions can the client observe?
  - **Suggested answer:** Upload, URL ingestion, and reindex endpoints create task rows and submit background work. The client can observe pending, processing, completed, failed, and cancelled states, plus progress and a status message.
- How are invalid uploads, unsupported file types, and unsafe URLs returned?
  - **Suggested answer:** Validation failures are returned as client errors with a JSON message explaining what input was rejected; unsafe URLs are stopped before fetching. The exact response fields differ by endpoint, so I would show one actual response example from the API rather than claim one universal schema.
- Which endpoints are user-scoped, and which also require staff permissions?
  - **Suggested answer:** Document, conversation, chat, collection, and task operations are scoped to the authenticated user. Administrative statistics use an additional staff permission, so ordinary authentication alone is not enough for that endpoint.
- How does the chat throttle differ from the default anonymous and authenticated limits?
  - **Suggested answer:** Chat has its own throttle class and rate setting because LLM-backed requests cost more and can take longer than ordinary API calls. It should be stricter than a lightweight read endpoint; I would cite the configured rate values from settings if the interviewer asks for numbers.
- Which list endpoints need pagination as conversations and documents grow?
  - **Suggested answer:** Conversation, message, document, collection, task, and evaluation history lists can grow over time, so they should use bounded pagination. The key is to avoid loading every row and its related data into memory for one response.
- What would API versioning protect if the frontend and backend were deployed separately?
  - **Suggested answer:** Versioning gives clients a stable contract while the backend evolves. It lets the server add or change behavior without unexpectedly breaking an older frontend that may still be deployed or cached.
- How does SSE communicate a provider error after the response stream has begun?
  - **Suggested answer:** It should emit a named error event or a documented error payload in the event stream, because the HTTP status is already committed. The frontend must parse that event and stop treating the partial response as a successful completed answer.

## Technology choices

- Why use Django REST Framework for the application API?
  - **Suggested answer:** DRF provides authentication and permission hooks, serializers for request validation, API views, throttling, and a test client that fit a data-backed web API. Django also supplies the ORM and migrations, which helps keep user, document, task, and conversation records in one framework.
- What do Sentence Transformers and FAISS provide for dense retrieval?
  - **Suggested answer:** Sentence Transformers turns text chunks and questions into numeric vectors that capture semantic similarity. FAISS stores and searches those vectors; in this app it uses an exact L2 index as a simple local retrieval baseline.
- Why add BM25 and RRF instead of relying on embeddings alone?
  - **Suggested answer:** Embeddings help find paraphrases, while BM25 is good at matching exact words, names, and identifiers. RRF combines their rankings without requiring their raw scores to use the same scale.
- What are the limits of an in-process FAISS index compared with a shared vector service?
  - **Suggested answer:** An in-process index lives with one worker, so it is not automatically shared, durable, or consistent across machines. A shared service can centralize updates and metadata filtering, though it adds operating cost, network latency, and another dependency.
- Why use Celery and Redis for ingestion, and what does the thread fallback trade away?
  - **Suggested answer:** Celery moves slow ingestion work out of the web request and lets workers process jobs through Redis. The thread fallback avoids failing immediately when the broker is unavailable, but it loses durability, independent scaling, and clean worker lifecycle management.
- What would object storage change compared with per-user files on the backend filesystem?
  - **Suggested answer:** Object storage gives files durable, shared access across backend and worker hosts and separates file capacity from the web server disk. It requires secure object keys, access controls, cleanup rules, and a migration of existing local files.
- Why use PostgreSQL for metadata while keeping document content and indexes elsewhere?
  - **Suggested answer:** PostgreSQL is well suited to structured records and relationships such as users, documents, tasks, and conversations. Large source files and retrieval indexes have different access and scaling needs, so keeping them in object or vector storage can be more practical while the database stores their metadata and references.

## Git history

- What changed when BM25 was fused with FAISS?
  - **Suggested answer:** Retrieval gained a lexical BM25 result list alongside the FAISS semantic list, and reciprocal rank fusion combined the two before reranking. That helps exact terms and paraphrases both influence which evidence reaches the generator.
- Why was SSE added, and how does the React client parse it?
  - **Suggested answer:** SSE lets the backend send generated text to the browser incrementally, which reduces the wait before a user sees an answer. The React client reads the streaming response, parses each event, and appends the text or handles an error event.
- Which conversation operations are committed, and which are only in the current working tree?
  - **Suggested answer:** The committed history includes conversation pinning, while other local changes should be identified from the current `git status` and diff before discussing them. I would separate changes that are committed from uncommitted work and describe only the parts I personally handled.
- Describe your own contribution from your records; commit history and working-tree state do not establish authorship.
  - **Suggested answer:** "My contribution was [specific feature, files, or decisions I personally handled]. I verified it by [tests, review, or behavior I actually checked], and I would not claim the rest of the repository as my work." Fill those brackets from your own notes and be ready to show the relevant change.
