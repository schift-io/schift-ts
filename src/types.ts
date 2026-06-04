export type Modality = "text" | "image" | "audio" | "video" | "document";

/**
 * Canonical model IDs supported by the Schift embedding catalog.
 * Matches the model_id field returned by GET /v1/catalog.
 */
export type EmbedModelId =
  | "schift-embed-1-small"
  | "schift-embed-1-small"
  | "openai/text-embedding-3-small"
  | "openai/text-embedding-3-large"
  | "google/gemini-embedding-001"
  | "google/gemini-embedding-002"
  | "dragonkue/bge-m3-ko"
  | "jinaai/jina-embeddings-v3"
  | "sbintuitions/sarashina-embedding-v2-1b"
  | "voyage/voyage-4-large"
  | "voyage/voyage-4"
  | "voyage/voyage-4-lite"
  | (string & {}); // allow unknown future models without a compile error

/** A single entry from the Schift model catalog (GET /v1/catalog). */
export interface CatalogModel {
  model_id: string;
  provider: string;
  display_name: string;
  dimensions: number;
  max_tokens: number;
  supports_dimensions: boolean;
  pricing_per_1k_tokens: number;
  modalities?: Modality[];
  internal?: boolean;
  [key: string]: unknown;
}

export type TaskType =
  | "retrieval_document"
  | "retrieval_query"
  | "semantic_similarity"
  | "classification"
  | "clustering"
  | "question_answering"
  | "fact_verification"
  | "code_retrieval";

export interface SchiftConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface SchiftAuthConfig {
  baseUrl?: string;
  timeout?: number;
}

export interface AuthSignupRequest {
  email: string;
  password: string;
  name?: string;
  orgName?: string;
  region?: "seoul" | "tokyo" | (string & {});
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  onboarded: boolean;
}

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
  tier: string;
  region: string;
  role: string;
}

export interface AuthPendingInvite {
  token: string;
  orgName: string;
  orgSlug: string;
  role: string;
  email: string;
}

export interface AuthSignupResponse {
  user: AuthUser;
  org?: AuthOrg;
  orgs?: AuthOrg[];
  token: string;
  is_new_user?: boolean;
}

export interface AuthLoginResponse {
  user?: AuthUser;
  orgs?: AuthOrg[];
  token?: string;
  requires_2fa?: boolean;
}

export interface AuthMeResponse {
  user: AuthUser;
  orgs: AuthOrg[];
  pendingInvites: AuthPendingInvite[];
}

export interface EmbedRequest {
  /** Single text to embed. Use `texts` for batch requests. */
  text: string;
  model?: string;
  dimensions?: number;
  taskType?: TaskType;
}

export interface EmbedBatchRequest {
  /** Array of texts to embed in one request. */
  texts: string[];
  model?: string;
  dimensions?: number;
  taskType?: TaskType;
}

export interface EmbedResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  usage: {
    tokens: number;
  };
}

export interface EmbedBatchResponse {
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage: {
    tokens: number;
    count: number;
  };
}

export interface EmbedImageRequest {
  /** Base64-encoded image data (PNG, JPEG, WebP). */
  images: string[];
  model?: string;
  dimensions?: number;
}

export interface EmbedImageResponse {
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage: {
    image_count: number;
  };
}

export type PiiType =
  | "resident_id"
  | "alien_registration"
  | "passport"
  | "driver_license"
  | "address"
  | "phone"
  | "bank_account";

export type PiiTokenFormat = "label_index" | "pii_type_index";

export interface PiiRedactRequest {
  text: string;
  scoreThreshold?: number;
  scope?: "broad" | "core-seven";
  types?: PiiType[];
  tokenFormat?: PiiTokenFormat;
  returnMode?: "entities" | "masked" | "both";
}

export interface PiiEntity {
  label: string;
  start: number;
  end: number;
  score: number;
  word: string;
}

export interface PiiRedactResponse {
  request_id: string;
  profile: string;
  scope: "broad" | "core-seven";
  types?: PiiType[] | null;
  token_format?: PiiTokenFormat | null;
  entities?: PiiEntity[] | null;
  masked?: string | null;
  reverse_map?: Record<string, string> | null;
  elapsed_ms: number;
  cached: boolean;
}

export interface PiiRestoreRequest {
  text: string;
  reverseMap: Record<string, string>;
}

export interface PiiRestoreResponse {
  request_id: string;
  restored: string;
  replaced: number;
  missing_tokens: string[];
}

export type TemporalType = "before" | "after" | "between" | "as_of" | "latest";

/**
 * Operator-shaped value for a metadata filter field.
 *
 * Exactly one of {eq, like, prefix, in} must be set. SQL LIKE semantics for
 * `like` (`%` = any chars, `_` = single char, `\%` / `\_` = literal). All
 * matches are case-insensitive. Plain scalar values in a filter dict are
 * treated as exact match for backward compatibility.
 *
 * @example
 *   filter: {
 *     tag: "urgent",                       // exact match
 *     source_url: { like: "%legal%" },     // substring
 *     filename: { prefix: "2024-" },       // starts-with
 *     doc_type: { in: ["policy", "spec"] } // membership
 *   }
 */
export interface FilterOperator {
  /** Exact match. Lowered to engine for index-time pruning. */
  eq?: string | number | boolean;
  /** Not-equal. Post-filter. */
  ne?: string | number | boolean;
  /** SQL LIKE pattern: % = any, _ = single, \% / \_ = literal. Post-filter. */
  like?: string;
  /** Starts-with (case-insensitive). Post-filter. */
  prefix?: string;
  /** Membership in list (max 100 entries). Post-filter. */
  in?: Array<string | number | boolean>;
  /** Greater-than. Numeric or ISO date string. Post-filter. */
  gt?: string | number;
  /** Greater-than-or-equal. */
  gte?: string | number;
  /** Less-than. */
  lt?: string | number;
  /** Less-than-or-equal. */
  lte?: string | number;
  /** Field presence. true = require non-empty; false = require missing. */
  exists?: boolean;
}

export type FilterValue = string | number | boolean | FilterOperator;

export interface SearchRequest {
  query?: string;
  queryVector?: number[];
  /** Bucket name or ID to search. */
  bucket?: string;
  /** @deprecated Use `bucket` instead. */
  collection?: string;
  topK?: number;
  model?: string;
  filter?: Record<string, FilterValue>;
  mode?: "vector" | "hybrid";
  rerank?: boolean;
  rerankTopK?: number;
  rerankModel?: string;
  task?: TaskType;
  modalities?: Modality[];
  /** Temporal constraint type for time-range filtering on event_time. */
  temporal?: TemporalType;
  /** Epoch millis — used by all temporal types except "latest". */
  temporalStart?: number;
  /** Epoch millis — used by "between" only. */
  temporalEnd?: number;
  /** Drop hits below this score (0.0–1.0). Applied after rerank if rerank=true. */
  minScore?: number;
  /** Attach engine graph neighbors (typed edges) to each hit. */
  expandNeighbors?: ExpandNeighborsParams;
  /** Whitelist response fields. Dotted paths like "metadata.title" supported. */
  includeFields?: string[];
  /** Blacklist response fields. Ignored if includeFields is set. */
  excludeFields?: string[];
  /** Per-hit citation template, e.g. "[{title}:{page}]". {key} substitutes
   *  from metadata; id/score/text are top-level fallbacks. */
  citationFormat?: string;
}

export interface ExpandNeighborsParams {
  /** RelationTypes to surface, e.g. ["follows","has_child"]. Omit = all. */
  relations?: string[];
  direction?: "outgoing" | "incoming" | "both";
  /** Cap edges returned per hit (default 10, max 100). */
  maxPerHit?: number;
}

export interface NeighborEdge {
  id: string;
  relation: string;
  direction: "outgoing" | "incoming";
  weight: number;
}

export interface SearchResult {
  id: string;
  score: number;
  modality?: Modality;
  metadata?: Record<string, string>;
  location?: {
    page?: number;
    timestamp?: number;
    frame?: number;
  };
  /** Engine graph neighbors, present only when expand_neighbors is set. */
  neighbors?: NeighborEdge[];
  /** Formatted citation string, present only when citationFormat was set. */
  citation?: string;
}

export interface ProjectRequest {
  vectors: number[][];
  source: string;
  targetDimensions?: number;
}

export interface ProjectResponse {
  vectors: number[][];
  source: string;
  target: string;
  dimensions: number;
}

export interface FileUploadResponse {
  fileId: string;
  filename: string;
  bytes: number;
  mimeType: string;
  status: "processing" | "ready" | "error";
}

// ---- Bucket / DB ----

export interface BucketUploadResult {
  // K-L5: Accept both snake_case (backend) and camelCase (SDK convention)
  bucket_id: string;
  bucket_name: string;
  bucketId?: string;
  bucketName?: string;
  /** Per-file results returned by the server. */
  uploaded: unknown[];
}

export interface BucketCollection {
  id: string;
  bucket_id?: string;
  bucketId?: string;
  name: string;
  description?: string;
  dimension?: number;
  model?: string;
  backend?: string;
  file_count?: number;
  fileCount?: number;
  vector_count?: number;
  vectorCount?: number;
  active_job_count?: number;
  activeJobCount?: number;
}

// ---- Bucket Context (Honcho-style single-call RAG) ----

export interface BucketContextRequest {
  /** User query to retrieve context for. */
  query: string;
  /** Optional session ID for prepending recent conversation turns. */
  sessionId?: string;
  /** Max tokens in the returned context block. Default 2000. */
  tokenBudget?: number;
  /** Pipeline mode. Default "auto". */
  mode?: "auto" | "naive" | "hyde" | "rerank" | "decision-review";
  /** Metadata filter dict passed to the underlying search. */
  filters?: Record<string, unknown>;
  /** Number of most recent session turns to prepend. Default 0. */
  includeMessages?: number;
  /** Number of chunks to retrieve before budget packing. Default 10. */
  topK?: number;
}

export interface BucketContextChunk {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, string>;
}

export interface BucketContextTurn {
  role: string;
  content: string;
}

export interface BucketContextResponse {
  /** Paste-ready context string with [1] [2] citation markers. */
  text: string;
  /** Estimated token count of text. */
  tokens: number;
  /** Retrieved chunks (in citation order). */
  chunks: BucketContextChunk[];
  /** Prepended session turns (if include_messages > 0). */
  sessionTurns: BucketContextTurn[];
  /** How many chunks were truncated to fit budget. */
  truncatedCount: number;
  /** How many chunks were skipped due to budget. */
  skippedCount: number;
  /** Mode actually executed (may differ from requested when falling back). */
  modeUsed: string;
  /** True when served from semantic cache (latency ≤ 50ms). */
  cacheHit: boolean;
}

// ---- Aggregation ----

export interface AggregateRequest {
  collection: string;
  groupBy: string;
  filterKey?: string;
  filterValue?: string;
}

export interface AggregateGroup {
  value: string;
  count: number;
}

export interface AggregateResponse {
  groups: AggregateGroup[];
  total: number;
}

// ---- RAG Chat ----

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  /** Bucket ID (UUID) or name. Resolved internally. */
  bucketId: string;
  /** Alias — if set, takes precedence over bucketId. Accepts name or ID. */
  bucket?: string;
  message: string;
  history?: ChatMessage[];
  model?: string;
  topK?: number;
  stream?: boolean;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatSource {
  id: string;
  score: number;
  text: string;
}

export interface ChatResponse {
  reply: string;
  sources: ChatSource[];
  model: string;
}

export interface PipelineStepEvent {
  step: "search" | "rerank" | "expand" | "generate";
  status: "started" | "completed" | "error";
  duration_ms?: number;
  result_count?: number;
  method?: string;
  model?: string;
  total_tokens?: number;
  expanded?: boolean;
  error?: string;
}

export interface ChatStreamEvent {
  type: "sources" | "chunk" | "done" | "error" | "pipeline_step";
  sources?: ChatSource[];
  content?: string;
  message?: string;
  /** Present when type === "pipeline_step" */
  step?: PipelineStepEvent["step"];
  status?: PipelineStepEvent["status"];
  duration_ms?: number;
  result_count?: number;
}

// ---- Decision Review (adversarial RAG) ----

export type DecisionReviewPersonaRole =
  | "lawyer"
  | "doctor"
  | "analyst"
  | "auditor"
  | "custom";

export interface DecisionReviewScenario {
  /** Facts / patient / target / control. */
  subject: string;
  /** Client position / clinical concern / mandate / requirement. */
  perspective: string;
  /** The decision to make. */
  coreQuestion: string;
}

export interface DecisionReviewPersona {
  role: DecisionReviewPersonaRole;
  /** Output language code (e.g. "ko", "en"). */
  language?: string;
  /** Optional override for sub-issue decomposition phrasing. */
  decompositionHint?: string;
}

export interface DecisionReviewRequest {
  scenario: DecisionReviewScenario;
  /** Engine bucket / collection ID containing the corpus. */
  corpusId: string;
  persona?: DecisionReviewPersona;
  maxSubIssues?: number;
  kPerSubIssue?: number;
  favorableDisplayCap?: number;
  counterDisplayCap?: number;
  /** Use engine hybrid search (BM25 + vector RRF) when available. Default true. */
  useHybrid?: boolean;
  /** Optional metadata equality filter applied at engine search time. */
  metadataFilter?: Record<string, string>;
}

export type DecisionReviewStreamEvent =
  | { type: "decompose"; data: { decompose_ms: number; sub_issues: Array<{ id?: string; summary?: string; search_query?: string }> } }
  | { type: "sub_issue"; data: DecisionReviewSubIssue }
  | { type: "verbatim"; data: DecisionReviewVerbatim }
  | { type: "done"; data: DecisionReviewResponse }
  | { type: "error"; data: { message: string } };

export interface DecisionReviewPrecedent {
  chunk_id: string;
  title: string;
  citation: string;
  score: number;
  excerpt: string;
  polarity_reason: string;
}

export interface DecisionReviewSubIssue {
  sub_issue_id: string;
  summary: string;
  search_query: string;
  favorable: DecisionReviewPrecedent[];
  counter: DecisionReviewPrecedent[];
  neutral_count: number;
  n_classified: number;
}

export interface DecisionReviewVerbatim {
  citations_found: number;
  citations_failed: number;
  failed_citations: string[];
}

export interface DecisionReviewResponse {
  scenario_id: string;
  sub_issues: DecisionReviewSubIssue[];
  verbatim: DecisionReviewVerbatim;
  timing_ms: Record<string, number>;
  corpus_id: string;
  persona_role: string;
}

export interface DecisionReviewSubstrate {
  corpus_id: string;
  description: string;
  default_persona: [string, string];
}
