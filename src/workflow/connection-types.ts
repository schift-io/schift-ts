/**
 * Schift Connection Types — typed ports for workflow node inputs/outputs.
 *
 * Mirrors n8n's `NodeConnectionTypes` (https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts)
 * with two changes:
 *
 *  1. n8n splits RAG into 5 sidecar ports (ai_vectorStore / ai_retriever / ai_embedding /
 *     ai_textSplitter / ai_document). Schift's vector store is single (engine), so we collapse
 *     them into unified `rag_*` ports.
 *  2. We add Schift first-class concepts: `rag_bucket`, `rag_collection`, `rag_decisionReview`.
 *
 * Edges in a workflow connect an output port (typed) to an input port (same type).
 * "Main" edges carry the data flow. "ai_*" / "rag_*" / "human_*" are sidecar dependencies
 * (e.g. an AI Agent node has a Main in/out plus an `agent_languageModel` sidecar input that
 * pulls a Language Model node into the agent's runtime).
 */

export const ConnectionTypes = {
  /** Default data flow (item array). All non-AI nodes use this. */
  Main: "main",

  // ===== Agent / LLM core (mirrors n8n ai_*) =====
  /** Language model dependency (OpenAI / Anthropic / Gemini / Ollama / BYOK). */
  AgentLanguageModel: "agent_languageModel",
  /** Conversation memory (buffer / summary / vector). */
  AgentMemory: "agent_memory",
  /** Tool dependency (HTTP / Code / MCP / Sub-Workflow / RAG). */
  AgentTool: "agent_tool",
  /** Output parser (structured / autofix / item-list). */
  AgentOutputParser: "agent_outputParser",
  /** Guardrails / policy filter. */
  AgentGuardrail: "agent_guardrail",

  // ===== RAG-native (Schift first-class — n8n equivalent split across 5 ports) =====
  /** Bucket reference (top-level RAG container). */
  RagBucket: "rag_bucket",
  /** Collection reference (sub-container, has its own embedding+chunking config). */
  RagCollection: "rag_collection",
  /** Search result handle (chunks + scores). */
  RagSearch: "rag_search",
  /** Decision-review pipeline result (favorable + contradicting evidence). */
  RagDecisionReview: "rag_decisionReview",
  /** Embedding model (default: schift-embed-1-small). */
  RagEmbedding: "rag_embedding",
  /** Reranker model (Cohere / our own). */
  RagReranker: "rag_reranker",
  /** Document loader / ingest pipeline handle. */
  RagDocumentLoader: "rag_documentLoader",
  /** Text splitter (recursive / character / token). */
  RagTextSplitter: "rag_textSplitter",

  // ===== Human-in-the-Loop =====
  /** Pending approval (Slack / Email / Form). */
  HumanApproval: "human_approval",
  /** Pending form input. */
  HumanForm: "human_form",
} as const;

export type ConnectionType = (typeof ConnectionTypes)[keyof typeof ConnectionTypes];

export type AIConnectionType = Exclude<ConnectionType, typeof ConnectionTypes.Main>;

export const allConnectionTypes: ConnectionType[] = Object.values(ConnectionTypes);

/**
 * Connection types are grouped into families for UI/docs filtering.
 */
export const ConnectionFamilies = {
  data: [ConnectionTypes.Main],
  agent: [
    ConnectionTypes.AgentLanguageModel,
    ConnectionTypes.AgentMemory,
    ConnectionTypes.AgentTool,
    ConnectionTypes.AgentOutputParser,
    ConnectionTypes.AgentGuardrail,
  ],
  rag: [
    ConnectionTypes.RagBucket,
    ConnectionTypes.RagCollection,
    ConnectionTypes.RagSearch,
    ConnectionTypes.RagDecisionReview,
    ConnectionTypes.RagEmbedding,
    ConnectionTypes.RagReranker,
    ConnectionTypes.RagDocumentLoader,
    ConnectionTypes.RagTextSplitter,
  ],
  hitl: [ConnectionTypes.HumanApproval, ConnectionTypes.HumanForm],
} as const;

export type ConnectionFamily = keyof typeof ConnectionFamilies;

/**
 * Returns the family bucket for a given connection type.
 */
export function familyOf(t: ConnectionType): ConnectionFamily {
  for (const [family, types] of Object.entries(ConnectionFamilies) as [
    ConnectionFamily,
    readonly ConnectionType[],
  ][]) {
    if (types.includes(t)) return family;
  }
  return "data";
}

/**
 * Two ports are compatible iff they are the exact same connection type.
 * (n8n uses the same rule. We can relax later for variance/subtyping.)
 */
export function isCompatible(
  source: ConnectionType,
  target: ConnectionType,
): boolean {
  return source === target;
}
