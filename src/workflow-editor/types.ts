/**
 * Editor-specific types: canvas blocks, edges, and block type definitions.
 * Re-exports SDK workflow types that the editor depends on.
 */

export type { Workflow, WorkflowGraph, Block, Edge, Position, BlockConfig } from "../workflow/types.js";
export type {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowRun,
  ValidationResult,
} from "../workflow/types.js";

// ---- Block Categories ----

export type BlockCategory =
  | "Control"
  | "Trigger"
  | "Document"
  | "Embedding"
  | "Storage"
  | "Retrieval"
  | "RAG"
  | "LLM"
  | "Agent"
  | "Logic"
  | "Transform"
  | "HITL"
  | "Communication"
  | "Productivity"
  | "Integration";

// ---- Block Type Definitions ----

export interface BlockTypeDefinition {
  type: string;
  label: string;
  category: BlockCategory;
  icon: string;
  defaultConfig: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
}

// ---- Canvas Types ----

export interface CanvasBlock {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface CanvasEdge {
  id: string;
  sourceBlockId: string;
  sourcePort: string;
  targetBlockId: string;
  targetPort: string;
}

export interface PendingConnection {
  sourceBlockId: string;
  sourcePort: string;
}

// ---- Color Maps ----

export const CATEGORY_COLORS: Record<BlockCategory, string> = {
  Control: "bg-slate-600 border-slate-500",
  Trigger: "bg-teal-900 border-teal-700",
  Document: "bg-blue-900 border-blue-700",
  Embedding: "bg-violet-900 border-violet-700",
  Storage: "bg-emerald-900 border-emerald-700",
  Retrieval: "bg-amber-900 border-amber-700",
  RAG: "bg-yellow-900 border-yellow-700",
  LLM: "bg-rose-900 border-rose-700",
  Agent: "bg-fuchsia-900 border-fuchsia-700",
  Logic: "bg-cyan-900 border-cyan-700",
  Transform: "bg-orange-900 border-orange-700",
  HITL: "bg-lime-900 border-lime-700",
  Communication: "bg-red-900 border-red-700",
  Productivity: "bg-neutral-900 border-neutral-700",
  Integration: "bg-pink-900 border-pink-700",
};

export const CATEGORY_BADGE_COLORS: Record<BlockCategory, string> = {
  Control: "bg-slate-500/30 text-slate-300",
  Trigger: "bg-teal-500/20 text-teal-300",
  Document: "bg-blue-500/20 text-blue-300",
  Embedding: "bg-violet-500/20 text-violet-300",
  Storage: "bg-emerald-500/20 text-emerald-300",
  Retrieval: "bg-amber-500/20 text-amber-300",
  RAG: "bg-yellow-500/20 text-yellow-300",
  LLM: "bg-rose-500/20 text-rose-300",
  Agent: "bg-fuchsia-500/20 text-fuchsia-300",
  Logic: "bg-cyan-500/20 text-cyan-300",
  Transform: "bg-orange-500/20 text-orange-300",
  HITL: "bg-lime-500/20 text-lime-300",
  Communication: "bg-red-500/20 text-red-300",
  Productivity: "bg-neutral-500/20 text-neutral-300",
  Integration: "bg-pink-500/20 text-pink-300",
};

export const CATEGORY_ACCENT: Record<BlockCategory, string> = {
  Control: "border-l-slate-500",
  Trigger: "border-l-teal-500",
  Document: "border-l-blue-500",
  Embedding: "border-l-violet-500",
  Storage: "border-l-emerald-500",
  Retrieval: "border-l-amber-500",
  RAG: "border-l-yellow-500",
  LLM: "border-l-rose-500",
  Agent: "border-l-fuchsia-500",
  Logic: "border-l-cyan-500",
  Transform: "border-l-orange-500",
  HITL: "border-l-lime-500",
  Communication: "border-l-red-500",
  Productivity: "border-l-neutral-500",
  Integration: "border-l-pink-500",
};

// ---- Block Type Registry ----

export const BLOCK_TYPES: BlockTypeDefinition[] = [
  // Control
  { type: "start", label: "Start", category: "Control", icon: "▶", defaultConfig: {}, inputs: [], outputs: ["out"] },
  { type: "end", label: "End", category: "Control", icon: "⏹", defaultConfig: {}, inputs: ["in"], outputs: [] },
  { type: "subworkflow", label: "Subworkflow", category: "Control", icon: "⇥", defaultConfig: { workflow_id: "", timeout_s: 0 }, inputs: ["in"], outputs: ["out"] },
  // Trigger
  { type: "manual_trigger", label: "Manual Trigger", category: "Trigger", icon: "☛", defaultConfig: {}, inputs: [], outputs: ["out"] },
  { type: "schedule_trigger", label: "Schedule Trigger", category: "Trigger", icon: "⧖", defaultConfig: { cron: "0 * * * *" }, inputs: [], outputs: ["out"] },
  { type: "gmail_trigger", label: "Gmail Trigger", category: "Communication", icon: "GM", defaultConfig: { event: "message_received", labelIds: ["INBOX"], readStatus: "unread", query: "" }, inputs: [], outputs: ["out"] },
  { type: "notion_trigger", label: "Notion Trigger", category: "Productivity", icon: "NO", defaultConfig: { event: "pageUpdatedInDatabase", databaseId: "", pageIds: [] }, inputs: [], outputs: ["out"] },
  { type: "wait", label: "Wait", category: "Trigger", icon: "⏱", defaultConfig: { duration_ms: 1000 }, inputs: ["in"], outputs: ["out"] },
  // Document
  { type: "document_loader", label: "Document Loader", category: "Document", icon: "📄", defaultConfig: { source: "" }, inputs: ["in"], outputs: ["docs"] },
  { type: "document_parser", label: "Document Parser", category: "Document", icon: "📑", defaultConfig: { mode: "vlm", fields: [], merge_pages: "merge" }, inputs: ["docs", "pages"], outputs: ["documents", "pages", "items"] },
  { type: "chunker", label: "Chunker", category: "Document", icon: "✂", defaultConfig: { strategy: "fixed", chunk_size: 512, overlap: 64 }, inputs: ["parsed"], outputs: ["chunks"] },
  // Embedding
  { type: "embedder", label: "Embedder", category: "Embedding", icon: "⊛", defaultConfig: { model: "text-embedding-3-small", dimensions: 1024 }, inputs: ["chunks"], outputs: ["embeddings"] },
  { type: "model_selector", label: "Model Selector", category: "Embedding", icon: "⊕", defaultConfig: { provider: "openai" }, inputs: ["in"], outputs: ["out"] },
  // Storage
  { type: "vector_store", label: "Vector Store", category: "Storage", icon: "⛁", defaultConfig: { collection: "", upsert: true }, inputs: ["embeddings"], outputs: ["stored"] },
  { type: "collection", label: "Collection", category: "Storage", icon: "⊞", defaultConfig: { name: "" }, inputs: ["in"], outputs: ["out"] },
  // Retrieval
  { type: "retriever", label: "Retriever", category: "Retrieval", icon: "⚲", defaultConfig: { top_k: 7, collection: "" }, inputs: ["query"], outputs: ["results"] },
  { type: "reranker", label: "Reranker", category: "Retrieval", icon: "⇅", defaultConfig: { model: "rerank-v1", top_n: 3 }, inputs: ["results", "query"], outputs: ["reranked"] },
  // RAG
  { type: "decision_review", label: "Decision Review", category: "RAG", icon: "⚖", defaultConfig: { collection: "", top_k: 10 }, inputs: ["query"], outputs: ["favorable", "contradicting", "verbatim"] },
  // LLM
  { type: "llm", label: "LLM", category: "LLM", icon: "◎", defaultConfig: { model: "gpt-4o-mini", temperature: 0.7, max_tokens: 1024 }, inputs: ["prompt"], outputs: ["response"] },
  { type: "prompt_template", label: "Prompt Template", category: "LLM", icon: "✎", defaultConfig: { template: "" }, inputs: ["vars"], outputs: ["prompt"] },
  { type: "answer", label: "Answer", category: "LLM", icon: "◉", defaultConfig: { format: "text" }, inputs: ["response"], outputs: ["out"] },
  // Agent
  { type: "ai_agent", label: "AI Agent", category: "Agent", icon: "A", defaultConfig: { systemPrompt: "You are a helpful assistant.", tokenBudget: 1024, maxSteps: 5, onError: "fail" }, inputs: ["prompt", "agent_languageModel", "agent_memory", "agent_tool"], outputs: ["answer", "out"] },
  // Logic
  { type: "condition", label: "Condition", category: "Logic", icon: "⬡", defaultConfig: { expression: "" }, inputs: ["in"], outputs: ["true", "false"] },
  { type: "switch", label: "Switch", category: "Logic", icon: "⍣", defaultConfig: { cases: [] }, inputs: ["in"], outputs: ["case_0", "case_1", "default"] },
  { type: "router", label: "Router", category: "Logic", icon: "⬢", defaultConfig: { routes: [] }, inputs: ["in"], outputs: ["out_0", "out_1", "out_2"] },
  { type: "ai_router", label: "AI Router", category: "Logic", icon: "🧠", defaultConfig: { routes: [], model: "gpt-4o-mini", temperature: 0, fallback_route: "" }, inputs: ["in"], outputs: ["out_0", "out_1", "out_2", "route"] },
  { type: "loop", label: "Loop", category: "Logic", icon: "↻", defaultConfig: { max_iterations: 10 }, inputs: ["in"], outputs: ["item", "done"] },
  { type: "merge", label: "Merge", category: "Logic", icon: "⬟", defaultConfig: { strategy: "concat" }, inputs: ["in_0", "in_1"], outputs: ["out"] },
  // Transform
  { type: "set", label: "Set", category: "Transform", icon: "≡", defaultConfig: { fields: [] }, inputs: ["in"], outputs: ["out"] },
  { type: "filter", label: "Filter", category: "Transform", icon: "⨷", defaultConfig: { expression: "" }, inputs: ["in"], outputs: ["kept", "dropped"] },
  { type: "aggregate", label: "Aggregate", category: "Transform", icon: "∑", defaultConfig: { group_by: [], aggregations: [] }, inputs: ["in"], outputs: ["out"] },
  { type: "sort", label: "Sort", category: "Transform", icon: "⇳", defaultConfig: { field: "", order: "asc" }, inputs: ["in"], outputs: ["out"] },
  { type: "limit", label: "Limit", category: "Transform", icon: "✂", defaultConfig: { count: 10 }, inputs: ["in"], outputs: ["out"] },
  { type: "split_out", label: "Split Out", category: "Transform", icon: "☩", defaultConfig: { field: "" }, inputs: ["in"], outputs: ["out"] },
  { type: "summarize", label: "Summarize", category: "Transform", icon: "Σ", defaultConfig: { group_by: [], operation: "count" }, inputs: ["in"], outputs: ["out"] },
  { type: "remove_duplicates", label: "Remove Duplicates", category: "Transform", icon: "⧄", defaultConfig: { fields: [] }, inputs: ["in"], outputs: ["out"] },
  { type: "datetime", label: "DateTime", category: "Transform", icon: "⧗", defaultConfig: { operation: "format", format: "ISO" }, inputs: ["in"], outputs: ["out"] },
  { type: "code", label: "Code", category: "Transform", icon: "{ }", defaultConfig: { language: "python", code: "" }, inputs: ["in"], outputs: ["out"] },
  { type: "variable", label: "Variable", category: "Transform", icon: "$", defaultConfig: { name: "", value: "" }, inputs: [], outputs: ["value"] },
  { type: "field_selector", label: "Field Selector", category: "Transform", icon: "☷", defaultConfig: { fields: [], source: "auto", output_format: "json", flatten: false }, inputs: ["in", "extracted", "tables"], outputs: ["out", "columns", "table"] },
  { type: "metadata_extractor", label: "Metadata Extractor", category: "Transform", icon: "⊡", defaultConfig: { fields: [] }, inputs: ["in"], outputs: ["out", "metadata"] },
  // HITL
  { type: "human_approval", label: "Human Approval", category: "HITL", icon: "✓", defaultConfig: { prompt: "", timeout_s: 86400 }, inputs: ["in"], outputs: ["approved", "rejected"] },
  { type: "human_form", label: "Human Form", category: "HITL", icon: "✍", defaultConfig: { fields: [] }, inputs: ["in"], outputs: ["submitted"] },
  // Integration
  { type: "http_request", label: "HTTP Request", category: "Integration", icon: "⇆", defaultConfig: { method: "GET", url: "" }, inputs: ["in"], outputs: ["response", "error"] },
  { type: "outbound_webhook", label: "Outbound Webhook", category: "Integration", icon: "↗", defaultConfig: { url: "", headers: "{}", forward_inputs: false, timeout: 30, retry: 0 }, inputs: ["in"], outputs: ["response", "error"] },
  { type: "webhook", label: "Webhook", category: "Integration", icon: "↯", defaultConfig: { url: "", secret: "" }, inputs: ["in"], outputs: ["out"] },
];

export function getBlockTypeDef(type: string): BlockTypeDefinition | undefined {
  return BLOCK_TYPES.find((b) => b.type === type);
}

// ---- Alias map (n8n-derived) for palette search ----
// Hardcoded locally to keep workflow-editor standalone-importable.
// Source: docs/research/n8n-catalog-mapping.md Section 6 + clients/sdk/ts/src/workflow/descriptors.ts.

export const BLOCK_ALIASES: Record<string, string[]> = {
  // Control / Trigger
  start: ["entry", "begin", "input", "trigger"],
  end: ["finish", "done", "exit", "output"],
  subworkflow: ["sub", "subflow", "child", "call", "invoke", "execute workflow"],
  manual_trigger: ["test", "run", "manual"],
  schedule_trigger: ["cron", "interval", "timer", "scheduled"],
  gmail_trigger: ["gmail", "email", "mail", "inbox", "message", "unread"],
  notion_trigger: ["notion", "page", "database", "wiki", "workspace"],
  wait: ["pause", "sleep", "delay", "wait", "hitl"],
  // Document / RAG ingest
  document_loader: ["load", "import", "ingest", "pdf", "docx", "html"],
  document_parser: ["parse", "pdf", "docx", "html", "ocr"],
  chunker: ["split", "chunk", "tokenize", "segment", "text-splitter"],
  // Embedding
  embedder: ["embed", "vectorize", "embedding", "schift-embed-1-small"],
  model_selector: ["router", "model-router", "cost", "quality"],
  // Storage
  vector_store: ["vectorstore", "engine", "schift-engine", "qdrant", "pinecone"],
  collection: ["collection", "bucket", "index", "namespace"],
  // Retrieval / RAG
  retriever: ["search", "retrieve", "knn", "ann", "vector-search", "rag-search"],
  reranker: ["rerank", "cross-encoder", "cohere-rerank"],
  decision_review: ["decision", "review", "case-review", "polarity", "dissent", "contradicting"],
  // LLM
  llm: ["llm", "openai", "anthropic", "gemini", "claude", "gpt", "chat"],
  prompt_template: ["prompt", "template", "format", "interpolate"],
  answer: ["answer", "result", "output", "respond"],
  ai_agent: ["agent", "react", "tool-use", "autonomous"],
  // Logic
  condition: ["router", "filter", "condition", "logic", "boolean", "branch", "if"],
  switch: ["router", "case", "branch", "switch"],
  router: ["router", "switch", "branch"],
  ai_router: ["intent", "classify", "ai", "router", "llm-router"],
  loop: ["loop", "iterate", "for", "foreach", "batch", "splitInBatches"],
  merge: ["join", "concatenate", "combine", "merge", "wait"],
  // Transform
  set: ["set", "edit", "assign", "modify", "fields"],
  filter: ["filter", "drop", "where", "select"],
  aggregate: ["aggregate", "group", "combine", "rollup"],
  sort: ["sort", "order", "arrange"],
  limit: ["limit", "take", "head", "tail", "top"],
  split_out: ["splitOut", "explode", "flatten", "unwind"],
  summarize: ["summarize", "groupBy", "count", "sum", "avg"],
  remove_duplicates: ["dedupe", "deduplicate", "unique", "distinct"],
  datetime: ["date", "time", "datetime", "format", "parse"],
  code: ["code", "javascript", "python", "js", "script", "function", "custom"],
  variable: ["var", "variable", "state", "context"],
  field_selector: ["select", "pick", "project", "rename"],
  metadata_extractor: ["extract", "ner", "metadata", "parse", "structured"],
  // HITL
  human_approval: ["approval", "hitl", "human", "review", "sign-off", "wait"],
  human_form: ["form", "input", "questionnaire", "hitl"],
  // Integration
  http_request: ["http", "rest", "api", "request", "url", "curl", "fetch"],
  outbound_webhook: ["webhook", "post", "callback", "http", "outbound"],
  webhook: ["http", "callback", "webhook", "trigger", "wh"],
};

// ---- Pure search filter (testable) ----

export function filterBlocksBySearch(
  blocks: BlockTypeDefinition[],
  query: string,
  aliases: Record<string, string[]> = BLOCK_ALIASES,
): BlockTypeDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;
  return blocks.filter((b) => {
    if (b.label.toLowerCase().includes(q)) return true;
    if (b.type.toLowerCase().includes(q)) return true;
    const aliasList = aliases[b.type] ?? [];
    return aliasList.some((a) => a.toLowerCase().includes(q));
  });
}
