import { describe, it, expect } from "vitest";
import {
  getDescriptor,
  listDescriptors,
  descriptorsByCategory,
  searchDescriptors,
  descriptorsByCategoryGrouped,
  Category,
} from "../descriptors.js";
import { BlockType } from "../types.js";
import { ConnectionTypes } from "../connection-types.js";

describe("descriptor registry", () => {
  it("has descriptors for major block types", () => {
    expect(getDescriptor(BlockType.START)).toBeDefined();
    expect(getDescriptor(BlockType.END)).toBeDefined();
    expect(getDescriptor(BlockType.LLM)).toBeDefined();
    expect(getDescriptor(BlockType.RETRIEVER)).toBeDefined();
    expect(getDescriptor(BlockType.HTTP_REQUEST)).toBeDefined();
    expect(getDescriptor(BlockType.DECISION_REVIEW)).toBeDefined();
    expect(getDescriptor(BlockType.HUMAN_APPROVAL)).toBeDefined();
    expect(getDescriptor(BlockType.SET)).toBeDefined();
    expect(getDescriptor(BlockType.FILTER)).toBeDefined();
    expect(getDescriptor(BlockType.SWITCH)).toBeDefined();
    expect(getDescriptor(BlockType.AGGREGATE)).toBeDefined();
    expect(getDescriptor(BlockType.SORT)).toBeDefined();
    expect(getDescriptor(BlockType.LIMIT)).toBeDefined();
    expect(getDescriptor(BlockType.SUMMARIZE)).toBeDefined();
    expect(getDescriptor(BlockType.REMOVE_DUPLICATES)).toBeDefined();
    expect(getDescriptor(BlockType.SCHEDULE_TRIGGER)).toBeDefined();
    expect(getDescriptor(BlockType.WAIT)).toBeDefined();
    expect(getDescriptor(BlockType.SOURCE_QUERY)).toBeDefined();
    expect(getDescriptor(BlockType.SOURCE_WRITE)).toBeDefined();
  });

  it("has a descriptor for every BlockType", () => {
    for (const type of Object.values(BlockType)) {
      expect(getDescriptor(type), `${type} missing descriptor`).toBeDefined();
    }
  });

  it("returns undefined for unknown types", () => {
    expect(getDescriptor("nonexistent")).toBeUndefined();
  });

  it("listDescriptors returns at least 30 descriptors", () => {
    const all = listDescriptors();
    expect(all.length).toBeGreaterThanOrEqual(30);
  });

  it("every descriptor has a non-empty codex.categories", () => {
    for (const d of listDescriptors()) {
      expect(d.codex.categories.length).toBeGreaterThan(0);
      expect(d.displayName.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.group.length).toBeGreaterThan(0);
    }
  });

  it("RAG category contains RAG-native nodes", () => {
    const rag = descriptorsByCategory(Category.RAG);
    const names = rag.map((d) => d.name);
    expect(names).toContain(BlockType.RETRIEVER);
    expect(names).toContain(BlockType.VECTOR_STORE);
    expect(names).toContain(BlockType.DECISION_REVIEW);
    expect(names).toContain(BlockType.RAG);
    expect(names).toContain(BlockType.RERANKER);
  });

  it("HITL category contains approval + form + wait", () => {
    const hitl = descriptorsByCategory(Category.HITL);
    const names = hitl.map((d) => d.name);
    expect(names).toContain(BlockType.HUMAN_APPROVAL);
    expect(names).toContain(BlockType.HUMAN_FORM);
    expect(names).toContain(BlockType.WAIT);
  });

  it("If node has 2 main outputs named true/false (n8n parity)", () => {
    const ifd = getDescriptor(BlockType.CONDITION);
    expect(ifd?.outputs.length).toBe(2);
    expect(ifd?.outputs.map((p) => p.name)).toEqual(["true", "false"]);
    expect(ifd?.outputs.every((p) => p.type === ConnectionTypes.Main)).toBe(true);
  });

  it("Retriever requires a RagCollection sidecar input", () => {
    const r = getDescriptor(BlockType.RETRIEVER);
    const sidecar = r?.inputs.find((i) => i.type === ConnectionTypes.RagCollection);
    expect(sidecar).toBeDefined();
    expect(sidecar?.required).toBe(true);
  });

  it("AI Router pulls in a Language Model sidecar", () => {
    const r = getDescriptor(BlockType.AI_ROUTER);
    const sidecar = r?.inputs.find((i) => i.type === ConnectionTypes.AgentLanguageModel);
    expect(sidecar).toBeDefined();
    expect(sidecar?.required).toBe(true);
  });

  it("Decision Review surfaces the rag_decisionReview output port", () => {
    const d = getDescriptor(BlockType.DECISION_REVIEW);
    const out = d?.outputs.find((p) => p.type === ConnectionTypes.RagDecisionReview);
    expect(out).toBeDefined();
  });

  it("searchDescriptors finds nodes by alias (case-insensitive)", () => {
    const r = searchDescriptors("router");
    const names = r.map((d) => d.name);
    // Both `if` and `switch` carry "router" alias
    expect(names).toContain(BlockType.CONDITION);
    expect(names).toContain(BlockType.SWITCH);
  });

  it("searchDescriptors finds nodes by displayName", () => {
    const r = searchDescriptors("decision");
    expect(r.map((d) => d.name)).toContain(BlockType.DECISION_REVIEW);
  });

  it("descriptorsByCategoryGrouped returns a populated map", () => {
    const grouped = descriptorsByCategoryGrouped();
    expect(grouped[Category.RAG]?.length ?? 0).toBeGreaterThan(0);
    expect(grouped[Category.CoreNodes]?.length ?? 0).toBeGreaterThan(0);
    expect(grouped[Category.HITL]?.length ?? 0).toBeGreaterThan(0);
  });
});
