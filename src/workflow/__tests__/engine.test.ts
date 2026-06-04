import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkflowRunner, ExecutionContext } from "../engine.js";
import {
  SDKBaseNodeClass as SDKBaseNode,
  registerCustomNode,
  unregisterCustomNode,
  getNodeHandler,
} from "../nodes.js";
import type { SDKExecutionContext } from "../nodes.js";
import type { WorkflowDefinition } from "../yaml.js";

// ---- Helpers ----

function makeDef(
  blocks: WorkflowDefinition["blocks"],
  edges: WorkflowDefinition["edges"] = [],
  overrides?: Partial<WorkflowDefinition>,
): WorkflowDefinition {
  return {
    version: 1,
    name: "Test",
    blocks,
    edges,
    ...overrides,
  };
}

function startEndDef(
  extraBlocks: WorkflowDefinition["blocks"] = [],
  extraEdges: WorkflowDefinition["edges"] = [],
): WorkflowDefinition {
  return makeDef(
    [
      { id: "start", type: "start" },
      ...extraBlocks,
      { id: "end", type: "end" },
    ],
    [
      ...(extraBlocks.length
        ? [
            { source: "start", target: extraBlocks[0].id },
            ...extraEdges,
            { source: extraBlocks[extraBlocks.length - 1].id, target: "end" },
          ]
        : [{ source: "start", target: "end" }]),
    ],
  );
}

// =====================================================================
// ExecutionContext
// =====================================================================

describe("ExecutionContext", () => {
  it("auto-generates runId", () => {
    const ctx = new ExecutionContext();
    expect(ctx.runId).toHaveLength(12);
  });

  it("accepts explicit runId", () => {
    const ctx = new ExecutionContext({ runId: "my-run" });
    expect(ctx.runId).toBe("my-run");
  });

  it("get/set variables", () => {
    const ctx = new ExecutionContext();
    ctx.setVar("x", 42);
    expect(ctx.getVar("x")).toBe(42);
    expect(ctx.getVar("missing", "default")).toBe("default");
  });

  it("initializes with variables", () => {
    const ctx = new ExecutionContext({ variables: { a: 1, b: 2 } });
    expect(ctx.getVar("a")).toBe(1);
    expect(ctx.getVar("b")).toBe(2);
  });
});

// =====================================================================
// WorkflowRunner — Basic
// =====================================================================

describe("WorkflowRunner", () => {
  it("runs start→end passthrough", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      [{ source: "start", target: "end" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ query: "hello" });

    expect(result.status).toBe("completed");
    expect(result.outputs.result).toEqual({ query: "hello" });
  });

  it("propagates inputs via 'out' handle (editor convention)", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "pt", type: "prompt_template", config: { template: "Q: {{query}}" } },
      ],
      [{ source: "start", target: "pt", source_handle: "out" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ query: "headache" });

    expect(result.status).toBe("completed");
    expect(result.blockStates.pt.outputs.prompt).toBe("Q: headache");
  });

  it("runs with empty inputs", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      [{ source: "start", target: "end" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.status).toBe("completed");
    expect(result.outputs.result).toEqual({});
  });

  it("records block states", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      [{ source: "start", target: "end" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ x: 1 });

    expect(result.blockStates.start).toBeDefined();
    expect(result.blockStates.end).toBeDefined();
    expect(result.blockStates.start.status).toBe("completed");
    expect(result.blockStates.end.status).toBe("completed");
  });

  it("tracks timing", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      [{ source: "start", target: "end" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.blockStates.start.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.startedAt).toBeTruthy();
    expect(result.finishedAt).toBeTruthy();
  });

  it("generates a runId", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      [{ source: "start", target: "end" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.runId).toHaveLength(12);
  });

  it("validate() works", () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      [{ source: "start", target: "end" }],
    );
    const runner = new WorkflowRunner(def);
    const errors = runner.validate();
    expect(errors).toEqual([]);
  });
});

// =====================================================================
// DAG Topology
// =====================================================================

describe("DAG topology", () => {
  it("detects cycles", async () => {
    const def = makeDef(
      [
        { id: "a", type: "start" },
        { id: "b", type: "llm" },
      ],
      [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/cycle/);
  });

  it("runs diamond DAG", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "a", type: "model_selector", config: { model: "m1" } },
        { id: "b", type: "model_selector", config: { model: "m2" } },
        { id: "end", type: "end" },
      ],
      [
        { source: "start", target: "a" },
        { source: "start", target: "b" },
        { source: "a", target: "end" },
        { source: "b", target: "end" },
      ],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ x: 1 });

    expect(result.status).toBe("completed");
  });

  it("collects outputs from terminal blocks when no END block", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "sel", type: "model_selector", config: { model: "test" } },
      ],
      [{ source: "start", target: "sel" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ x: 1 });

    expect(result.status).toBe("completed");
    expect(result.outputs.model).toBe("test");
  });
});

// =====================================================================
// Condition Branching
// =====================================================================

describe("Condition branching", () => {
  it("true branch executes", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "cond", type: "condition", config: { field: "x", operator: "eq", value: 1 } },
        { id: "yes", type: "answer", config: { format: "text" } },
        { id: "no", type: "answer", config: { format: "text" } },
      ],
      [
        { source: "start", target: "cond" },
        { source: "cond", target: "yes", source_handle: "true" },
        { source: "cond", target: "no", source_handle: "false" },
      ],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ x: 1 });

    expect(result.status).toBe("completed");
    // "yes" branch should execute, "no" branch should be skipped
    expect(result.blockStates.yes.outputs._skipped).toBeUndefined();
    expect(result.blockStates.no.outputs._skipped).toBe(true);
  });

  it("false branch executes", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "cond", type: "condition", config: { field: "x", operator: "eq", value: 1 } },
        { id: "yes", type: "answer", config: { format: "text" } },
        { id: "no", type: "answer", config: { format: "text" } },
      ],
      [
        { source: "start", target: "cond" },
        { source: "cond", target: "yes", source_handle: "true" },
        { source: "cond", target: "no", source_handle: "false" },
      ],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ x: 999 });

    expect(result.status).toBe("completed");
    expect(result.blockStates.yes.outputs._skipped).toBe(true);
    expect(result.blockStates.no.outputs._skipped).toBeUndefined();
  });
});

// =====================================================================
// Tier 1 Nodes
// =====================================================================

describe("Tier 1 nodes", () => {
  it.each([
    ["eq", 1, 1, true],
    ["eq", 1, 2, false],
    ["neq", 1, 2, true],
    ["neq", 1, 1, false],
    ["gt", 5, 3, true],
    ["gt", 3, 5, false],
    ["lt", 3, 5, true],
    ["gte", 5, 5, true],
    ["lte", 5, 5, true],
    ["contains", "hello world", "world", true],
    ["contains", "hello", "xyz", false],
    ["empty", null, null, true],
    ["empty", "something", null, false],
    ["not_empty", "something", null, true],
  ])("condition operator %s: actual=%s, expected=%s → %s", async (op, actual, expected, expectedResult) => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "cond", type: "condition", config: { field: "val", operator: op, value: expected } },
      ],
      [{ source: "start", target: "cond" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ val: actual });

    const branch = result.blockStates.cond.outputs.branch;
    expect(branch).toBe(expectedResult ? "true" : "false");
  });

  it("variable set_get", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "var", type: "variable", config: { mode: "set_get", variables: { greeting: "hello" } } },
      ],
      [{ source: "start", target: "var" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.blockStates.var.outputs.greeting).toBe("hello");
  });

  it("prompt_template substitution", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "pt", type: "prompt_template", config: { template: "Hello {{name}}!" } },
      ],
      [{ source: "start", target: "pt" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ name: "World" });

    expect(result.blockStates.pt.outputs.prompt).toBe("Hello World!");
  });

  it("prompt_template with list input", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "pt", type: "prompt_template", config: { template: "Items:\n{{items}}" } },
      ],
      [{ source: "start", target: "pt" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ items: ["apple", "banana"] });

    expect(result.blockStates.pt.outputs.prompt).toContain("- apple");
    expect(result.blockStates.pt.outputs.prompt).toContain("- banana");
  });

  it("loop node", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "loop", type: "loop", config: { input_key: "items" } },
      ],
      [{ source: "start", target: "loop" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ items: ["a", "b", "c"] });

    expect(result.blockStates.loop.outputs.count).toBe(3);
    expect(result.blockStates.loop.outputs.item).toBe("a");
    expect((result.blockStates.loop.outputs.iterations as unknown[]).length).toBe(3);
  });

  it("loop max_iterations", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "loop", type: "loop", config: { input_key: "items", max_iterations: 2 } },
      ],
      [{ source: "start", target: "loop" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ items: ["a", "b", "c"] });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/max_iterations/);
  });

  it("merge node", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "merge", type: "merge" },
      ],
      [{ source: "start", target: "merge" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ a: 1, b: 2 });

    expect(result.blockStates.merge.outputs.merged).toEqual({ a: 1, b: 2 });
  });

  it("router keyword", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        {
          id: "router", type: "router",
          config: {
            strategy: "keyword",
            routes: [
              { name: "tech", condition: ["code", "programming"] },
              { name: "sales", condition: ["buy", "price"] },
            ],
            default_route: "general",
          },
        },
      ],
      [{ source: "start", target: "router" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ query: "help with code" });

    expect(result.blockStates.router.outputs.route).toBe("tech");
  });

  it("router regex", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        {
          id: "router", type: "router",
          config: {
            strategy: "regex",
            routes: [
              { name: "email", condition: "\\b[\\w.]+@[\\w.]+\\b" },
            ],
            default_route: "other",
          },
        },
      ],
      [{ source: "start", target: "router" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ query: "send to user@test.com" });

    expect(result.blockStates.router.outputs.route).toBe("email");
  });

  it("answer text format", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "ans", type: "answer", config: { format: "text" } },
      ],
      [{ source: "start", target: "ans" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ text: "Hello world" });

    expect(result.blockStates.ans.outputs.answer).toBe("Hello world");
  });

  it("answer max_length", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "ans", type: "answer", config: { format: "text", max_length: 5 } },
      ],
      [{ source: "start", target: "ans" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ text: "Hello world" });

    expect(result.blockStates.ans.outputs.answer).toBe("Hello...");
  });

  it("field_selector", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "sel", type: "field_selector", config: { fields: ["name", "age"] } },
      ],
      [{ source: "start", target: "sel" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ name: "Alice", age: 30, extra: "ignored" });

    const out = result.blockStates.sel.outputs.out as Record<string, unknown>;
    expect(out.name).toBe("Alice");
    expect(out.age).toBe(30);
  });

  it("model_selector", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "ms", type: "model_selector", config: { model: "bge-m3" } },
      ],
      [{ source: "start", target: "ms" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ x: 1 });

    expect(result.blockStates.ms.outputs.model).toBe("bge-m3");
  });

  it("reranker sorts by score", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "rr", type: "reranker", config: { top_k: 2 } },
      ],
      [{ source: "start", target: "rr" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({
      results: [
        { id: "a", score: 0.3 },
        { id: "b", score: 0.9 },
        { id: "c", score: 0.6 },
      ],
    });

    const results = result.blockStates.rr.outputs.results as Record<string, unknown>[];
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("b");
    expect(results[1].id).toBe("c");
  });
});

// =====================================================================
// Tier 3 Stubs
// =====================================================================

describe("Tier 3 server-only stubs", () => {
  const serverOnlyTypes = [
    "document_loader", "document_parser", "chunker", "code",
    "http_request", "webhook", "webhook_source", "ingest_bridge",
    "feed_poll", "ai_router", "rag", "source_query", "source_write",
    "gmail_trigger", "notion_trigger", "subworkflow", "outbound_webhook",
  ];

  it.each(serverOnlyTypes)("%s raises server-only error", async (blockType) => {
    const def = makeDef(
      [{ id: "b", type: blockType }],
      [],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/server-only/);
  });

  it("notify is skipped (not executed)", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "n", type: "notify" },
      ],
      [{ source: "start", target: "n" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.status).toBe("completed");
    expect(result.blockStates.n.outputs._skipped).toBe(true);
  });

  it("unknown type falls back to passthrough", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "unk", type: "totally_unknown_type" },
      ],
      [{ source: "start", target: "unk" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ x: 42 });

    expect(result.status).toBe("completed");
    expect(result.blockStates.unk.outputs.x).toBe(42);
  });
});

// =====================================================================
// Custom Nodes
// =====================================================================

describe("Custom nodes", () => {
  afterEach(() => {
    unregisterCustomNode("test_custom");
  });

  it("register and execute", async () => {
    class TestCustomNode extends SDKBaseNode {
      async execute(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
        return { doubled: Number(inputs.value ?? 0) * 2 };
      }
    }

    registerCustomNode("test_custom", TestCustomNode);

    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "custom", type: "test_custom" },
      ],
      [{ source: "start", target: "custom" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ value: 5 });

    expect(result.status).toBe("completed");
    expect(result.blockStates.custom.outputs.doubled).toBe(10);
  });

  it("cannot override builtin", () => {
    class FakeStart extends SDKBaseNode {
      async execute(): Promise<Record<string, unknown>> {
        return {};
      }
    }

    expect(() => registerCustomNode("start", FakeStart)).toThrow(
      /Cannot override built-in/,
    );
  });

  it("custom with config", async () => {
    class ConfigNode extends SDKBaseNode {
      async execute(): Promise<Record<string, unknown>> {
        return { multiplier: this.config.multiplier };
      }
    }

    registerCustomNode("test_custom", ConfigNode);

    const def = makeDef(
      [{ id: "c", type: "test_custom", config: { multiplier: 3 } }],
      [],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.blockStates.c.outputs.multiplier).toBe(3);
  });
});

// =====================================================================
// Error Handling
// =====================================================================

describe("Error handling", () => {
  it("block failure stops pipeline", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "bad", type: "document_loader" },
        { id: "end", type: "end" },
      ],
      [
        { source: "start", target: "bad" },
        { source: "bad", target: "end" },
      ],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.status).toBe("failed");
    expect(result.blockStates.bad.status).toBe("failed");
    // end should not have been reached
    expect(result.blockStates.end).toBeUndefined();
  });

  it("no client for embedder", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "emb", type: "embedder" },
      ],
      [{ source: "start", target: "emb" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ text: "hello" });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Client/);
  });

  it("no client for retriever", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "ret", type: "retriever", config: { collection: "test" } },
      ],
      [{ source: "start", target: "ret" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ query: "test" });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Client/);
  });

  it("missing collection config", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "ret", type: "retriever", config: {} },
      ],
      [{ source: "start", target: "ret" }],
    );
    // Provide a mock client to get past the client check
    const mockClient = { collection: () => ({}) };
    const runner = new WorkflowRunner(def, mockClient);
    const result = await runner.run({ query: "test" });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/collection/i);
  });

  it("passes configured dimensions to single embed calls", async () => {
    const calls: unknown[][] = [];
    const mockClient = {
      embed: async (...args: unknown[]) => {
        calls.push(args);
        return { values: [0.1, 0.2], model: "schift-embed-1-small" };
      },
    };
    const def = makeDef(
      [
        { id: "start", type: "start" },
        {
          id: "emb",
          type: "embedder",
          config: { model: "schift-embed-1-small", dimensions: 128 },
        },
      ],
      [{ source: "start", target: "emb" }],
    );
    const runner = new WorkflowRunner(def, mockClient);
    const result = await runner.run({ text: "hello" });

    expect(result.status).toBe("completed");
    expect(calls).toEqual([
      ["hello", { model: "schift-embed-1-small", dimensions: 128 }],
    ]);
  });

  it("passes configured dimensions to batch embed calls", async () => {
    const calls: unknown[][] = [];
    const mockClient = {
      embedBatch: async (...args: unknown[]) => {
        calls.push(args);
        return [{ values: [0.1] }, { values: [0.2] }];
      },
    };
    const def = makeDef(
      [
        { id: "start", type: "start" },
        {
          id: "emb",
          type: "embedder",
          config: { model: "schift-embed-1-small", dimensions: 128 },
        },
      ],
      [{ source: "start", target: "emb" }],
    );
    const runner = new WorkflowRunner(def, mockClient);
    const result = await runner.run({ texts: ["a", "b"] });

    expect(result.status).toBe("completed");
    expect(calls).toEqual([
      [["a", "b"], { model: "schift-embed-1-small", dimensions: 128 }],
    ]);
  });

  it("rejects d alias for embed dimensions", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        {
          id: "emb",
          type: "embedder",
          config: { model: "schift-embed-1-small", d: 128 },
        },
      ],
      [{ source: "start", target: "emb" }],
    );
    const runner = new WorkflowRunner(def, { embed: async () => ({ values: [] }) });
    const result = await runner.run({ text: "hello" });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/use 'dimensions'/);
  });
});

// =====================================================================
// Context Variables
// =====================================================================

describe("Context variables", () => {
  it("outputs published as context vars", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "ms", type: "model_selector", config: { model: "test-model" } },
        { id: "var", type: "variable", config: { mode: "get", keys: ["ms.model"] } },
      ],
      [
        { source: "start", target: "ms" },
        { source: "ms", target: "var" },
      ],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run();

    expect(result.blockStates.var.outputs["ms.model"]).toBe("test-model");
  });
});

// =====================================================================
// Node Registry
// =====================================================================

describe("Node registry", () => {
  it("builtin types resolve", () => {
    const builtins = [
      "start", "end", "condition", "router", "loop", "merge",
      "variable", "prompt_template", "answer", "field_selector",
      "model_selector", "embedder", "retriever", "reranker",
      "vector_store", "collection", "llm", "metadata_extractor",
    ];
    for (const type of builtins) {
      const handler = getNodeHandler({ id: "test", type });
      expect(handler).toBeDefined();
    }
  });

  it("unknown gets passthrough", () => {
    const handler = getNodeHandler({ id: "test", type: "nonexistent" });
    expect(handler).toBeDefined();
  });
});

// =====================================================================
// Metadata Extractor
// =====================================================================

describe("MetadataExtractor", () => {
  it("regex extraction", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        {
          id: "me", type: "metadata_extractor",
          config: {
            strategy: "regex",
            fields: [
              { name: "year", pattern: "(\\d{4})", type: "int" },
            ],
          },
        },
      ],
      [{ source: "start", target: "me" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ text: "Published in 2024" });

    const metadata = result.blockStates.me.outputs.metadata as Record<string, unknown>[];
    expect(metadata[0].year).toBe(2024);
  });

  it("llm mode raises", async () => {
    const def = makeDef(
      [
        { id: "start", type: "start" },
        { id: "me", type: "metadata_extractor", config: { strategy: "llm" } },
      ],
      [{ source: "start", target: "me" }],
    );
    const runner = new WorkflowRunner(def);
    const result = await runner.run({ text: "test" });

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/not supported/);
  });
});
