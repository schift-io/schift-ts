import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { importN8nWorkflow } from "../n8n-import.js";
import type { N8nWorkflow } from "../n8n-import.js";

const here = dirname(fileURLToPath(import.meta.url));
function loadFixture(name: string): N8nWorkflow {
  const p = join(here, "fixtures", "n8n-templates", name);
  return JSON.parse(readFileSync(p, "utf8")) as N8nWorkflow;
}

// =====================================================================
// Basic shape
// =====================================================================

describe("importN8nWorkflow — basic shape", () => {
  it("imports Manual Trigger -> If -> HTTP with true/false branches", () => {
    const fx = loadFixture("simple-if-http.json");
    const { workflow, warnings } = importN8nWorkflow(fx);

    expect(workflow.version).toBe(1);
    expect(workflow.name).toBe("Simple If Branch");
    expect(workflow.blocks).toHaveLength(3);

    const types = workflow.blocks.map((b) => b.type).sort();
    expect(types).toEqual(["condition", "http_request", "manual_trigger"]);

    // Edge from Manual Trigger -> If on "out" / "in"
    const ifBlock = workflow.blocks.find((b) => b.type === "condition")!;
    const triggerBlock = workflow.blocks.find(
      (b) => b.type === "manual_trigger",
    )!;
    const httpBlock = workflow.blocks.find((b) => b.type === "http_request")!;

    expect(workflow.edges).toContainEqual({
      source: triggerBlock.id,
      target: ifBlock.id,
      source_handle: "out",
      target_handle: "in",
    });

    // True branch -> HTTP
    expect(workflow.edges).toContainEqual({
      source: ifBlock.id,
      target: httpBlock.id,
      source_handle: "true",
      target_handle: "in",
    });

    // No false-branch edge (empty array)
    const falseEdges = workflow.edges.filter(
      (e) => e.source === ifBlock.id && e.source_handle === "false",
    );
    expect(falseEdges).toHaveLength(0);

    expect(warnings).toEqual([]);
  });

  it("preserves n8n parameters as Schift block config", () => {
    const fx = loadFixture("scheduled-set-http.json");
    const { workflow } = importN8nWorkflow(fx);

    const setBlock = workflow.blocks.find((b) => b.type === "set");
    expect(setBlock).toBeDefined();
    expect(setBlock!.config).toBeDefined();
    expect(setBlock!.config!.values).toBeDefined();

    const httpBlock = workflow.blocks.find((b) => b.type === "http_request")!;
    expect(httpBlock.config).toMatchObject({
      method: "GET",
      url: "https://api.example.com/data",
    });
  });

  it("imports Gmail and Notion triggers as reviewable integration triggers", () => {
    const { workflow, warnings } = importN8nWorkflow({
      name: "integration-triggers",
      nodes: [
        {
          id: "gmail",
          name: "New support mail",
          type: "n8n-nodes-base.gmailTrigger",
          position: [100, 0],
          parameters: {
            pollTimes: { item: [{ mode: "everyMinute" }] },
            filters: { labelIds: ["INBOX"], readStatus: "unread" },
          },
        },
        {
          id: "notion",
          name: "Changed Notion page",
          type: "n8n-nodes-base.notionTrigger",
          position: [300, 0],
          parameters: {
            event: "pageUpdatedInDatabase",
            databaseId: "db_123",
          },
        },
      ],
      connections: {},
    });

    expect(workflow.blocks).toMatchObject([
      {
        id: "gmail",
        type: "gmail_trigger",
        config: {
          provider: "gmail",
          event: "message_received",
          labelIds: ["INBOX"],
          readStatus: "unread",
        },
      },
      {
        id: "notion",
        type: "notion_trigger",
        config: {
          provider: "notion",
          event: "pageUpdatedInDatabase",
          databaseId: "db_123",
        },
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it.each([
    [
      "gmail filter query shorthand",
      "n8n-nodes-base.gmailTrigger",
      { event: "message_received_custom", filters: { q: "label:urgent", labelIds: ["URGENT"], readStatus: "read" } },
      {
        provider: "gmail",
        event: "message_received_custom",
        labelIds: ["URGENT"],
        readStatus: "read",
        query: "label:urgent",
      },
    ],
    [
      "gmail top-level filter fallback",
      "n8n-nodes-base.gmailTrigger",
      { labelIds: ["INBOX"], readStatus: "unread", query: "subject:invoice" },
      {
        provider: "gmail",
        event: "message_received",
        labelIds: ["INBOX"],
        readStatus: "unread",
        query: "subject:invoice",
      },
    ],
    [
      "notion snake-case fallback",
      "n8n-nodes-base.notionTrigger",
      { database_id: "db_snake", page_ids: ["page_snake"] },
      {
        provider: "notion",
        event: "pageUpdatedInDatabase",
        databaseId: "db_snake",
        pageIds: ["page_snake"],
      },
    ],
    [
      "notion camel-case page list",
      "n8n-nodes-base.notionTrigger",
      { event: "pageAddedToDatabase", databaseId: "db_camel", pageIds: ["page_camel"] },
      {
        provider: "notion",
        event: "pageAddedToDatabase",
        databaseId: "db_camel",
        pageIds: ["page_camel"],
      },
    ],
  ])("normalizes %s", (_label, type, parameters, expectedConfig) => {
    const { workflow, warnings } = importN8nWorkflow({
      name: "integration-trigger-normalization",
      nodes: [
        {
          id: "trigger",
          name: "Integration Trigger",
          type,
          position: [0, 0],
          parameters: parameters as Record<string, unknown>,
        },
      ],
      connections: {},
    });

    expect(workflow.blocks[0]?.config).toMatchObject(expectedConfig);
    expect(warnings).toEqual([]);
  });

  it("adds safe defaults for credentialless Gmail and Notion trigger imports", () => {
    const { workflow, warnings } = importN8nWorkflow({
      name: "empty-integration-triggers",
      nodes: [
        {
          id: "gmail",
          name: "Gmail Trigger",
          type: "n8n-nodes-base.gmailTrigger",
          position: [0, 0],
        },
        {
          id: "notion",
          name: "Notion Trigger",
          type: "n8n-nodes-base.notionTrigger",
          position: [200, 0],
        },
      ],
      connections: {},
    });

    expect(workflow.blocks).toMatchObject([
      {
        id: "gmail",
        type: "gmail_trigger",
        config: { provider: "gmail", event: "message_received" },
      },
      {
        id: "notion",
        type: "notion_trigger",
        config: { provider: "notion", event: "pageUpdatedInDatabase" },
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("maps positions from [x, y] arrays to {x, y} objects", () => {
    const fx = loadFixture("simple-if-http.json");
    const { workflow } = importN8nWorkflow(fx);

    for (const b of workflow.blocks) {
      expect(b.position).toBeDefined();
      expect(typeof b.position!.x).toBe("number");
      expect(typeof b.position!.y).toBe("number");
    }

    const trigger = workflow.blocks.find((b) => b.type === "manual_trigger")!;
    expect(trigger.position).toEqual({ x: 240, y: 300 });
  });

  it("uses node name as block title", () => {
    const fx = loadFixture("simple-if-http.json");
    const { workflow } = importN8nWorkflow(fx);
    const titles = workflow.blocks.map((b) => b.title).sort();
    expect(titles).toEqual(["HTTP Request", "If", "Manual Trigger"]);
  });
});

// =====================================================================
// Branching: switch
// =====================================================================

describe("importN8nWorkflow — switch node", () => {
  it("emits numeric handles for switch outputs and 'default' for the tail", () => {
    const fx = loadFixture("switch-multibranch.json");
    const { workflow } = importN8nWorkflow(fx);

    const sw = workflow.blocks.find((b) => b.type === "switch")!;
    expect(sw).toBeDefined();

    const swEdges = workflow.edges.filter((e) => e.source === sw.id);
    // 4 outputs in fixture
    expect(swEdges).toHaveLength(4);

    const handles = swEdges.map((e) => e.source_handle).sort();
    // Last index becomes "default", so we expect: 0, 1, 2, default
    expect(handles).toEqual(["0", "1", "2", "default"]);
  });
});

// =====================================================================
// Skipping & fallbacks
// =====================================================================

describe("importN8nWorkflow — skip / fallback rules", () => {
  it("silently drops sticky notes", () => {
    const fx = loadFixture("scheduled-set-http.json");
    const { workflow, warnings } = importN8nWorkflow(fx);

    // No block with title "Sticky"
    expect(workflow.blocks.find((b) => b.title === "Sticky")).toBeUndefined();

    // No warning mentioning sticky note
    expect(
      warnings.some((w) => w.toLowerCase().includes("sticky")),
    ).toBe(false);
  });

  it("falls back to 'code' block with TODO for unknown node types", () => {
    const n8n: N8nWorkflow = {
      name: "with-unknown",
      nodes: [
        {
          id: "x",
          name: "Mystery",
          type: "n8n-nodes-base.someFutureNode",
          position: [0, 0],
          parameters: { foo: "bar" },
        },
      ],
      connections: {},
    };
    const { workflow, warnings } = importN8nWorkflow(n8n);

    expect(workflow.blocks).toHaveLength(1);
    const b = workflow.blocks[0]!;
    expect(b.type).toBe("code");
    expect(b.config).toMatchObject({
      _n8n_original_type: "n8n-nodes-base.someFutureNode",
    });
    expect(b.config!.code).toContain("TODO");
    expect(b.config!.code).toContain("someFutureNode");

    expect(warnings.some((w) => w.includes("someFutureNode"))).toBe(true);
  });

  it("maps langchain lmChat* to llm and embeddings* to embedder", () => {
    const n8n: N8nWorkflow = {
      name: "lc",
      nodes: [
        {
          name: "Chat",
          type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
          position: [0, 0],
          parameters: { model: "gpt-4o-mini" },
        },
        {
          name: "Embed",
          type: "@n8n/n8n-nodes-langchain.embeddingsOpenAi",
          position: [200, 0],
          parameters: { model: "text-embedding-3-small" },
        },
      ],
      connections: {},
    };
    const { workflow, warnings } = importN8nWorkflow(n8n);
    const types = workflow.blocks.map((b) => b.type).sort();
    expect(types).toEqual(["embedder", "llm"]);
    expect(warnings).toEqual([]);
  });

  it("maps executeWorkflow and langchain agent into first-class runtime nodes", () => {
    const n8n: N8nWorkflow = {
      name: "composition-agent",
      nodes: [
        {
          name: "Run Child",
          type: "n8n-nodes-base.executeWorkflow",
          position: [0, 0],
          parameters: { workflowId: "wf_child", mode: "once" },
        },
        {
          name: "Agent",
          type: "@n8n/n8n-nodes-langchain.agent",
          position: [200, 0],
          parameters: { text: "Classify this ticket" },
        },
      ],
      connections: {},
    };
    const { workflow, warnings } = importN8nWorkflow(n8n);
    expect(workflow.blocks).toMatchObject([
      { title: "Run Child", type: "subworkflow", config: { workflowId: "wf_child", mode: "once" } },
      { title: "Agent", type: "ai_agent", config: { text: "Classify this ticket" } },
    ]);
    expect(warnings).toEqual([]);
  });
});

// =====================================================================
// Robustness / malformed input
// =====================================================================

describe("importN8nWorkflow — malformed / edge cases", () => {
  it("handles an empty workflow", () => {
    const { workflow, warnings } = importN8nWorkflow({});
    expect(workflow.blocks).toEqual([]);
    expect(workflow.edges).toEqual([]);
    expect(workflow.name).toBe("Imported n8n workflow");
    expect(warnings).toEqual([]);
  });

  it("does not throw on missing nodes/connections", () => {
    const { workflow } = importN8nWorkflow({
      name: "no-nodes",
      // intentionally missing nodes & connections
    } as N8nWorkflow);
    expect(workflow.blocks).toEqual([]);
    expect(workflow.edges).toEqual([]);
  });

  it("handles malformed connections object without throwing", () => {
    const n8n = {
      name: "bad-conn",
      nodes: [
        {
          name: "A",
          type: "n8n-nodes-base.manualTrigger",
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: "oops",
    } as unknown as N8nWorkflow;

    const { workflow, warnings } = importN8nWorkflow(n8n);
    expect(workflow.blocks).toHaveLength(1);
    expect(workflow.edges).toEqual([]);
    expect(
      warnings.some((w) => w.toLowerCase().includes("connections")),
    ).toBe(true);
  });

  it("drops edges whose target was skipped", () => {
    const n8n: N8nWorkflow = {
      name: "with-sticky-target",
      nodes: [
        {
          name: "Trigger",
          type: "n8n-nodes-base.manualTrigger",
          position: [0, 0],
          parameters: {},
        },
        {
          name: "Sticky",
          type: "n8n-nodes-base.stickyNote",
          position: [200, 0],
          parameters: {},
        },
      ],
      connections: {
        Trigger: {
          main: [[{ node: "Sticky", type: "main", index: 0 }]],
        },
      },
    };
    const { workflow, warnings } = importN8nWorkflow(n8n);
    expect(workflow.blocks).toHaveLength(1); // sticky dropped
    expect(workflow.edges).toEqual([]);
    expect(
      warnings.some(
        (w) => w.includes("Trigger") && w.includes("Sticky") && w.includes("dropped"),
      ),
    ).toBe(true);
  });

  it("warns and drops non-'main' connection ports", () => {
    const n8n: N8nWorkflow = {
      name: "ai-port",
      nodes: [
        {
          name: "Chat",
          type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
          position: [0, 0],
          parameters: {},
        },
        {
          name: "Trigger",
          type: "n8n-nodes-base.manualTrigger",
          position: [200, 0],
          parameters: {},
        },
      ],
      connections: {
        Trigger: {
          ai_languageModel: [[{ node: "Chat", type: "ai_languageModel", index: 0 }]],
        },
      },
    };
    const { workflow, warnings } = importN8nWorkflow(n8n);
    expect(workflow.edges).toEqual([]);
    expect(
      warnings.some((w) => w.includes("ai_languageModel")),
    ).toBe(true);
  });

  it("generates unique IDs when two nodes share the same name slug", () => {
    const n8n: N8nWorkflow = {
      name: "dup-ids",
      nodes: [
        {
          name: "Set",
          type: "n8n-nodes-base.set",
          position: [0, 0],
          parameters: {},
        },
        {
          name: "Set",
          type: "n8n-nodes-base.set",
          position: [200, 0],
          parameters: {},
        },
      ],
      connections: {},
    };
    const { workflow } = importN8nWorkflow(n8n);
    expect(workflow.blocks).toHaveLength(2);
    expect(workflow.blocks[0]!.id).not.toBe(workflow.blocks[1]!.id);
  });

  it("uses default workflow name when name is missing or empty", () => {
    const { workflow: w1 } = importN8nWorkflow({ name: "   " });
    expect(w1.name).toBe("Imported n8n workflow");
    const { workflow: w2 } = importN8nWorkflow({});
    expect(w2.name).toBe("Imported n8n workflow");
  });

  it("skips malformed node entries", () => {
    const n8n = {
      name: "broken",
      nodes: [
        null,
        { name: "ok", type: "n8n-nodes-base.set", position: [0, 0], parameters: {} },
        { type: "n8n-nodes-base.set" }, // missing name
      ],
      connections: {},
    } as unknown as N8nWorkflow;
    const { workflow, warnings } = importN8nWorkflow(n8n);
    expect(workflow.blocks).toHaveLength(1);
    expect(workflow.blocks[0]!.title).toBe("ok");
    // Two malformed entries -> two warnings
    const malformed = warnings.filter((w) => w.toLowerCase().includes("malformed"));
    expect(malformed.length).toBeGreaterThanOrEqual(2);
  });
});
