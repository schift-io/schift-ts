/**
 * n8n workflow JSON → Schift workflow JSON converter.
 *
 * Imports an n8n workflow export (`{name, nodes, connections, ...}`) and
 * produces a Schift `WorkflowDefinition` (the YAML-friendly flat shape).
 *
 * Best-effort mapping. Unmapped node types fall back to the `code` block
 * with a TODO comment, and a warning is emitted. Malformed input (missing
 * `nodes` / `connections`, unknown types, etc.) is handled gracefully —
 * the function does not throw on shape problems, it returns warnings.
 *
 * Mapping table is intentionally narrow: only the n8n core nodes that
 * round-trip into Schift's first-class BlockTypes. See
 * `docs/research/n8n-catalog-mapping.md` for the full taxonomy.
 */
import type { BlockDef, EdgeDef, WorkflowDefinition } from "./yaml.js";

// ============================================================
// n8n shape (subset we read)
// ============================================================

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number] | { x?: number; y?: number };
  parameters?: Record<string, unknown>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  credentials?: Record<string, unknown>;
}

export interface N8nConnectionTarget {
  node: string;
  type?: string;
  index?: number;
}

/**
 * n8n connection shape:
 *   connections[<source node name>][<port type, e.g. "main">]
 *     [<output index>] -> Array<N8nConnectionTarget>
 *
 * The middle level is itself an array (per output index), and each entry
 * is an array of targets (one source output can fan out).
 */
export type N8nConnections = Record<
  string,
  Record<string, Array<Array<N8nConnectionTarget> | null | undefined>>
>;

export interface N8nWorkflow {
  name?: string;
  nodes?: N8nNode[];
  connections?: N8nConnections;
  active?: boolean;
  settings?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  tags?: unknown;
  pinData?: Record<string, unknown>;
  staticData?: unknown;
  versionId?: string;
  id?: string;
}

export interface N8nImportResult {
  workflow: WorkflowDefinition;
  warnings: string[];
}

// ============================================================
// Type mapping
// ============================================================

/** Schift BlockType the n8n node maps to. `null` = drop node entirely. */
type MappingTarget =
  | { kind: "block"; type: string }
  | { kind: "skip"; reason: string }
  | { kind: "unsupported"; reason: string };

const TYPE_MAP: Record<string, MappingTarget> = {
  // ---- Triggers ----
  "n8n-nodes-base.manualTrigger": { kind: "block", type: "manual_trigger" },
  "n8n-nodes-base.scheduleTrigger": { kind: "block", type: "schedule_trigger" },
  "n8n-nodes-base.cron": { kind: "block", type: "schedule_trigger" },
  "n8n-nodes-base.interval": { kind: "block", type: "schedule_trigger" },
  "n8n-nodes-base.webhook": { kind: "block", type: "webhook" },
  "n8n-nodes-base.gmailTrigger": { kind: "block", type: "gmail_trigger" },
  "n8n-nodes-base.notionTrigger": { kind: "block", type: "notion_trigger" },

  // ---- Flow / branching ----
  "n8n-nodes-base.if": { kind: "block", type: "condition" },
  "n8n-nodes-base.switch": { kind: "block", type: "switch" },
  "n8n-nodes-base.filter": { kind: "block", type: "filter" },
  "n8n-nodes-base.merge": { kind: "block", type: "merge" },
  "n8n-nodes-base.splitInBatches": { kind: "block", type: "loop" },

  // ---- Data transformation ----
  "n8n-nodes-base.set": { kind: "block", type: "set" },
  "n8n-nodes-base.code": { kind: "block", type: "code" },
  "n8n-nodes-base.function": { kind: "block", type: "code" },
  "n8n-nodes-base.functionItem": { kind: "block", type: "code" },
  "n8n-nodes-base.aggregate": { kind: "block", type: "aggregate" },
  "n8n-nodes-base.itemLists": { kind: "block", type: "aggregate" },
  "n8n-nodes-base.sort": { kind: "block", type: "sort" },
  "n8n-nodes-base.limit": { kind: "block", type: "limit" },
  "n8n-nodes-base.removeDuplicates": {
    kind: "block",
    type: "remove_duplicates",
  },
  "n8n-nodes-base.summarize": { kind: "block", type: "summarize" },
  "n8n-nodes-base.splitOut": { kind: "block", type: "split_out" },
  "n8n-nodes-base.dateTime": { kind: "block", type: "datetime" },

  // ---- IO / utility ----
  "n8n-nodes-base.httpRequest": { kind: "block", type: "http_request" },
  "n8n-nodes-base.respondToWebhook": { kind: "block", type: "answer" },
  "n8n-nodes-base.wait": { kind: "block", type: "wait" },
  "n8n-nodes-base.noOp": { kind: "block", type: "variable" },

  // ---- Skipped (not real flow nodes) ----
  "n8n-nodes-base.stickyNote": { kind: "skip", reason: "sticky note" },
  "n8n-nodes-base.errorTrigger": {
    kind: "skip",
    reason: "error trigger not supported",
  },

  // ---- Runtime bridge nodes ----
  "n8n-nodes-base.executeWorkflow": { kind: "block", type: "subworkflow" },
  "@n8n/n8n-nodes-langchain.agent": { kind: "block", type: "ai_agent" },
};

/** LangChain LLM chat models — all map to `llm`. */
function isLangchainLlmChat(type: string): boolean {
  return type.startsWith("@n8n/n8n-nodes-langchain.lmChat");
}

/** LangChain embeddings → `embedder`. */
function isLangchainEmbeddings(type: string): boolean {
  return type.startsWith("@n8n/n8n-nodes-langchain.embeddings");
}

/** Branches that should split into named handles instead of "out". */
const NAMED_OUTPUT_TYPES = new Set(["condition", "switch"]);

// ============================================================
// Helpers
// ============================================================

function slugify(name: string, fallback: string): string {
  if (!name) return fallback;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function normalizePosition(
  pos: N8nNode["position"],
): { x: number; y: number } | undefined {
  if (!pos) return undefined;
  if (Array.isArray(pos)) {
    const [x, y] = pos;
    if (typeof x === "number" && typeof y === "number") return { x, y };
    return undefined;
  }
  if (typeof pos === "object") {
    const x = typeof pos.x === "number" ? pos.x : 0;
    const y = typeof pos.y === "number" ? pos.y : 0;
    return { x, y };
  }
  return undefined;
}

function classifyNodeType(type: string): MappingTarget {
  if (type in TYPE_MAP) return TYPE_MAP[type]!;
  if (isLangchainLlmChat(type)) return { kind: "block", type: "llm" };
  if (isLangchainEmbeddings(type)) return { kind: "block", type: "embedder" };
  return { kind: "unsupported", reason: `n8n type '${type}' not yet supported` };
}

function compactConfig(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function normalizeIntegrationTriggerConfig(
  schiftType: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (schiftType === "gmail_trigger") {
    const filters =
      params.filters && typeof params.filters === "object" && !Array.isArray(params.filters)
        ? (params.filters as Record<string, unknown>)
        : {};
    return compactConfig({
      ...params,
      provider: "gmail",
      event: params.event ?? "message_received",
      labelIds: filters.labelIds ?? params.labelIds,
      readStatus: filters.readStatus ?? params.readStatus,
      query: filters.q ?? filters.query ?? params.query,
    });
  }
  if (schiftType === "notion_trigger") {
    return compactConfig({
      ...params,
      provider: "notion",
      event: params.event ?? "pageUpdatedInDatabase",
      databaseId: params.databaseId ?? params.database_id,
      pageIds: params.pageIds ?? params.page_ids,
    });
  }
  return params;
}

/**
 * For source handles on branching nodes, map (output index, total outputs)
 * to a stable handle name.
 */
function sourceHandleFor(
  schiftType: string,
  outputIndex: number,
  totalOutputs: number,
): string {
  if (schiftType === "condition") {
    if (outputIndex === 0) return "true";
    if (outputIndex === 1) return "false";
    return `out_${outputIndex}`;
  }
  if (schiftType === "switch") {
    // n8n switch: last index is conventionally "default" in some versions.
    // We treat the final index as "default" only when totalOutputs > 1.
    if (outputIndex === totalOutputs - 1 && totalOutputs > 1) {
      // But still emit numeric for index 0..N-2; default for the tail.
      return "default";
    }
    return String(outputIndex);
  }
  return "out";
}

// ============================================================
// Main converter
// ============================================================

export function importN8nWorkflow(n8n: N8nWorkflow): N8nImportResult {
  const warnings: string[] = [];

  // Defensive defaults — the function should never throw on shape.
  const rawNodes = Array.isArray(n8n?.nodes) ? n8n.nodes : [];
  const rawConnections =
    n8n && typeof n8n.connections === "object" && n8n.connections !== null
      ? n8n.connections
      : ({} as N8nConnections);

  if (!Array.isArray(n8n?.nodes)) {
    if (n8n && "nodes" in n8n && n8n.nodes !== undefined) {
      warnings.push("n8n workflow has invalid 'nodes' field; treating as empty");
    }
  }
  if (
    n8n &&
    "connections" in n8n &&
    n8n.connections !== undefined &&
    (typeof n8n.connections !== "object" || n8n.connections === null)
  ) {
    warnings.push(
      "n8n workflow has invalid 'connections' field; treating as empty",
    );
  }

  // Pass 1: build blocks, skipping unwanted nodes. Track:
  //   - n8n node name → Schift block id (for connection lookup)
  //   - n8n node name → Schift block type (to resolve handle naming)
  const nameToId = new Map<string, string>();
  const nameToType = new Map<string, string>();
  const usedIds = new Set<string>();
  const blocks: BlockDef[] = [];

  rawNodes.forEach((node, idx) => {
    if (!node || typeof node !== "object" || !node.name || !node.type) {
      warnings.push(`Skipping malformed node at index ${idx}`);
      return;
    }

    const mapping = classifyNodeType(node.type);

    if (mapping.kind === "skip") {
      // Don't even warn for sticky notes; they're noise.
      if (node.type !== "n8n-nodes-base.stickyNote") {
        warnings.push(
          `Skipped node '${node.name}' (${node.type}): ${mapping.reason}`,
        );
      }
      return;
    }

    let schiftType: string;
    let config: Record<string, unknown> | undefined;

    if (mapping.kind === "block") {
      schiftType = mapping.type;
      const params = node.parameters;
      if (params && typeof params === "object" && Object.keys(params).length) {
        config = normalizeIntegrationTriggerConfig(schiftType, { ...params });
      } else if (schiftType === "gmail_trigger" || schiftType === "notion_trigger") {
        config = normalizeIntegrationTriggerConfig(schiftType, {});
      }
    } else {
      // unsupported -> fall back to code block with TODO marker
      schiftType = "code";
      config = {
        code: `// TODO: n8n type '${node.type}' not yet supported`,
        _n8n_original_type: node.type,
        _n8n_original_parameters: node.parameters ?? {},
      };
      warnings.push(
        `Unsupported n8n type '${node.type}' (node '${node.name}'): ` +
          `fell back to 'code' block. ${mapping.reason}`,
      );
    }

    // Build a stable, unique block id.
    const baseId = node.id
      ? slugify(node.id, `n_${idx}`)
      : slugify(node.name, `n_${idx}`);
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${baseId}_${suffix++}`;
    }
    usedIds.add(id);

    const block: BlockDef = {
      id,
      type: schiftType,
      title: node.name,
    };
    const position = normalizePosition(node.position);
    if (position) block.position = position;
    if (config) block.config = config;

    blocks.push(block);
    nameToId.set(node.name, id);
    nameToType.set(node.name, schiftType);
  });

  // Pass 2: build edges from n8n's connections graph.
  const edges: EdgeDef[] = [];

  for (const [sourceName, ports] of Object.entries(rawConnections)) {
    if (!ports || typeof ports !== "object") continue;
    const sourceId = nameToId.get(sourceName);
    if (!sourceId) {
      // Source was skipped or doesn't exist; nothing to connect.
      continue;
    }
    const sourceType = nameToType.get(sourceName) ?? "";

    // n8n has multiple port types ("main", "ai_languageModel", ...). For
    // Schift Phase 1 we only translate "main"; other ports are recorded
    // as warnings so the user knows they were dropped.
    for (const [portType, outputs] of Object.entries(ports)) {
      if (portType !== "main") {
        warnings.push(
          `Connection from '${sourceName}' on port '${portType}' was dropped ` +
            `(only 'main' is currently translated)`,
        );
        continue;
      }
      if (!Array.isArray(outputs)) continue;

      const totalOutputs = outputs.length;
      outputs.forEach((targets, outputIndex) => {
        if (!Array.isArray(targets)) return;
        const sourceHandle = NAMED_OUTPUT_TYPES.has(sourceType)
          ? sourceHandleFor(sourceType, outputIndex, totalOutputs)
          : "out";

        for (const target of targets) {
          if (!target || typeof target !== "object" || !target.node) continue;
          const targetId = nameToId.get(target.node);
          if (!targetId) {
            warnings.push(
              `Edge from '${sourceName}' → '${target.node}' dropped ` +
                `(target was skipped or missing)`,
            );
            continue;
          }
          edges.push({
            source: sourceId,
            target: targetId,
            source_handle: sourceHandle,
            target_handle: "in",
          });
        }
      });
    }
  }

  const workflow: WorkflowDefinition = {
    version: 1,
    name: n8n?.name?.trim() || "Imported n8n workflow",
    blocks,
    edges,
  };

  return { workflow, warnings };
}
