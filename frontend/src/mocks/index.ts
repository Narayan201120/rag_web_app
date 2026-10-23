/**
 * Browser-side mock of the Django API, enabled with VITE_MOCK=1.
 * Lets the UI be developed and reviewed without the backend running.
 */

const BASE: string = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

interface MockMessage {
  id: number;
  question: string;
  answer: string;
  sources: string[];
  source_statuses: { name: string; available: boolean }[];
  created_at: string;
}

interface MockConversation {
  id: number;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string;
  messages: MockMessage[];
}

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

/* the real backend keeps the refresh token in an HttpOnly cookie, so a
   reload keeps the session; mirror that with sessionStorage */
const SIGNED_IN_KEY = 'documind-mock-signed-in';

const state = {
  get signedIn(): boolean {
    return window.sessionStorage.getItem(SIGNED_IN_KEY) === '1';
  },
  set signedIn(value: boolean) {
    if (value) window.sessionStorage.setItem(SIGNED_IN_KEY, '1');
    else window.sessionStorage.removeItem(SIGNED_IN_KEY);
  },
  nextChatId: 100,
  conversations: [
    {
      id: 1,
      title: 'How does the reranker work?',
      pinned: true,
      created_at: iso(86_400_000 * 2),
      updated_at: iso(3_600_000 * 5),
      message_count: 2,
      last_message:
        'The cross-encoder scores each candidate passage against the question, which is slower than embeddings but far more precise…',
      messages: [
        {
          id: 11,
          question: 'How does the reranker work?',
          answer:
            'The retrieval pipeline first narrows thousands of chunks down to about ten candidates using hybrid search, then a cross-encoder scores each candidate against your exact question [1]. Unlike bi-encoder embeddings, the cross-encoder reads the question and passage together, so it catches relevance signals that vector distance misses [2]. After scoring, highly overlapping passages are collapsed and the top three are compressed into the final context window [3].',
            sources: ['rag-paper.pdf', 'notes.md'],
            source_statuses: [
              { name: 'rag-paper.pdf', available: true },
              { name: 'notes.md', available: true },
            ],
          created_at: iso(3_600_000 * 5),
        },
        {
          id: 12,
          question: 'Why is reciprocal rank fusion used before reranking?',
          answer:
            'Reciprocal rank fusion combines the dense (FAISS) and lexical (BM25) rankings without needing comparable score scales [1]. Each list contributes votes based on rank position alone, which makes the fused ordering robust even when the two scorers use completely different distributions [2].',
          sources: ['rag-paper.pdf'],
          source_statuses: [{ name: 'rag-paper.pdf', available: true }],
          created_at: iso(3_600_000 * 4),
        },
      ],
    },
    {
      id: 2,
      title: 'Summarize the quarterly report',
      pinned: false,
      created_at: iso(86_400_000 * 5),
      updated_at: iso(86_400_000),
      message_count: 1,
      last_message: 'Revenue grew 14% quarter over quarter, driven mainly by the enterprise tier…',
      messages: [
        {
          id: 21,
          question: 'Summarize the quarterly report',
          answer:
            'Revenue grew 14% quarter over quarter, driven mainly by the enterprise tier [1]. Operating costs held flat, so the operating margin improved to 22% [2]. The report flags hiring in the support org as the main planned expense for next quarter [3].',
          sources: ['quarterly-report.docx'],
          source_statuses: [{ name: 'quarterly-report.docx', available: true }],
          created_at: iso(86_400_000),
        },
      ],
    },
    {
      id: 3,
      title: 'Attention mechanism, plain English',
      pinned: false,
      created_at: iso(86_400_000 * 9),
      updated_at: iso(86_400_000 * 9),
      message_count: 1,
      last_message: 'Attention lets every word look at every other word and decide what matters…',
      messages: [
        {
          id: 31,
          question: 'Explain attention in plain English',
          answer:
            'Attention lets every word look at every other word and decide what matters [1]. Each pair of words gets a relevance weight, and the representation of a word becomes a blend of the words it attends to [2].',
          sources: ['attention-is-all-you-need.pdf'],
          source_statuses: [{ name: 'attention-is-all-you-need.pdf', available: true }],
          created_at: iso(86_400_000 * 9),
        },
      ],
    },
  ] as MockConversation[],

  documents: [
    {
      name: 'rag-paper.pdf',
      size_bytes: 1_842_000,
      collection_id: 1,
      collection_name: 'Research',
      uploaded_at: iso(86_400_000 * 12),
    },
    {
      name: 'attention-is-all-you-need.pdf',
      size_bytes: 2_207_000,
      collection_id: 1,
      collection_name: 'Research',
      uploaded_at: iso(86_400_000 * 10),
    },
    {
      name: 'quarterly-report.docx',
      size_bytes: 84_300,
      collection_id: 2,
      collection_name: 'Reports',
      uploaded_at: iso(86_400_000 * 5),
    },
    {
      name: 'notes.md',
      size_bytes: 12_900,
      collection_id: null,
      collection_name: null,
      uploaded_at: iso(3_600_000 * 30),
    },
  ],

  collections: [
    {
      id: 1,
      name: 'Research',
      description: 'Papers and reference material',
      document_count: 2,
      created_at: iso(86_400_000 * 20),
    },
    {
      id: 2,
      name: 'Reports',
      description: 'Quarterly and weekly reports',
      document_count: 1,
      created_at: iso(86_400_000 * 15),
    },
  ],

  tasks: new Map<string, { start: number; duration: number; type: string; label: string }>(),

  settings: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    supported_providers: [
      'google-gemini',
      'openai',
      'anthropic',
      'mistral',
      'xai',
      'qwen',
      'minimax',
      'meta-llama',
      'groq',
      'other',
    ],
    provider_models: {
      'google-gemini': ['gemini-2.5-flash', 'gemini-2.5-pro'],
      openai: ['gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
      anthropic: ['claude-sonnet-4', 'claude-haiku-4'],
      mistral: ['mistral-large-latest', 'mistral-small-latest'],
      xai: ['grok-3-mini'],
      qwen: ['qwen-plus'],
      minimax: ['abab6.5s-chat'],
      'meta-llama': ['llama-4-scout'],
      groq: ['llama-3.3-70b-versatile'],
      other: ['custom-model'],
    },
    api_key: 'sk-pr-********.9xYz',
  },

  usage: {
    period: 'last_7_days',
    total_calls: 1_284,
    per_user: [
      { user__username: 'demo', call_count: 812 },
      { user__username: 'alice', call_count: 301 },
      { user__username: 'bob', call_count: 171 },
    ],
    top_endpoints: [
      { endpoint: '/api/chat/stream/', call_count: 540 },
      { endpoint: '/api/search/', call_count: 322 },
      { endpoint: '/api/documents/', call_count: 240 },
      { endpoint: '/api/upload/', call_count: 182 },
    ],
  },

  evalResults: [
    {
      id: 1,
      question: 'How does reciprocal rank fusion combine rankings?',
      faithfulness: 0.92,
      answer_relevancy: 0.88,
      context_relevancy: 0.74,
      actual_answer: 'RRF combines rankings by rank position, not score scale.',
      created_at: iso(3_600_000 * 20),
    },
    {
      id: 2,
      question: 'What margin did the report show?',
      faithfulness: 0.97,
      answer_relevancy: 0.95,
      context_relevancy: 0.81,
      actual_answer: 'Operating margin improved to 22%.',
      created_at: iso(3_600_000 * 19),
    },
    {
      id: 3,
      question: 'Who wrote the attention paper?',
      faithfulness: 0.41,
      answer_relevancy: 0.62,
      context_relevancy: 0.28,
      error: 'The retrieved context did not contain the authors.',
      created_at: iso(3_600_000 * 18),
    },
  ],

  hardQueries: [
    {
      chat_id: 31,
      question: 'Who wrote the attention paper?',
      answer: 'The paper was written in 2017 by researchers studying machine translation.',
      failure_tag: 'bad_retrieval',
      comment: 'It never names the authors even though the PDF has them on page one.',
      created_at: iso(3_600_000 * 22),
    },
    {
      chat_id: 33,
      question: 'What was the Q2 support headcount plan?',
      answer: 'The report does not mention support headcount.',
      failure_tag: 'incomplete',
      comment: '',
      created_at: iso(86_400_000 * 2),
    },
  ],
};

const CANNED_ANSWER =
  'The retrieval pipeline works in stages [1]. First, the question is embedded and searched against FAISS while BM25 runs a lexical pass in parallel; the two rankings are merged with reciprocal rank fusion so neither score scale dominates [2]. A cross-encoder then reranks the fused candidates — it reads question and passage together, which catches relevance that embeddings miss. The strongest non-overlapping passages are compressed into the final context, and the model answers strictly from that context, citing [1] and [2] as it goes.';

/* ------------------------------------------------------------------ */
/* plumbing                                                            */
/* ------------------------------------------------------------------ */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthorized = () => json({ detail: 'Authentication credentials were not provided.' }, 401);
const notFound = (what: string) => json({ error: `${what} not found.` }, 404);

function requireAuth(): boolean {
  return state.signedIn;
}

function registerMockTask(type: string, label: string): string {
  const id = crypto.randomUUID();
  state.tasks.set(id, { start: Date.now(), duration: rand(7_000, 12_000), type, label });
  return id;
}

function taskSnapshot(id: string) {
  const task = state.tasks.get(id);
  if (!task) return null;
  const elapsed = Date.now() - task.start;
  const ratio = Math.min(1, elapsed / task.duration);
  const progress = Math.round(ratio * 100);
  const status =
    ratio >= 1 ? 'completed' : ratio <= 0.05 ? 'pending' : 'processing';
  const message =
    status === 'completed'
      ? `Finished: ${task.label}`
      : status === 'pending'
        ? `Queued: ${task.label}`
        : `Working: ${task.label}`;
  return {
    task_id: id,
    task_type: task.type,
    status,
    progress,
    message,
    result: status === 'completed' ? { filename: task.label } : {},
    error: '',
    created_at: iso(0),
    started_at: status === 'pending' ? null : iso(0),
    finished_at: status === 'completed' ? iso(0) : null,
  };
}

function mockSseStream(question: string, conversationId: number): Response {
  const chatId = state.nextChatId++;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      await wait(400);
      const words = CANNED_ANSWER.split(' ');
      let sent = '';
      for (let i = 0; i < words.length; i += 1) {
        const piece = (i === 0 ? '' : ' ') + words[i];
        sent += piece;
        send({ token: piece });
        await wait(rand(24, 70));
      }
      const sources = ['rag-paper.pdf', 'notes.md'];
      send({
        done: true,
        id: chatId,
        conversation_id: conversationId,
        answer: CANNED_ANSWER,
        sources,
        source_statuses: sources.map((name) => ({ name, available: true })),
      });
      controller.close();

      // persist into the mock conversation list
      let conv = state.conversations.find((c) => c.id === conversationId);
      if (!conv) {
        conv = {
          id: conversationId,
          title: question.slice(0, 50),
          pinned: false,
          created_at: iso(0),
          updated_at: iso(0),
          message_count: 0,
          last_message: '',
          messages: [],
        };
        state.conversations.unshift(conv);
      }
      conv.messages.push({
        id: chatId,
        question,
        answer: CANNED_ANSWER,
        sources,
        source_statuses: sources.map((name) => ({ name, available: true })),
        created_at: iso(0),
      });
      conv.message_count = conv.messages.length;
      conv.last_message = question.slice(0, 80);
      conv.updated_at = iso(0);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function mockBody(init?: RequestInit): Promise<any> {
  if (!init?.body) return null;
  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body);
    } catch {
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* router                                                              */
/* ------------------------------------------------------------------ */

async function route(
  method: string,
  path: string,
  body: any,
): Promise<Response> {
  const pathOnly = path.split('?')[0];
  const query = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');

  /* ----- auth ----- */
  if (pathOnly === '/token/refresh/') {
    if (!state.signedIn) return json({ error: 'Invalid or expired refresh token.' }, 401);
    return json({ access: 'mock-access-token' });
  }
  if (pathOnly === '/sign-in/' && method === 'POST') {
    if (!body?.username || !body?.password) return json({ error: 'Please provide both username and password.' }, 400);
    state.signedIn = true;
    return json({ message: 'Signed In Successfully.', tokens: { access: 'mock-access-token' } });
  }
  if (pathOnly === '/sign-up/' && method === 'POST') {
    if (body?.email === 'taken@example.com') {
      return json({ email: ['a user with this email already exists.'] }, 400);
    }
    state.signedIn = true;
    return json({ message: 'Signed Up Successfully.', tokens: { access: 'mock-access-token' } }, 201);
  }
  if (pathOnly === '/auth/social/' && method === 'POST') {
    state.signedIn = true;
    return json({ message: 'Signed in with mock provider.', tokens: { access: 'mock-access-token' } });
  }
  if (pathOnly === '/logout/' && method === 'POST') {
    state.signedIn = false;
    return json({ message: 'Logged out successfully.' });
  }
  if (pathOnly === '/account/delete/' && method === 'DELETE') {
    state.signedIn = false;
    return json({ message: 'Account deleted successfully.' });
  }
  if (pathOnly === '/forgot-password/' && method === 'POST') {
    return json({ message: 'If an account with this email exits, a reset link has been sent.' });
  }

  if (!requireAuth()) return unauthorized();

  /* ----- account / status ----- */
  if (pathOnly === '/account/') {
    return json({ username: 'demo', email: 'demo@documind.app', is_staff: true });
  }
  if (pathOnly === '/status/') {
    return json({
      status: 'ok',
      server: 'running',
      vector_database: { connected: true, total_chunks: 1_520, total_documents: state.documents.length, embedding_dimension: 384 },
      supported_formats: ['.txt', '.md', '.pdf', '.docx'],
    });
  }

  /* ----- chat ----- */
  if (pathOnly === '/chat/history/' && method === 'GET') {
    const conversations = state.conversations.map(({ messages: _m, ...rest }) => rest);
    return json({ count: conversations.length, conversations });
  }
  if (pathOnly.startsWith('/chat/conversations/')) {
    const id = Number(pathOnly.split('/')[3]);
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return notFound('Conversation');
    if (method === 'GET') {
      return json({ id: conv.id, title: conv.title, pinned: conv.pinned, messages: conv.messages });
    }
    if (method === 'PATCH') {
      if (typeof body?.title === 'string' && body.title.trim()) conv.title = body.title.trim();
      if (body?.pinned !== undefined) conv.pinned = Boolean(body.pinned);
      return json({ id: conv.id, title: conv.title, pinned: conv.pinned });
    }
    if (method === 'DELETE') {
      state.conversations = state.conversations.filter((c) => c.id !== id);
      return json({ message: 'Conversation deleted.' });
    }
  }
  if (pathOnly === '/chat/stream/' && method === 'POST') {
    return mockSseStream(body?.question ?? '…', body?.conversation_id ?? state.nextChatId);
  }
  if (pathOnly === '/chat/' && method === 'POST') {
    return json({
      id: state.nextChatId++,
      conversation_id: body?.conversation_id ?? 1,
      question: body?.question,
      answer: CANNED_ANSWER,
      sources: ['rag-paper.pdf'],
      created_at: iso(0),
    });
  }
  const feedbackMatch = pathOnly.match(/^\/chat\/(\d+)\/feedback\/$/);
  if (feedbackMatch && method === 'POST') {
    return json(
      {
        message: 'Feedback submitted.',
        chat_id: Number(feedbackMatch[1]),
        rating: body?.rating,
        comment: body?.comment ?? '',
        failure_tag: body?.failure_tag ?? '',
        created_at: iso(0),
      },
      201,
    );
  }
  const citationsMatch = pathOnly.match(/^\/chat\/(\d+)\/citations\/$/);
  if (citationsMatch && method === 'GET') {
    return json({
      chat_id: Number(citationsMatch[1]),
      question: 'How does the reranker work?',
      total_citations: 3,
      citations: [
        {
          index: 1,
          source: 'rag-paper.pdf',
          available: true,
          text: 'Hybrid retrieval fetches ten candidates: the FAISS dense ranking and the BM25 lexical ranking are merged with reciprocal rank fusion, which votes by rank position and therefore never compares unlike score scales.',
        },
        {
          index: 2,
          source: 'rag-paper.pdf',
          available: true,
          text: 'The cross-encoder reads the question and the passage jointly and outputs a single relevance score, recovering precision that bi-encoder similarity loses when the question and passage use different vocabulary.',
        },
        {
          index: 3,
          source: 'notes.md',
          available: true,
          text: 'After reranking, passages that overlap heavily are collapsed to one, and the survivors are compressed so the final context fits the model window without cutting the answer-bearing sentence.',
        },
      ],
    });
  }
  const exportMatch = pathOnly.match(/^\/chat\/(\d+)\/export\/$/);
  if (exportMatch) {
    const md = `# Chat ${exportMatch[1]}\n\n**Q:** How does the reranker work?\n\n**A:** ${CANNED_ANSWER}\n`;
    return new Response(method === 'GET' ? md : JSON.stringify({ md }), {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="chat_${exportMatch[1]}.md"`,
      },
    });
  }
  if (pathOnly === '/feedback/hard-queries/') {
    return json({ hard_queries: state.hardQueries });
  }

  /* ----- documents ----- */
  if (pathOnly === '/documents/' && method === 'GET') {
    return json({ count: state.documents.length, documents: state.documents });
  }
  if (pathOnly === '/upload/' && method === 'POST') {
    const taskId = registerMockTask('upload', 'uploaded-file.pdf');
    return json({ task_id: taskId, status: 'pending', message: 'Queued upload task.' }, 202);
  }
  if (pathOnly === '/upload-url/' && method === 'POST') {
    const taskId = registerMockTask('url_ingest', body?.url ?? 'web page');
    return json({ task_id: taskId, status: 'pending', message: 'Queued URL ingestion task.' }, 202);
  }
  if (pathOnly === '/ingest/' && method === 'POST') {
    const taskId = registerMockTask('ingest', 'index rebuild');
    return json({ task_id: taskId, status: 'pending', message: 'Queued ingestion task.' }, 202);
  }
  const docMatch = pathOnly.match(/^\/documents\/(.+)\/(move|rename)\/$/);
  if (docMatch) {
    const name = decodeURIComponent(docMatch[1]);
    const doc = state.documents.find((d) => d.name === name);
    if (!doc) return json({ error: `Document ${name} not found!` }, 404);
    if (docMatch[2] === 'move') {
      const coll = state.collections.find((c) => c.id === body?.collection_id) ?? null;
      doc.collection_id = coll?.id ?? null;
      doc.collection_name = coll?.name ?? null;
      return json({ message: `"${name}" moved successfully.`, filename: name, collection: coll?.name ?? null });
    }
    doc.name = body?.new_name ?? doc.name;
    return json({ message: 'renamed', old_name: name, new_name: doc.name });
  }
  const docExact = pathOnly.match(/^\/documents\/(.+)\/$/);
  if (docExact) {
    const name = decodeURIComponent(docExact[1]);
    const doc = state.documents.find((d) => d.name === name);
    if (!doc) return json({ error: `Document ${name} not found!` }, 404);
    if (method === 'GET') {
      return json({
        name: doc.name,
        extension: '.pdf',
        content:
          'This is the extracted text of the document. The retrieval pipeline splits it into semantically related chunks, embeds each chunk, and indexes them for both dense and lexical search.\n\nChunking groups sentences that belong together so that a retrieved passage reads as a complete thought rather than a fragment cut mid-sentence.',
        total_characters: 45_120,
        truncated: true,
        size_bytes: doc.size_bytes,
        uploaded_at: doc.uploaded_at,
      });
    }
    if (method === 'DELETE') {
      state.documents = state.documents.filter((d) => d.name !== name);
      return json({ message: `"${name}" deleted and index rebuilt.` });
    }
  }

  /* ----- collections ----- */
  if (pathOnly === '/collections/' && method === 'GET') {
    return json({ count: state.collections.length, collections: state.collections });
  }
  if (pathOnly === '/collections/' && method === 'POST') {
    const collection = {
      id: state.collections.length + 10,
      name: body?.name ?? 'Untitled',
      description: body?.description ?? '',
      document_count: 0,
      created_at: iso(0),
    };
    state.collections.push(collection);
    return json({ message: 'Collection created.', id: collection.id }, 201);
  }
  const collMatch = pathOnly.match(/^\/collections\/(\d+)\/$/);
  if (collMatch) {
    const id = Number(collMatch[1]);
    const coll = state.collections.find((c) => c.id === id);
    if (!coll) return notFound('Collection');
    if (method === 'PATCH') {
      if (body?.name) coll.name = body.name;
      if (body?.description !== undefined) coll.description = body.description ?? '';
      return json({ ...coll });
    }
    if (method === 'DELETE') {
      state.collections = state.collections.filter((c) => c.id !== id);
      return json({ message: `Collection "${coll.name}" deleted.`, id, unfiled_documents: coll.document_count });
    }
    return json({ ...coll, documents: [] });
  }

  /* ----- tasks ----- */
  const taskMatch = pathOnly.match(/^\/tasks\/([0-9a-f-]+)(\/cancel\/)?$/);
  if (taskMatch) {
    const id = taskMatch[1];
    if (taskMatch[2]) {
      state.tasks.delete(id);
      return json({ message: 'Task cancelled successfully.' });
    }
    const snapshot = taskSnapshot(id);
    if (!snapshot) return notFound('Task');
    return json(snapshot);
  }

  /* ----- search ----- */
  if (pathOnly === '/search/' && method === 'POST') {
    return json({
      query: body?.query,
      count: 3,
      results: [
        {
          source: 'rag-paper.pdf',
          chunk: 'Reciprocal rank fusion merges the dense and lexical rankings by rank position, which sidesteps the problem that FAISS similarities and BM25 scores live on different scales.',
        },
        {
          source: 'rag-paper.pdf',
          chunk: 'The cross-encoder reranker reads the question and passage jointly and recovers precision that bi-encoder similarity loses when vocabulary differs between the two.',
        },
        {
          source: 'notes.md',
          chunk: 'Overlap removal collapses near-duplicate passages so the compressed context spends its budget on distinct evidence instead of repeats.',
        },
      ],
    });
  }
  if (pathOnly === '/search/rerank/' && method === 'POST') {
    return json({
      query: body?.query,
      count: 3,
      results: [
        { source: 'rag-paper.pdf', relevance_score: 0.9123, chunk: 'Reciprocal rank fusion merges the dense and lexical rankings by rank position, which sidesteps the problem that FAISS similarities and BM25 scores live on different scales.' },
        { source: 'notes.md', relevance_score: 0.7456, chunk: 'Overlap removal collapses near-duplicate passages so the compressed context spends its budget on distinct evidence instead of repeats.' },
        { source: 'rag-paper.pdf', relevance_score: 0.5531, chunk: 'Context compression keeps the answer-bearing sentences and trims the rest, so the model window is spent on evidence.' },
      ],
    });
  }
  if (pathOnly === '/search/suggest/' && method === 'GET') {
    const q = (query.get('q') ?? '').toLowerCase();
    const pool = [
      'reranker cross-encoder scoring',
      'reciprocal rank fusion formula',
      'quarterly revenue growth',
      'attention mechanism explained',
      'chunk overlap removal',
    ];
    return json({
      query: q,
      count: 5,
      suggestions: pool.filter((s) => s.includes(q.slice(0, 4))).slice(0, 5),
    });
  }

  /* ----- settings ----- */
  if (pathOnly === '/settings/api-key/' && method === 'GET') {
    return json(state.settings);
  }
  if (pathOnly === '/settings/api-key/' && method === 'POST') {
    state.settings.provider = body?.provider ?? state.settings.provider;
    state.settings.model = body?.model ?? state.settings.model;
    state.settings.api_key = `${(body?.api_key ?? 'key').slice(0, 4)}********.XXXX`;
    return json({ message: 'Provider, model, and API key saved successfully.' });
  }
  if (pathOnly === '/settings/api-key/test/' && method === 'POST') {
    return json({
      message: 'Connection successful.',
      provider: body?.provider ?? state.settings.provider,
      model: body?.model ?? state.settings.model,
      reply_excerpt: 'The retrieval pipeline returns three passages, reranked by a cross-encoder, with citations to their source files.',
    });
  }

  /* ----- admin ----- */
  if (pathOnly === '/admin/usage/') {
    return json(state.usage);
  }
  if (pathOnly === '/admin/vectors/') {
    return json({
      total_vectors: 1_520,
      embedding_dim: 384,
      total_documents: state.documents.length,
      documents: {
        'rag-paper.pdf': { chunks: 612, sample: 'We propose a retrieval-augmented approach that couples a dense retriever with…' },
        'attention-is-all-you-need.pdf': { chunks: 704, sample: 'The Transformer avoids recurrence and relies entirely on attention…' },
        'quarterly-report.docx': { chunks: 128, sample: 'Revenue for the quarter grew 14% quarter over quarter…' },
        'notes.md': { chunks: 76, sample: 'Notes on retrieval pipelines: chunking, hybrid search, reranking…' },
      },
    });
  }

  /* ----- evaluation ----- */
  if (pathOnly === '/evaluate/generate/' && method === 'POST') {
    return json({ message: `Generated ${body?.num_questions ?? 5} questions.`, count: body?.num_questions ?? 5 });
  }
  if (pathOnly === '/evaluate/run/' && method === 'POST') {
    await wait(2_500);
    return json({ message: 'Evaluation complete', results: state.evalResults });
  }
  if (pathOnly === '/evaluate/results/') {
    return json({ results: state.evalResults });
  }

  return json({ error: `Mock has no handler for ${method} ${pathOnly}` }, 404);
}

/* ------------------------------------------------------------------ */

export function installMocks(): void {
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(BASE)) {
      return realFetch(input as RequestInfo, init);
    }
    const path = url.slice(BASE.length);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = await mockBody(init);

    if (path.startsWith('/chat/stream/')) {
      return route(method, path, body);
    }
    await wait(rand(160, 420));
    try {
      return await route(method, path, body);
    } catch (err) {
      return json({ error: `Mock failure: ${String(err)}` }, 500);
    }
  };

  // eslint-disable-next-line no-console
  console.info('[DocuMind] Mock API installed. No real backend is being called.');
}
