/**
 * YAML serialization for Schift workflows.
 *
 * Converts between YAML strings and WorkflowDefinition objects.
 * Requires `js-yaml` as an optional peer dependency:
 *
 *   npm install js-yaml
 *
 * Functions that don't need YAML parsing (validateDefinition,
 * definitionFromApiResponse, definitionToApiDict) work without it.
 */

const CURRENT_SCHEMA_VERSION = 1;

// ---- Definition Types (YAML-friendly, flat config) ----

export interface BlockDef {
  id: string;
  type: string;
  title?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
}

export interface EdgeDef {
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
}

export interface WorkflowDefinition {
  version: number;
  name: string;
  description?: string;
  status?: string;
  blocks: BlockDef[];
  edges: EdgeDef[];
}

// ---- Helpers ----

export function titleFromType(blockType: string): string {
  return blockType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function importYaml(): Promise<typeof import("js-yaml")> {
  try {
    return await import("js-yaml");
  } catch {
    throw new Error(
      "js-yaml is required for YAML support. Install it with: npm install js-yaml",
    );
  }
}

// ---- YAML Parsing ----

/**
 * Parse a YAML string into a WorkflowDefinition.
 * Requires `js-yaml` to be installed.
 */
export async function workflowFromYaml(
  yamlStr: string,
): Promise<WorkflowDefinition> {
  const yaml = await importYaml();
  const data = yaml.load(yamlStr) as Record<string, unknown> | null;
  return parseData(data);
}

/**
 * Serialize a WorkflowDefinition to a YAML string.
 * Requires `js-yaml` to be installed.
 */
export async function workflowToYaml(
  definition: WorkflowDefinition,
): Promise<string> {
  const yaml = await importYaml();
  const d = definitionToDict(definition);
  return yaml.dump(d, { sortKeys: false, lineWidth: -1 });
}

// ---- Sync Utilities (no js-yaml needed) ----

/**
 * Validate a WorkflowDefinition locally.
 * Returns a list of error/warning strings (empty = valid).
 */
export function validateDefinition(
  definition: WorkflowDefinition,
): string[] {
  const errors: string[] = [];

  if (!definition.blocks.length) {
    errors.push("Workflow has no blocks");
    return errors;
  }

  // Duplicate IDs
  const blockIds = new Set<string>();
  for (const b of definition.blocks) {
    if (blockIds.has(b.id)) {
      errors.push(`Duplicate block ID: '${b.id}'`);
    }
    blockIds.add(b.id);
  }

  // Edge references
  for (const e of definition.edges) {
    if (!blockIds.has(e.source)) {
      errors.push(`Edge references non-existent source block: '${e.source}'`);
    }
    if (!blockIds.has(e.target)) {
      errors.push(`Edge references non-existent target block: '${e.target}'`);
    }
  }

  // Cycle detection (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const bid of blockIds) {
    inDegree.set(bid, 0);
    adjacency.set(bid, []);
  }
  for (const e of definition.edges) {
    if (blockIds.has(e.source) && blockIds.has(e.target)) {
      adjacency.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [bid, deg] of inDegree) {
    if (deg === 0) queue.push(bid);
  }
  let visited = 0;
  while (queue.length) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  if (visited !== blockIds.size) {
    errors.push("Workflow contains a cycle");
  }

  // Disconnected blocks
  if (definition.blocks.length > 1) {
    const connected = new Set<string>();
    for (const e of definition.edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    for (const b of definition.blocks) {
      if (!connected.has(b.id)) {
        errors.push(`Block '${b.id}' is disconnected`);
      }
    }
  }

  // Server-only (Tier 3) warnings. These are official workflow block types,
  // but the local SDK runner cannot execute them without the API runtime.
  const TIER3_TYPES = new Set([
    "webhook_source", "ingest_bridge", "feed_poll", "notify",
    "webhook", "http_request", "document_loader", "document_parser",
    "chunker", "code", "ai_router", "rag", "source_query", "source_write",
    "set", "filter", "switch", "aggregate", "sort", "limit",
    "split_out", "summarize", "remove_duplicates", "datetime", "wait",
    "schedule_trigger", "manual_trigger", "gmail_trigger", "notion_trigger",
    "subworkflow", "outbound_webhook",
  ]);
  for (const b of definition.blocks) {
    if (TIER3_TYPES.has(b.type)) {
      errors.push(
        `Block '${b.id}' (type=${b.type}) is server-only; ` +
        "local SDK execution may not support it",
      );
    }
  }

  return errors;
}

/**
 * Convert an API workflow response (nodes/params format) to WorkflowDefinition.
 */
export function definitionFromApiResponse(
  data: Record<string, unknown>,
): WorkflowDefinition {
  const graph = (data.graph ?? {}) as Record<string, unknown>;
  const rawNodes = (graph.nodes ?? []) as Record<string, unknown>[];
  const rawEdges = (graph.edges ?? []) as Record<string, unknown>[];

  const blocks: BlockDef[] = rawNodes.map((n) => {
    const configRaw = (n.config ?? {}) as Record<string, unknown>;
    const config = (
      typeof configRaw === "object" && configRaw !== null && "params" in configRaw
        ? configRaw.params
        : configRaw
    ) as Record<string, unknown>;

    const posRaw = n.position as { x: number; y: number } | undefined;

    return {
      id: n.id as string,
      type: n.type as string,
      title: (n.title as string) || undefined,
      position: posRaw ? { x: posRaw.x, y: posRaw.y } : undefined,
      config: config && Object.keys(config).length ? config : undefined,
    };
  });

  const edges: EdgeDef[] = rawEdges.map((e) => ({
    source: e.source as string,
    target: e.target as string,
    source_handle: (e.source_handle as string) || "output",
    target_handle: (e.target_handle as string) || "input",
  }));

  return {
    version: CURRENT_SCHEMA_VERSION,
    name: (data.name as string) ?? "",
    description: (data.description as string) || undefined,
    status: (data.status as string) || "draft",
    blocks,
    edges,
  };
}

/**
 * Convert a WorkflowDefinition to API-compatible dict (nodes key, config.params wrapper).
 */
export function definitionToApiDict(
  def: WorkflowDefinition,
): Record<string, unknown> {
  const nodes = def.blocks.map((b) => ({
    id: b.id,
    type: b.type,
    title: b.title || titleFromType(b.type),
    position: b.position ?? { x: 0, y: 0 },
    config: { params: b.config ?? {} },
  }));

  const edges = def.edges.map((e) => ({
    id: `${e.source}_${e.target}`,
    source: e.source,
    target: e.target,
    source_handle: e.source_handle ?? "output",
    target_handle: e.target_handle ?? "input",
  }));

  return {
    name: def.name,
    description: def.description ?? "",
    status: def.status ?? "draft",
    graph: { nodes, edges },
  };
}

// ---- Internal ----

function definitionToDict(
  def: WorkflowDefinition,
): Record<string, unknown> {
  const d: Record<string, unknown> = {
    version: def.version,
    name: def.name,
  };
  if (def.description) d.description = def.description;
  if (def.status && def.status !== "draft") d.status = def.status;

  d.blocks = def.blocks.map((b) => {
    const bd: Record<string, unknown> = { id: b.id, type: b.type };
    if (b.title && b.title !== titleFromType(b.type)) bd.title = b.title;
    if (b.position) bd.position = { x: b.position.x, y: b.position.y };
    if (b.config && Object.keys(b.config).length) bd.config = b.config;
    return bd;
  });

  if (def.edges.length) {
    d.edges = def.edges.map((e) => {
      const ed: Record<string, unknown> = {
        source: e.source,
        target: e.target,
      };
      if (e.source_handle && e.source_handle !== "output")
        ed.source_handle = e.source_handle;
      if (e.target_handle && e.target_handle !== "input")
        ed.target_handle = e.target_handle;
      return ed;
    });
  }

  return d;
}

function parseData(
  data: Record<string, unknown> | null | undefined,
): WorkflowDefinition {
  if (!data || typeof data !== "object") {
    throw new Error(
      "Invalid YAML: expected a mapping with at least 'name' and 'blocks'",
    );
  }

  // Version check
  const version = data.version as number | undefined;
  if (version == null) {
    throw new Error("Missing required field: 'version'");
  }
  if (version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version: ${version} (expected ${CURRENT_SCHEMA_VERSION})`,
    );
  }

  const name = data.name as string | undefined;
  if (!name) {
    throw new Error("Missing required field: 'name'");
  }

  const rawBlocks = data.blocks as Record<string, unknown>[] | undefined;
  if (!rawBlocks || !Array.isArray(rawBlocks) || !rawBlocks.length) {
    throw new Error("Missing or empty required field: 'blocks'");
  }

  // Parse blocks
  const seenIds = new Set<string>();
  const blocks: BlockDef[] = [];

  for (let i = 0; i < rawBlocks.length; i++) {
    const rb = rawBlocks[i];
    if (!rb || typeof rb !== "object") {
      throw new Error(`Block at index ${i} is not a mapping`);
    }

    const bid = rb.id as string | undefined;
    if (!bid) throw new Error(`Block at index ${i} missing required field: 'id'`);

    const btype = rb.type as string | undefined;
    if (!btype)
      throw new Error(`Block '${bid}' missing required field: 'type'`);

    if (seenIds.has(bid)) {
      throw new Error(`Duplicate block ID: '${bid}'`);
    }
    seenIds.add(bid);

    const posRaw = rb.position as { x: number; y: number } | undefined;
    const position =
      posRaw && typeof posRaw === "object"
        ? { x: Number(posRaw.x ?? 0), y: Number(posRaw.y ?? 0) }
        : undefined;

    blocks.push({
      id: bid,
      type: btype,
      title: (rb.title as string) || titleFromType(btype),
      position,
      config:
        (rb.config as Record<string, unknown>) ??
        undefined,
    });
  }

  // Parse edges
  const edges: EdgeDef[] = [];
  const rawEdges = (data.edges ?? []) as Record<string, unknown>[];
  if (!Array.isArray(rawEdges)) {
    throw new Error("'edges' must be a list");
  }

  for (let i = 0; i < rawEdges.length; i++) {
    const re = rawEdges[i];
    if (!re || typeof re !== "object") {
      throw new Error(`Edge at index ${i} is not a mapping`);
    }
    const source = re.source as string | undefined;
    const target = re.target as string | undefined;
    if (!source || !target) {
      throw new Error(`Edge at index ${i} missing 'source' or 'target'`);
    }
    if (!seenIds.has(source)) {
      throw new Error(
        `Edge references non-existent source block: '${source}'`,
      );
    }
    if (!seenIds.has(target)) {
      throw new Error(
        `Edge references non-existent target block: '${target}'`,
      );
    }

    edges.push({
      source,
      target,
      source_handle: (re.source_handle as string) ?? "output",
      target_handle: (re.target_handle as string) ?? "input",
    });
  }

  return {
    version,
    name,
    description: (data.description as string) || undefined,
    status: (data.status as string) || "draft",
    blocks,
    edges,
  };
}
