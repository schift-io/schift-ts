import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkflowBuilder } from "../builder.js";
import { WorkflowClient } from "../client.js";
import type { HttpTransport } from "../client.js";
import { BlockType, WorkflowTemplate, WorkflowStatus } from "../types.js";
import type {
  Workflow,
  Block,
  Edge,
  WorkflowRun,
  ValidationResult,
} from "../types.js";

// ---- Helpers ----

function mockTransport(): HttpTransport & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

const STUB_WORKFLOW: Workflow = {
  id: "wf_123",
  name: "Test Workflow",
  description: "A test",
  status: WorkflowStatus.DRAFT,
  graph: { blocks: [], edges: [] },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const STUB_BLOCK: Block = {
  id: "blk_1",
  type: BlockType.DOCUMENT_LOADER,
  title: "Loader",
  position: { x: 0, y: 0 },
  config: {},
};

const STUB_EDGE: Edge = {
  id: "edg_1",
  source: "blk_1",
  target: "blk_2",
};

const STUB_RUN: WorkflowRun = {
  id: "run_1",
  workflow_id: "wf_123",
  status: "running",
  inputs: { query: "hello" },
  block_states: {},
  started_at: "2026-01-01T00:00:01Z",
};

// =====================================================================
// WorkflowBuilder
// =====================================================================

describe("WorkflowBuilder", () => {
  it("builds a CreateWorkflowRequest with name and description", () => {
    const req = new WorkflowBuilder("My Pipeline")
      .description("A test pipeline")
      .build();

    expect(req.name).toBe("My Pipeline");
    expect(req.description).toBe("A test pipeline");
    expect(req.graph).toBeDefined();
    expect(req.graph!.blocks).toEqual([]);
    expect(req.graph!.edges).toEqual([]);
  });

  it("adds blocks with auto-generated positions", () => {
    const req = new WorkflowBuilder("RAG")
      .addBlock("start", { type: BlockType.START })
      .addBlock("loader", {
        type: BlockType.DOCUMENT_LOADER,
        title: "Load Docs",
        config: { source_type: "upload" },
      })
      .build();

    const blocks = req.graph!.blocks;
    expect(blocks).toHaveLength(2);

    expect(blocks[0]).toMatchObject({
      id: "start",
      type: "start",
      title: "start",
    });
    expect(blocks[0].position).toEqual({ x: 0, y: 0 });

    expect(blocks[1]).toMatchObject({
      id: "loader",
      type: "document_loader",
      title: "Load Docs",
      config: { source_type: "upload" },
    });
    expect(blocks[1].position).toEqual({ x: 0, y: 120 });
  });

  it("defaults block type to alias when type is omitted", () => {
    const req = new WorkflowBuilder("W")
      .addBlock("start")
      .addBlock("end")
      .build();

    expect(req.graph!.blocks[0].type).toBe("start");
    expect(req.graph!.blocks[1].type).toBe("end");
  });

  it("connects blocks with edges", () => {
    const req = new WorkflowBuilder("W")
      .addBlock("start")
      .addBlock("end")
      .connect("start", "end")
      .build();

    const edges = req.graph!.edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "start",
      target: "end",
    });
    expect(edges[0].id).toBe("edge_1");
  });

  it("supports handle names on edges", () => {
    const req = new WorkflowBuilder("W")
      .addBlock("cond", { type: BlockType.CONDITION })
      .addBlock("yes", { type: BlockType.LLM })
      .addBlock("no", { type: BlockType.ANSWER })
      .connect("cond", "yes", "true", "input")
      .connect("cond", "no", "false", "input")
      .build();

    const edges = req.graph!.edges;
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      source: "cond",
      target: "yes",
      source_handle: "true",
      target_handle: "input",
    });
    expect(edges[1]).toMatchObject({
      source: "cond",
      target: "no",
      source_handle: "false",
      target_handle: "input",
    });
  });

  it("throws when connecting to a non-existent source block", () => {
    const builder = new WorkflowBuilder("W").addBlock("end");
    expect(() => builder.connect("ghost", "end")).toThrow(
      /source block "ghost" not found/,
    );
  });

  it("throws when connecting to a non-existent target block", () => {
    const builder = new WorkflowBuilder("W").addBlock("start");
    expect(() => builder.connect("start", "ghost")).toThrow(
      /target block "ghost" not found/,
    );
  });

  it("buildGraph returns graph without name/description", () => {
    const builder = new WorkflowBuilder("W")
      .description("D")
      .addBlock("start")
      .addBlock("end")
      .connect("start", "end");

    const graph = builder.buildGraph();
    expect(graph.blocks).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect((graph as Record<string, unknown>)["name"]).toBeUndefined();
  });

  it("builds a full RAG pipeline", () => {
    const req = new WorkflowBuilder("Full RAG")
      .description("Complete RAG pipeline")
      .addBlock("start", { type: BlockType.START })
      .addBlock("loader", {
        type: BlockType.DOCUMENT_LOADER,
        config: { source_type: "upload" },
      })
      .addBlock("parser", { type: BlockType.DOCUMENT_PARSER })
      .addBlock("chunker", {
        type: BlockType.CHUNKER,
        config: { strategy: "recursive", chunk_size: 512 },
      })
      .addBlock("embedder", { type: BlockType.EMBEDDER })
      .addBlock("store", { type: BlockType.VECTOR_STORE })
      .addBlock("retriever", {
        type: BlockType.RETRIEVER,
        config: { top_k: 5 },
      })
      .addBlock("reranker", { type: BlockType.RERANKER })
      .addBlock("prompt", { type: BlockType.PROMPT_TEMPLATE })
      .addBlock("llm", { type: BlockType.LLM, config: { model: "gpt-4o" } })
      .addBlock("answer", { type: BlockType.ANSWER })
      .addBlock("end", { type: BlockType.END })
      .connect("start", "loader")
      .connect("loader", "parser")
      .connect("parser", "chunker")
      .connect("chunker", "embedder")
      .connect("embedder", "store")
      .connect("store", "retriever")
      .connect("retriever", "reranker")
      .connect("reranker", "prompt")
      .connect("prompt", "llm")
      .connect("llm", "answer")
      .connect("answer", "end")
      .build();

    expect(req.graph!.blocks).toHaveLength(12);
    expect(req.graph!.edges).toHaveLength(11);
  });
});

// =====================================================================
// WorkflowClient
// =====================================================================

describe("WorkflowClient", () => {
  let transport: ReturnType<typeof mockTransport>;
  let client: WorkflowClient;

  beforeEach(() => {
    transport = mockTransport();
    client = new WorkflowClient(transport);
  });

  // ---- CRUD ----

  it("create() POSTs to /v1/workflows", async () => {
    transport.post.mockResolvedValue(STUB_WORKFLOW);

    const result = await client.create({
      name: "Test Workflow",
      description: "A test",
    });

    expect(transport.post).toHaveBeenCalledWith("/v1/workflows", {
      name: "Test Workflow",
      description: "A test",
    });
    expect(result).toEqual(STUB_WORKFLOW);
  });

  it("list() GETs /v1/workflows and unwraps", async () => {
    transport.get.mockResolvedValue({ workflows: [STUB_WORKFLOW] });

    const result = await client.list();

    expect(transport.get).toHaveBeenCalledWith("/v1/workflows");
    expect(result).toEqual([STUB_WORKFLOW]);
  });

  it("get() GETs /v1/workflows/:id", async () => {
    transport.get.mockResolvedValue(STUB_WORKFLOW);

    const result = await client.get("wf_123");

    expect(transport.get).toHaveBeenCalledWith("/v1/workflows/wf_123");
    expect(result).toEqual(STUB_WORKFLOW);
  });

  it("update() PATCHes /v1/workflows/:id", async () => {
    const updated = { ...STUB_WORKFLOW, name: "Updated" };
    transport.patch.mockResolvedValue(updated);

    const result = await client.update("wf_123", { name: "Updated" });

    expect(transport.patch).toHaveBeenCalledWith("/v1/workflows/wf_123", {
      name: "Updated",
    });
    expect(result.name).toBe("Updated");
  });

  it("delete() DELETEs /v1/workflows/:id", async () => {
    transport.delete.mockResolvedValue(undefined);

    await client.delete("wf_123");

    expect(transport.delete).toHaveBeenCalledWith("/v1/workflows/wf_123");
  });

  // ---- Blocks ----

  it("addBlock() POSTs to /v1/workflows/:id/blocks", async () => {
    transport.post.mockResolvedValue(STUB_BLOCK);

    const result = await client.addBlock("wf_123", {
      type: BlockType.DOCUMENT_LOADER,
      title: "Loader",
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/workflows/wf_123/blocks",
      { type: "document_loader", title: "Loader" },
    );
    expect(result).toEqual(STUB_BLOCK);
  });

  it("removeBlock() DELETEs /v1/workflows/:id/blocks/:block_id", async () => {
    transport.delete.mockResolvedValue(undefined);

    await client.removeBlock("wf_123", "blk_1");

    expect(transport.delete).toHaveBeenCalledWith(
      "/v1/workflows/wf_123/blocks/blk_1",
    );
  });

  // ---- Edges ----

  it("addEdge() POSTs to /v1/workflows/:id/edges", async () => {
    transport.post.mockResolvedValue(STUB_EDGE);

    const result = await client.addEdge("wf_123", {
      source: "blk_1",
      target: "blk_2",
    });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/workflows/wf_123/edges",
      { source: "blk_1", target: "blk_2" },
    );
    expect(result).toEqual(STUB_EDGE);
  });

  it("removeEdge() DELETEs /v1/workflows/:id/edges/:edge_id", async () => {
    transport.delete.mockResolvedValue(undefined);

    await client.removeEdge("wf_123", "edg_1");

    expect(transport.delete).toHaveBeenCalledWith(
      "/v1/workflows/wf_123/edges/edg_1",
    );
  });

  // ---- Execution ----

  it("run() POSTs to /v1/workflows/:id/run with inputs", async () => {
    transport.post.mockResolvedValue(STUB_RUN);

    const result = await client.run("wf_123", { query: "hello" });

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/workflows/wf_123/run",
      { inputs: { query: "hello" } },
    );
    expect(result).toEqual(STUB_RUN);
  });

  it("run() works without inputs", async () => {
    transport.post.mockResolvedValue(STUB_RUN);

    await client.run("wf_123");

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/workflows/wf_123/run",
      { inputs: undefined },
    );
  });

  it("validate() POSTs to /v1/workflows/:id/validate", async () => {
    const valid: ValidationResult = { valid: true, errors: [] };
    transport.post.mockResolvedValue(valid);

    const result = await client.validate("wf_123");

    expect(transport.post).toHaveBeenCalledWith(
      "/v1/workflows/wf_123/validate",
      {},
    );
    expect(result.valid).toBe(true);
  });

  // ---- Meta ----

  it("getBlockTypes() GETs /v1/workflows/meta/block-types", async () => {
    transport.get.mockResolvedValue({
      block_types: [
        {
          type: "start",
          label: "Start",
          description: "Entry point",
          category: "control",
          default_config: {},
          input_handles: [],
          output_handles: ["out"],
        },
      ],
    });

    const result = await client.getBlockTypes();

    expect(transport.get).toHaveBeenCalledWith(
      "/v1/workflows/meta/block-types",
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("start");
  });

  it("getTemplates() GETs /v1/workflows/meta/templates", async () => {
    transport.get.mockResolvedValue({
      templates: [
        {
          id: "basic_rag",
          name: "Basic RAG",
          description: "Simple RAG pipeline",
          graph: { blocks: [], edges: [] },
        },
      ],
    });

    const result = await client.getTemplates();

    expect(transport.get).toHaveBeenCalledWith(
      "/v1/workflows/meta/templates",
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("basic_rag");
  });
});

// =====================================================================
// Type / Enum Sanity
// =====================================================================

describe("Type constants", () => {
  it("BlockType covers core RAG + flow + n8n-derived helpers", () => {
    const types = Object.values(BlockType);
    expect(types.length).toBeGreaterThanOrEqual(47);
    expect(types).toContain("rag");
    expect(types).toContain("start");
    expect(types).toContain("end");
    // n8n-derived helpers (Section 4 of n8n-catalog-mapping.md)
    expect(types).toContain("set");
    expect(types).toContain("filter");
    expect(types).toContain("switch");
    expect(types).toContain("aggregate");
    expect(types).toContain("human_approval");
    expect(types).toContain("decision_review");
    expect(types).toContain("document_loader");
    expect(types).toContain("chunker");
    expect(types).toContain("embedder");
    expect(types).toContain("llm");
    expect(types).toContain("condition");
    expect(types).toContain("code");
    expect(types).toContain("http_request");
    expect(types).toContain("webhook");
    expect(types).toContain("webhook_source");
    expect(types).toContain("outbound_webhook");
    expect(types).toContain("source_query");
    expect(types).toContain("source_write");
    expect(types).toContain("metadata_extractor");
  });

  it("WorkflowTemplate covers server workflow presets", () => {
    const templates = Object.values(WorkflowTemplate);
    expect(templates).toHaveLength(8);
    expect(templates).toContain("basic_rag");
    expect(templates).toContain("document_qa");
    expect(templates).toContain("conversational_rag");
    expect(templates).toContain("multi_source_rag");
    expect(templates).toContain("agentic_rag");
    expect(templates).toContain("image_ocr_ingest");
    expect(templates).toContain("chat_rag");
    expect(templates).toContain("chatroom_memory_search");
  });

  it("WorkflowStatus has draft, active, published, archived", () => {
    expect(WorkflowStatus.DRAFT).toBe("draft");
    expect(WorkflowStatus.ACTIVE).toBe("active");
    expect(WorkflowStatus.PUBLISHED).toBe("published");
    expect(WorkflowStatus.ARCHIVED).toBe("archived");
  });
});

// =====================================================================
// Integration: Builder -> Client
// =====================================================================

describe("Builder + Client integration", () => {
  it("builder output can be passed to client.create()", async () => {
    const transport = mockTransport();
    const client = new WorkflowClient(transport);
    transport.post.mockResolvedValue(STUB_WORKFLOW);

    const request = new WorkflowBuilder("Pipeline")
      .addBlock("start")
      .addBlock("llm", { type: BlockType.LLM })
      .addBlock("end")
      .connect("start", "llm")
      .connect("llm", "end")
      .build();

    await client.create(request);

    expect(transport.post).toHaveBeenCalledTimes(1);
    const body = transport.post.mock.calls[0][1];
    expect(body.name).toBe("Pipeline");
    expect(body.graph.blocks).toHaveLength(3);
    expect(body.graph.edges).toHaveLength(2);
  });
});
