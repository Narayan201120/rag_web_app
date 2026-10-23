/** Shapes returned by the Django API. Field names match the backend exactly. */

export interface Account {
  username: string;
  email: string;
  is_staff: boolean;
}

export interface AuthResponse {
  message: string;
  tokens: { access: string };
}

export interface StatusInfo {
  status: 'ok' | 'degraded';
  server: string;
  vector_database: {
    connected: boolean;
    total_chunks: number;
    total_documents: number;
    embedding_dimension: number;
  };
  supported_formats: string[];
}

export interface ConversationSummary {
  id: number;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string;
}

export interface ConversationList {
  count: number;
  conversations: ConversationSummary[];
}

export interface SourceStatus {
  name: string;
  available: boolean;
}

export interface ChatMessage {
  id: number;
  question: string;
  answer: string;
  sources: string[];
  source_statuses?: SourceStatus[];
  created_at: string;
}

export interface ConversationDetail {
  id: number;
  title: string;
  pinned: boolean;
  messages: ChatMessage[];
}

export interface Citation {
  index: number;
  text: string;
  source: string;
  available: boolean;
}

export interface CitationsResponse {
  chat_id: number;
  question: string;
  total_citations: number;
  citations: Citation[];
}

export interface FeedbackResponse {
  message: string;
  chat_id: number;
  rating: 'up' | 'down';
  comment: string;
  failure_tag: string;
  created_at: string;
}

export interface DocumentInfo {
  name: string;
  size_bytes: number;
  collection_id: number | null;
  collection_name: string | null;
  uploaded_at?: string;
}

export interface DocumentList {
  count: number;
  documents: DocumentInfo[];
}

export interface DocumentPreview {
  name: string;
  extension: string;
  content: string;
  total_characters: number;
  truncated: boolean;
  size_bytes: number;
  uploaded_at?: string;
}

export interface Collection {
  id: number;
  name: string;
  description: string;
  document_count: number;
  created_at: string;
}

export interface CollectionList {
  count: number;
  collections: Collection[];
}

export interface TaskInfo {
  task_id: string;
  task_type: 'upload' | 'ingest' | 'url_ingest';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  result: Record<string, unknown>;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SearchHit {
  chunk: string;
  source: string;
  relevance_score?: number;
}

export interface SearchResponse {
  query: string;
  count: number;
  results: SearchHit[];
}

export interface SuggestResponse {
  query: string;
  count: number;
  suggestions: string[];
}

export interface SettingsInfo {
  provider: string;
  model: string;
  supported_providers: string[];
  provider_models: Record<string, string[]>;
  api_key: string;
}

export interface TestConnectionResponse {
  message: string;
  provider: string;
  model: string;
  reply_excerpt: string;
}

export interface UsageResponse {
  period: string;
  total_calls: number;
  per_user: { user__username: string; call_count: number }[];
  top_endpoints: { endpoint: string; call_count: number }[];
}

export interface VectorsResponse {
  total_vectors: number;
  embedding_dim: number;
  total_documents: number;
  documents: Record<string, { chunks: number; sample: string }>;
}

export interface EvalResult {
  id?: number;
  question: string;
  faithfulness?: number;
  answer_relevancy?: number;
  answer_relevance?: number;
  context_relevancy?: number;
  actual_answer?: string;
  error?: string;
  created_at?: string;
}

export interface HardQuery {
  chat_id: number;
  question: string;
  answer: string;
  failure_tag: string;
  comment: string;
  created_at: string;
}
