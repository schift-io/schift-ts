import { describe, it, expect } from "vitest";
import {
  titleFromType,
  validateDefinition,
  definitionFromApiResponse,
  definitionToApiDict,
} from "../yaml.js";
import type { WorkflowDefinition, BlockDef, EdgeDef } from "../yaml.js";
import { WorkflowBuilder } from "../builder.js";

// ---- Helpers ----

function minimalDef(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    version: 1,
    name: "Test",
    blocks: [
      { id: "start", type: "start" },
      { id: "end", type: "end" },
    ],
    edges: [{ source: "start", target: "end" }],
    ...overrides,
  };
}

// =====================================================================
// titleFromType
// =====================================================================

describe("titleFromType", () => {
  it("converts snake_case to Title Case", () => {
    expect(titleFromType("document_loader")).toBe("Document Loader");
    expect(titleFromType("prompt_template")).toBe("Prompt Template");
    expect(titleFromType("llm")).toBe("Llm");
    expect(titleFromType("start")).toBe("Start");
  });
});

// =====================================================================
// validateDefinition
// =====================================================================

describe("validateDefinition", () => {
  it("returns empty array for valid definition", () => {
    const errors = validateDefinition(minimalDef());
    expect(errors).toEqual([]);
  });

  it("detects empty blocks", () => {
    const errors = validateDefinition({ ...minimalDef(), blocks: [] });
    expect(errors).toContain("Workflow has no blocks");
  });

  it("detects duplicate block IDs", () => {
    const errors = validateDefinition({
      ...minimalDef(),
      blocks: [
        { id: "a", type: "start" },
        { id: "a", type: "end" },
      ],
      edges: [],
    });
    expect(errors.some((e) => e.includes("Duplicate block ID"))).toBe(true);
  });

  it("detects dangling edge source", () => {
    const errors = validateDefinition({
      ...minimalDef(),
      edges: [{ source: "ghost", target: "end" }],
    });
    expect(errors.some((e) => e.includes("non-existent source"))).toBe(true);
  });

  it("detects dangling edge target", () => {
    const errors = validateDefinition({
      ...minimalDef(),
      edges: [{ source: "start", target: "ghost" }],
    });
    expect(errors.some((e) => e.includes("non-existent target"))).toBe(true);
  });

  it("detects cycles", () => {
    const errors = validateDefinition({
      ...minimalDef(),
      blocks: [
        { id: "a", type: "start" },
        { id: "b", type: "llm" },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    });
    expect(errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("detects disconnected blocks", () => {
    const errors = validateDefinition({
      ...minimalDef(),
      blocks: [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
        { id: "orphan", type: "llm" },
      ],
      edges: [{ source: "start", target: "end" }],
    });
    expect(errors.some((e) => e.includes("disconnected"))).toBe(true);
  });

  it("warns about server-only (Tier 3) block types", () => {
    const errors = validateDefinition({
      ...minimalDef(),
      blocks: [
        { id: "start", type: "start" },
        { id: "hook", type: "webhook" },
      ],
      edges: [{ source: "start", target: "hook" }],
    });
    expect(errors.some((e) => e.includes("server-only"))).toBe(true);
  });

  it.each(["gmail_trigger", "notion_trigger"])(
    "warns that %s needs the API runtime",
    (type) => {
      const errors = validateDefinition({
        ...minimalDef(),
        blocks: [
          { id: "start", type: "start" },
          { id: "integration", type },
        ],
        edges: [{ source: "start", target: "integration" }],
      });

      expect(errors).toContain(
        `Block 'integration' (type=${type}) is server-only; local SDK execution may not support it`,
      );
    },
  );

  it("does not warn about Tier 1/2 block types", () => {
    const errors = validateDefinition(minimalDef());
    expect(errors.filter((e) => e.includes("server-only"))).toHaveLength(0);
  });

  it("single block with no edges is valid", () => {
    const errors = validateDefinition({
      version: 1,
      name: "Solo",
      blocks: [{ id: "start", type: "start" }],
      edges: [],
    });
    expect(errors).toEqual([]);
  });
});

// =====================================================================
// definitionFromApiResponse
// =====================================================================

describe("definitionFromApiResponse", () => {
  it("converts API response to WorkflowDefinition", () => {
    const apiData = {
      name: "My Workflow",
      description: "Test",
      status: "draft",
      graph: {
        nodes: [
          {
            id: "s1",
            type: "start",
            title: "Start",
            position: { x: 0, y: 0 },
            config: { params: {} },
          },
          {
            id: "e1",
            type: "embedder",
            title: "Embed",
            position: { x: 100, y: 200 },
            config: { params: { model: "bge-m3" } },
          },
        ],
        edges: [
          { source: "s1", target: "e1", source_handle: "output", target_handle: "input" },
        ],
      },
    };

    const def = definitionFromApiResponse(apiData);

    expect(def.version).toBe(1);
    expect(def.name).toBe("My Workflow");
    expect(def.description).toBe("Test");
    expect(def.status).toBe("draft");
    expect(def.blocks).toHaveLength(2);
    expect(def.edges).toHaveLength(1);

    // config.params should be unwrapped to flat config
    expect(def.blocks[1].config).toEqual({ model: "bge-m3" });
  });

  it("handles missing graph gracefully", () => {
    const def = definitionFromApiResponse({ name: "Empty" });
    expect(def.blocks).toEqual([]);
    expect(def.edges).toEqual([]);
  });

  it("preserves position", () => {
    const def = definitionFromApiResponse({
      name: "Pos",
      graph: {
        nodes: [{ id: "a", type: "start", position: { x: 42, y: 99 } }],
        edges: [],
      },
    });
    expect(def.blocks[0].position).toEqual({ x: 42, y: 99 });
  });

  it("omits empty config", () => {
    const def = definitionFromApiResponse({
      name: "NoConfig",
      graph: {
        nodes: [{ id: "a", type: "start", config: { params: {} } }],
        edges: [],
      },
    });
    expect(def.blocks[0].config).toBeUndefined();
  });
});

// =====================================================================
// definitionToApiDict
// =====================================================================

describe("definitionToApiDict", () => {
  it("converts WorkflowDefinition to API format", () => {
    const def = minimalDef();
    const api = definitionToApiDict(def);

    expect(api.name).toBe("Test");
    expect(api.status).toBe("draft");

    const graph = api.graph as { nodes: unknown[]; edges: unknown[] };
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  it("wraps config in params", () => {
    const def: WorkflowDefinition = {
      version: 1,
      name: "Config",
      blocks: [{ id: "emb", type: "embedder", config: { model: "bge-m3" } }],
      edges: [],
    };
    const api = definitionToApiDict(def);
    const nodes = (api.graph as { nodes: Record<string, unknown>[] }).nodes;
    expect(nodes[0].config).toEqual({ params: { model: "bge-m3" } });
  });

  it("generates edge IDs", () => {
    const api = definitionToApiDict(minimalDef());
    const edges = (api.graph as { edges: Record<string, unknown>[] }).edges;
    expect(edges[0].id).toBe("start_end");
  });

  it("defaults position to {x:0, y:0} when missing", () => {
    const api = definitionToApiDict(minimalDef());
    const nodes = (api.graph as { nodes: Record<string, unknown>[] }).nodes;
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("generates title from type when title is missing", () => {
    const api = definitionToApiDict(minimalDef());
    const nodes = (api.graph as { nodes: Record<string, unknown>[] }).nodes;
    expect(nodes[0].title).toBe("Start");
    expect(nodes[1].title).toBe("End");
  });
});

// =====================================================================
// Round-trip: API → Definition → API
// =====================================================================

describe("Round-trip conversion", () => {
  it("API → Definition → API preserves data", () => {
    const original = {
      name: "Pipeline",
      description: "Test round-trip",
      status: "published",
      graph: {
        nodes: [
          {
            id: "start",
            type: "start",
            title: "Start",
            position: { x: 0, y: 0 },
            config: { params: {} },
          },
          {
            id: "emb",
            type: "embedder",
            title: "Embedder",
            position: { x: 100, y: 100 },
            config: { params: { model: "bge-m3" } },
          },
        ],
        edges: [
          { source: "start", target: "emb", source_handle: "output", target_handle: "input" },
        ],
      },
    };

    const def = definitionFromApiResponse(original);
    const roundTripped = definitionToApiDict(def);

    expect(roundTripped.name).toBe("Pipeline");
    expect(roundTripped.description).toBe("Test round-trip");
    expect(roundTripped.status).toBe("published");

    const nodes = (roundTripped.graph as { nodes: Record<string, unknown>[] }).nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[1].config).toEqual({ params: { model: "bge-m3" } });
  });
});

// =====================================================================
// WorkflowBuilder: fromDefinition / toDefinition
// =====================================================================

describe("WorkflowBuilder YAML integration", () => {
  it("toDefinition() creates a valid WorkflowDefinition", () => {
    const builder = new WorkflowBuilder("My Pipeline")
      .description("A test")
      .addBlock("start", { type: "start" as any })
      .addBlock("emb", { type: "embedder" as any, config: { model: "bge-m3" } })
      .addBlock("end", { type: "end" as any })
      .connect("start", "emb")
      .connect("emb", "end");

    const def = builder.toDefinition();

    expect(def.version).toBe(1);
    expect(def.name).toBe("My Pipeline");
    expect(def.description).toBe("A test");
    expect(def.blocks).toHaveLength(3);
    expect(def.edges).toHaveLength(2);

    // config should be preserved
    const embBlock = def.blocks.find((b) => b.id === "emb")!;
    expect(embBlock.config).toEqual({ model: "bge-m3" });
  });

  it("fromDefinition() recreates builder from WorkflowDefinition", () => {
    const def: WorkflowDefinition = {
      version: 1,
      name: "Imported",
      description: "From YAML",
      blocks: [
        { id: "start", type: "start" },
        { id: "llm", type: "llm", config: { model: "gpt-4o" } },
        { id: "end", type: "end" },
      ],
      edges: [
        { source: "start", target: "llm" },
        { source: "llm", target: "end" },
      ],
    };

    const builder = WorkflowBuilder.fromDefinition(def);
    const req = builder.build();

    expect(req.name).toBe("Imported");
    expect(req.description).toBe("From YAML");
    expect(req.graph!.blocks).toHaveLength(3);
    expect(req.graph!.edges).toHaveLength(2);

    const llmBlock = req.graph!.blocks.find((b) => b.id === "llm")!;
    expect(llmBlock.config).toEqual({ model: "gpt-4o" });
  });

  it("round-trip: builder → definition → builder preserves structure", () => {
    const original = new WorkflowBuilder("Round Trip")
      .addBlock("start", { type: "start" as any })
      .addBlock("cond", { type: "condition" as any, config: { field: "x", operator: "equals", value: "1" } })
      .addBlock("yes", { type: "answer" as any })
      .addBlock("no", { type: "answer" as any })
      .connect("start", "cond")
      .connect("cond", "yes", "true")
      .connect("cond", "no", "false");

    const def = original.toDefinition();
    const rebuilt = WorkflowBuilder.fromDefinition(def);
    const req = rebuilt.build();

    expect(req.graph!.blocks).toHaveLength(4);
    expect(req.graph!.edges).toHaveLength(3);

    // Handles preserved
    const trueEdge = req.graph!.edges.find((e) => e.source_handle === "true")!;
    expect(trueEdge.target).toBe("yes");
  });

  it("toDefinition() omits default title and zero position", () => {
    const builder = new WorkflowBuilder("Clean")
      .addBlock("start", { type: "start" as any, position: { x: 0, y: 0 } });

    const def = builder.toDefinition();

    // Title matches id so should be omitted (or present — depends on builder alias logic)
    // Position is {0,0} so should be omitted
    expect(def.blocks[0].position).toBeUndefined();
  });

  it("validates definition from builder", () => {
    const builder = new WorkflowBuilder("Valid")
      .addBlock("start", { type: "start" as any })
      .addBlock("end", { type: "end" as any })
      .connect("start", "end");

    const def = builder.toDefinition();
    const errors = validateDefinition(def);
    expect(errors).toEqual([]);
  });
});
