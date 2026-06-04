import { describe, expect, it } from "vitest";
import {
  BLOCK_ALIASES,
  BLOCK_TYPES,
  filterBlocksBySearch,
} from "../types.js";

describe("BLOCK_TYPES registry", () => {
  it("includes all n8n-derived and runtime bridge block types", () => {
    const newTypes = [
      "set",
      "filter",
      "switch",
      "aggregate",
      "sort",
      "limit",
      "split_out",
      "summarize",
      "remove_duplicates",
      "datetime",
      "wait",
      "schedule_trigger",
      "manual_trigger",
      "gmail_trigger",
      "notion_trigger",
      "human_approval",
      "human_form",
      "decision_review",
      "subworkflow",
      "outbound_webhook",
      "ai_agent",
    ];
    const ids = new Set(BLOCK_TYPES.map((b) => b.type));
    for (const t of newTypes) {
      expect(ids.has(t), `expected ${t} in BLOCK_TYPES`).toBe(true);
    }
  });

  it("preserves the 26 legacy block types", () => {
    const legacyTypes = [
      "start",
      "end",
      "document_loader",
      "document_parser",
      "chunker",
      "embedder",
      "model_selector",
      "vector_store",
      "collection",
      "retriever",
      "reranker",
      "llm",
      "prompt_template",
      "answer",
      "condition",
      "router",
      "ai_router",
      "loop",
      "merge",
      "code",
      "variable",
      "field_selector",
      "metadata_extractor",
      "http_request",
      "webhook",
    ];
    const ids = new Set(BLOCK_TYPES.map((b) => b.type));
    for (const t of legacyTypes) {
      expect(ids.has(t), `expected legacy ${t} preserved`).toBe(true);
    }
  });

  it("maps new blocks to expected categories", () => {
    const byType = new Map(BLOCK_TYPES.map((b) => [b.type, b]));
    expect(byType.get("set")?.category).toBe("Transform");
    expect(byType.get("filter")?.category).toBe("Transform");
    expect(byType.get("aggregate")?.category).toBe("Transform");
    expect(byType.get("sort")?.category).toBe("Transform");
    expect(byType.get("limit")?.category).toBe("Transform");
    expect(byType.get("split_out")?.category).toBe("Transform");
    expect(byType.get("summarize")?.category).toBe("Transform");
    expect(byType.get("remove_duplicates")?.category).toBe("Transform");
    expect(byType.get("datetime")?.category).toBe("Transform");
    expect(byType.get("switch")?.category).toBe("Logic");
    expect(byType.get("wait")?.category).toBe("Trigger");
    expect(byType.get("schedule_trigger")?.category).toBe("Trigger");
    expect(byType.get("manual_trigger")?.category).toBe("Trigger");
    expect(byType.get("gmail_trigger")?.category).toBe("Communication");
    expect(byType.get("notion_trigger")?.category).toBe("Productivity");
    expect(byType.get("human_approval")?.category).toBe("HITL");
    expect(byType.get("human_form")?.category).toBe("HITL");
    expect(byType.get("decision_review")?.category).toBe("RAG");
    expect(byType.get("subworkflow")?.category).toBe("Control");
    expect(byType.get("outbound_webhook")?.category).toBe("Integration");
    expect(byType.get("ai_agent")?.category).toBe("Agent");
  });
});

describe("filterBlocksBySearch", () => {
  it("returns all blocks when query is empty or whitespace", () => {
    expect(filterBlocksBySearch(BLOCK_TYPES, "")).toHaveLength(BLOCK_TYPES.length);
    expect(filterBlocksBySearch(BLOCK_TYPES, "   ")).toHaveLength(BLOCK_TYPES.length);
  });

  it("filters by label (case-insensitive)", () => {
    const out = filterBlocksBySearch(BLOCK_TYPES, "Document");
    const types = out.map((b) => b.type).sort();
    expect(types).toContain("document_loader");
    expect(types).toContain("document_parser");
    // 'http_request' shouldn't be in there
    expect(types).not.toContain("http_request");
  });

  it("filters by block type id", () => {
    const out = filterBlocksBySearch(BLOCK_TYPES, "decision_review");
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("decision_review");
  });

  it("filters by alias — 'router' surfaces if/condition block", () => {
    const out = filterBlocksBySearch(BLOCK_TYPES, "router");
    const types = out.map((b) => b.type);
    // condition has alias 'router'
    expect(types).toContain("condition");
    // explicit router and ai_router
    expect(types).toContain("router");
    expect(types).toContain("ai_router");
  });

  it("filters by alias — 'dedupe' finds remove_duplicates", () => {
    const out = filterBlocksBySearch(BLOCK_TYPES, "dedupe");
    expect(out.map((b) => b.type)).toContain("remove_duplicates");
  });

  it("filters by alias — 'http' finds http_request and webhook", () => {
    const out = filterBlocksBySearch(BLOCK_TYPES, "http");
    const types = out.map((b) => b.type);
    expect(types).toContain("http_request");
    expect(types).toContain("webhook");
  });

  it("returns empty array on no matches", () => {
    const out = filterBlocksBySearch(BLOCK_TYPES, "this-string-matches-nothing-xyz");
    expect(out).toEqual([]);
  });

  it("respects custom alias map", () => {
    const customAliases = { llm: ["zzbespoke"] };
    const out = filterBlocksBySearch(BLOCK_TYPES, "zzbespoke", customAliases);
    expect(out.map((b) => b.type)).toEqual(["llm"]);
  });
});

describe("BLOCK_ALIASES coverage", () => {
  it("has alias entries for every block type", () => {
    for (const b of BLOCK_TYPES) {
      expect(
        BLOCK_ALIASES[b.type],
        `missing aliases for ${b.type}`,
      ).toBeDefined();
      expect(BLOCK_ALIASES[b.type].length).toBeGreaterThan(0);
    }
  });
});
