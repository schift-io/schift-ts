// ---- Block Types ----

export const BlockType = {
  START: "start",
  END: "end",
  DOCUMENT_LOADER: "document_loader",
  DOCUMENT_PARSER: "document_parser",
  CHUNKER: "chunker",
  EMBEDDER: "embedder",
  MODEL_SELECTOR: "model_selector",
  VECTOR_STORE: "vector_store",
  COLLECTION: "collection",
  RETRIEVER: "retriever",
  RERANKER: "reranker",
  LLM: "llm",
  PROMPT_TEMPLATE: "prompt_template",
  RAG: "rag",
  CONDITION: "condition",
  ROUTER: "router",
  AI_ROUTER: "ai_router",
  LOOP: "loop",
  CODE: "code",
  MERGE: "merge",
  VARIABLE: "variable",
  FIELD_SELECTOR: "field_selector",
  HTTP_REQUEST: "http_request",
  WEBHOOK: "webhook",
  // K-M1: Automated ingest types (matching backend)
  WEBHOOK_SOURCE: "webhook_source",
  INGEST_BRIDGE: "ingest_bridge",
  FEED_POLL: "feed_poll",
  NOTIFY: "notify",
  // Source connector
  SOURCE_QUERY: "source_query",
  SOURCE_WRITE: "source_write",
  ANSWER: "answer",
  METADATA_EXTRACTOR: "metadata_extractor",
  WEB_SEARCH: "web_search",
  // n8n-derived helpers (Core Nodes > Data Transformation / Flow / Triggers)
  SET: "set",
  FILTER: "filter",
  SWITCH: "switch",
  AGGREGATE: "aggregate",
  SORT: "sort",
  LIMIT: "limit",
  SPLIT_OUT: "split_out",
  SUMMARIZE: "summarize",
  REMOVE_DUPLICATES: "remove_duplicates",
  DATETIME: "datetime",
  WAIT: "wait",
  SCHEDULE_TRIGGER: "schedule_trigger",
  MANUAL_TRIGGER: "manual_trigger",
  GMAIL_TRIGGER: "gmail_trigger",
  NOTION_TRIGGER: "notion_trigger",
  // HITL (Human-in-the-Loop)
  HUMAN_APPROVAL: "human_approval",
  HUMAN_FORM: "human_form",
  // RAG-native (Schift first-class)
  DECISION_REVIEW: "decision_review",
  // Composition
  SUBWORKFLOW: "subworkflow",
  OUTBOUND_WEBHOOK: "outbound_webhook",
  // Agent root node — runs a ReAct loop using sidecar AgentLanguageModel /
  // AgentMemory / AgentTool ports. The workflow-level counterpart of the
  // standalone Agent runtime in clients/sdk/ts/src/agent/.
  AI_AGENT: "ai_agent",
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

// ---- Workflow & Run Status ----

export const WorkflowStatus = {
  DRAFT: "draft",
  /** @deprecated Use `PUBLISHED` instead. Will be removed in a future release. */
  ACTIVE: "active",
  PUBLISHED: "published",
  ARCHIVED: "archived",
} as const;

export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

export const RunStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

// ---- Templates ----

export const WorkflowTemplate = {
  BASIC_RAG: "basic_rag",
  DOCUMENT_QA: "document_qa",
  CONVERSATIONAL_RAG: "conversational_rag",
  MULTI_SOURCE_RAG: "multi_source_rag",
  AGENTIC_RAG: "agentic_rag",
  IMAGE_OCR_INGEST: "image_ocr_ingest",
  CHAT_RAG: "chat_rag",
  CHATROOM_MEMORY_SEARCH: "chatroom_memory_search",
} as const;

export type WorkflowTemplate =
  (typeof WorkflowTemplate)[keyof typeof WorkflowTemplate];

// ---- Position ----

export interface Position {
  x: number;
  y: number;
}

// ---- Block Config ----

export type BlockConfig = Record<string, unknown>;

// ---- Block ----

export interface Block {
  id: string;
  type: BlockType;
  title: string;
  position: Position;
  config: BlockConfig;
}

// ---- Edge ----

export interface Edge {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
}

// ---- Workflow Graph ----

export interface WorkflowGraph {
  // K-H4: Accept both "blocks" (SDK convention) and "nodes" (backend convention)
  blocks: Block[];
  nodes?: Block[];
  edges: Edge[];
}

// ---- Workflow ----

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  graph: WorkflowGraph;
  created_at: string;
  updated_at: string;
}

// ---- Block Run State ----

export const BlockRunStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type BlockRunStatus =
  (typeof BlockRunStatus)[keyof typeof BlockRunStatus];

export interface BlockRunState {
  status: BlockRunStatus;
  duration_ms?: number;
  error?: string;
  outputs?: Record<string, unknown>;
}

// ---- Workflow Run ----

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  org_id?: string;
  status: RunStatus;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  block_states: Record<string, BlockRunState>;
  error?: string;
  started_at: string;
  finished_at?: string;
  created_at?: string;
}

// ---- Block Type Info (from /meta/block-types) ----

export interface BlockTypeInfo {
  type: BlockType;
  label: string;
  description: string;
  category: string;
  default_config: BlockConfig;
  input_handles: string[];
  output_handles: string[];
}

// ---- Template Info (from /meta/templates) ----

export interface TemplateInfo {
  id: WorkflowTemplate;
  name: string;
  description: string;
  graph: WorkflowGraph;
}

// ---- Validation ----

export interface ValidationError {
  block_id?: string;
  edge_id?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ---- Request Types ----

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  template?: WorkflowTemplate;
  graph?: WorkflowGraph;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  graph?: WorkflowGraph;
}

export interface AddBlockRequest {
  type: BlockType;
  title?: string;
  position?: Position;
  config?: BlockConfig;
}

export interface AddEdgeRequest {
  source: string;
  target: string;
  // K-M4: Backend uses "out"/"in" as default handles when omitted.
  // Explicitly set handles to match block type output/input names
  // (e.g. "documents", "chunks", "embeddings", "prompt", "text").
  source_handle?: string;
  target_handle?: string;
}

export interface RunWorkflowRequest {
  inputs?: Record<string, unknown>;
}

// ---- Run Log Entry (from /runs/{run_id}/logs) ----

export interface RunLogEntry {
  id: number;
  run_id: string;
  seq: number;
  block_id: string;
  block_type: string;
  event: "started" | "completed" | "failed" | "skipped" | "timeout";
  duration_ms?: number;
  error?: string;
  created_at: string;
}

export interface RunLogsResponse {
  run_id: string;
  status: RunStatus;
  logs: RunLogEntry[];
}

export interface AsyncRunResponse {
  id: string;
  workflow_id: string;
  status: "pending";
}

// ---- Response Types ----

export interface ListWorkflowsResponse {
  workflows: Workflow[];
}

export interface ListBlockTypesResponse {
  block_types: BlockTypeInfo[];
}

export interface ListTemplatesResponse {
  templates: TemplateInfo[];
}
