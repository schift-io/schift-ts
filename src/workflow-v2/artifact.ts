/**
 * Lightweight Workflow v2 artifact surface.
 *
 * This file intentionally has no Vercel AI SDK, Google Gen AI, or LangGraph
 * imports. Framework adapters live in separate packages and consume this
 * artifact through its canonical JSON/YAML methods.
 */

import { WorkflowRunner } from "../workflow/engine.js";
import type { WorkflowRunResult } from "../workflow/engine.js";
import type { WorkflowDefinition } from "../workflow/yaml.js";
import { makeWorkflowV2RuntimeClient } from "../workflow/v2-runtime.js";
import type { WorkflowV2RuntimeMiddleware } from "../workflow/v2-runtime.js";

const WORKFLOW_V2_RUNTIME = "schift.workflow.v2";

export interface WorkflowV2Block {
  id: string;
  type: string;
  title?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
  capabilities?: string[];
}

export interface WorkflowV2Edge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowV2Document {
  schemaVersion: 2;
  runtime: typeof WORKFLOW_V2_RUNTIME;
  name: string;
  description?: string;
  blocks: WorkflowV2Block[];
  edges: WorkflowV2Edge[];
  policies?: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface WorkflowV2ArtifactInput {
  yaml?: string;
  workflow?: WorkflowV2Document;
}

export interface WorkflowV2RunOptions {
  inputs?: Record<string, unknown>;
  client?: unknown;
  middleware?: WorkflowV2RuntimeMiddleware;
}

export type WorkflowV2RunResult = WorkflowRunResult;
export type {
  WorkflowV2HumanApprovalRequest,
  WorkflowV2HumanFormRequest,
  WorkflowV2HumanInputRequest,
  WorkflowV2HttpRequest,
  WorkflowV2MetadataEntry,
  WorkflowV2DocumentExtractRequest,
  WorkflowV2RuntimeMiddleware,
  WorkflowV2SecretRead,
  WorkflowV2SourceQuery,
  WorkflowV2SourceWrite,
  WorkflowV2SubworkflowRun,
  WorkflowV2ToolCallRequest,
  WorkflowV2WaitRequest,
  WorkflowV2WebhookEvent,
} from "../workflow/v2-runtime.js";

export type WorkflowV2StreamEvent =
  | {
      type: "workflow.started";
      workflowName: string;
      inputs: Record<string, unknown>;
    }
  | {
      type: "block.completed";
      blockId: string;
      blockState: unknown;
    }
  | {
      type: "workflow.completed";
      run: WorkflowV2RunResult;
    }
  | {
      type: "workflow.failed";
      run: WorkflowV2RunResult;
      error?: string;
    }
  | {
      type: "workflow.error";
      error: string;
    };

type WorkflowV2Record = Record<string, unknown>;
type WorkflowV2RunArgument = Record<string, unknown> | WorkflowV2RunOptions;

function isRecord(value: unknown): value is WorkflowV2Record {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function importYaml(): Promise<typeof import("js-yaml")> {
  try {
    return await import("js-yaml");
  } catch {
    throw new Error(
      "js-yaml is required for Workflow v2 YAML support. Install it with: npm install js-yaml",
    );
  }
}

function normalizeEdge(edge: unknown): WorkflowV2Edge {
  if (!isRecord(edge)) throw new Error("Workflow v2 edge must be an object.");
  return {
    source: String(edge.source ?? ""),
    target: String(edge.target ?? ""),
    sourceHandle: String(edge.sourceHandle ?? edge.source_handle ?? "output"),
    targetHandle: String(edge.targetHandle ?? edge.target_handle ?? "input"),
  };
}

function normalizeWorkflow(value: unknown): WorkflowV2Document {
  if (!isRecord(value)) {
    throw new Error("Workflow v2 document must be an object.");
  }

  const schemaVersion = value.schemaVersion ?? value.schema_version;
  if (schemaVersion !== 2) {
    throw new Error("Workflow v2 document must set schema_version: 2.");
  }
  if (value.runtime !== WORKFLOW_V2_RUNTIME) {
    throw new Error(`Workflow v2 document must set runtime: ${WORKFLOW_V2_RUNTIME}.`);
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new Error("Workflow v2 document must set a name.");
  }
  if (!Array.isArray(value.blocks)) {
    throw new Error("Workflow v2 document must include blocks.");
  }
  if (!Array.isArray(value.edges)) {
    throw new Error("Workflow v2 document must include edges.");
  }

  return {
    schemaVersion: 2,
    runtime: WORKFLOW_V2_RUNTIME,
    name: value.name,
    description: typeof value.description === "string" ? value.description : undefined,
    blocks: value.blocks.map((block) => {
      if (!isRecord(block)) throw new Error("Workflow v2 block must be an object.");
      return {
        id: String(block.id ?? ""),
        type: String(block.type ?? ""),
        title: typeof block.title === "string" ? block.title : undefined,
        config: isRecord(block.config) ? block.config : undefined,
        capabilities: Array.isArray(block.capabilities)
          ? block.capabilities.map(String)
          : undefined,
      };
    }),
    edges: value.edges.map(normalizeEdge),
    policies: isRecord(value.policies) ? value.policies : undefined,
    bindings: isRecord(value.bindings) ? value.bindings : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function toYamlShape(workflow: WorkflowV2Document): WorkflowV2Record {
  return {
    schema_version: workflow.schemaVersion,
    runtime: workflow.runtime,
    name: workflow.name,
    ...(workflow.description ? { description: workflow.description } : {}),
    blocks: workflow.blocks,
    edges: workflow.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle && edge.sourceHandle !== "output"
        ? { source_handle: edge.sourceHandle }
        : {}),
      ...(edge.targetHandle && edge.targetHandle !== "input"
        ? { target_handle: edge.targetHandle }
        : {}),
    })),
    ...(workflow.bindings ? { bindings: workflow.bindings } : {}),
    ...(workflow.policies ? { policies: workflow.policies } : {}),
    ...(workflow.metadata ? { metadata: workflow.metadata } : {}),
  };
}

function toWorkflowDefinition(workflow: WorkflowV2Document): WorkflowDefinition {
  return {
    version: 1,
    name: workflow.name,
    description: workflow.description,
    blocks: workflow.blocks.map((block) => ({
      id: block.id,
      type: localBlockType(block.type),
      title: block.title,
      config: block.config,
    })),
    edges: workflow.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      source_handle: edge.sourceHandle,
      target_handle: edge.targetHandle,
    })),
    status: "draft",
  };
}

function localBlockType(type: string): string {
  if (type === "llm_generate") return "llm";
  if (type === "webhook") return "v2_webhook";
  if (type === "webhook_source") return "v2_webhook_source";
  if (type === "outbound_webhook") return "v2_outbound_webhook";
  if (type === "source_query") return "v2_source_query";
  if (type === "source_write") return "v2_source_write";
  if (type === "metadata_store") return "v2_metadata_store";
  if (type === "http_request") return "v2_http_request";
  if (type === "secret_read") return "v2_secret_read";
  if (type === "subworkflow") return "v2_subworkflow";
  if (type === "human_approval") return "v2_human_approval";
  if (type === "human_form") return "v2_human_form";
  if (type === "human_input") return "v2_human_input";
  if (type === "transform") return "v2_transform";
  if (type === "document_extract") return "v2_document_extract";
  if (type === "tool_call") return "v2_tool_call";
  if (type === "iteration") return "v2_iteration";
  if (type === "iteration_boundary") return "v2_iteration_boundary";
  if (type === "loop") return "v2_loop";
  if (type === "loop_boundary") return "v2_loop_boundary";
  if (type === "wait") return "v2_wait";
  return type;
}

function isRunOptions(value: unknown): value is WorkflowV2RunOptions {
  return (
    isRecord(value) &&
    ("inputs" in value || "client" in value || "middleware" in value)
  );
}

function resolveRunOptions(arg?: WorkflowV2RunArgument): {
  inputs: Record<string, unknown>;
  client?: unknown;
  middleware?: WorkflowV2RuntimeMiddleware;
} {
  const options = isRunOptions(arg) ? arg : undefined;
  const inputs = options ? options.inputs ?? {} : isRecord(arg) ? arg : {};
  return { inputs, client: options?.client, middleware: options?.middleware };
}

export class SchiftWorkflowArtifact {
  readonly yaml?: string;
  private readonly workflow?: WorkflowV2Document;

  constructor(input: WorkflowV2ArtifactInput) {
    if (!input.yaml && !input.workflow) {
      throw new Error("schift.workflow() requires `yaml` or `workflow`.");
    }
    this.yaml = input.yaml;
    this.workflow = input.workflow ? normalizeWorkflow(input.workflow) : undefined;
  }

  async toJSON(): Promise<WorkflowV2Document> {
    if (this.workflow) return this.workflow;
    const yaml = await importYaml();
    return normalizeWorkflow(yaml.load(this.yaml ?? ""));
  }

  async toYaml(): Promise<string> {
    const yaml = await importYaml();
    return yaml.dump(toYamlShape(await this.toJSON()), {
      sortKeys: false,
      lineWidth: -1,
    });
  }

  async validate(): Promise<string[]> {
    const workflow = await this.toJSON();
    const errors: string[] = [];
    const ids = new Set<string>();
    for (const block of workflow.blocks) {
      if (!block.id) errors.push("Workflow v2 block is missing id.");
      if (!block.type) errors.push(`Workflow v2 block '${block.id}' is missing type.`);
      if (ids.has(block.id)) errors.push(`Duplicate block ID: '${block.id}'.`);
      ids.add(block.id);
    }
    for (const edge of workflow.edges) {
      if (!ids.has(edge.source)) {
        errors.push(`Edge references missing source block: '${edge.source}'.`);
      }
      if (!ids.has(edge.target)) {
        errors.push(`Edge references missing target block: '${edge.target}'.`);
      }
    }
    return errors;
  }

  /**
   * Execute the complete Workflow v2 graph locally in the caller's process.
   * YAML stays a portable contract; it is not sent to Schift Cloud by default.
   */
  async run(arg?: WorkflowV2RunArgument): Promise<WorkflowV2RunResult> {
    const { inputs, client, middleware } = resolveRunOptions(arg);
    const workflow = await this.toJSON();
    const runner = new WorkflowRunner(
      toWorkflowDefinition(workflow),
      makeWorkflowV2RuntimeClient(client, middleware, workflow),
    );
    return runner.run(inputs);
  }

  /**
   * Async event view over a Schift runtime execution.
   */
  async *stream(
    arg?: WorkflowV2RunArgument,
  ): AsyncGenerator<WorkflowV2StreamEvent, void, unknown> {
    const { inputs } = resolveRunOptions(arg);
    const workflow = await this.toJSON();
    yield {
      type: "workflow.started",
      workflowName: workflow.name,
      inputs,
    };

    try {
      const run = await this.run(arg);
      for (const [blockId, blockState] of Object.entries(run.blockStates)) {
        yield { type: "block.completed", blockId, blockState };
      }
      if (run.status === "failed") {
        yield { type: "workflow.failed", run, error: run.error };
      } else {
        yield { type: "workflow.completed", run };
      }
    } catch (exc) {
      const error = String(exc instanceof Error ? exc.message : exc);
      yield { type: "workflow.error", error };
      throw exc;
    }
  }
}

export function workflow(input: WorkflowV2ArtifactInput): SchiftWorkflowArtifact {
  return new SchiftWorkflowArtifact(input);
}
