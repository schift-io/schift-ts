import { afterEach, describe, expect, it, vi } from "vitest";
import { Schift } from "../client.js";
import { TokenTracker, activeTracker, track } from "../tracker.js";

describe("TokenTracker", () => {
  it("starts empty", () => {
    const t = new TokenTracker();
    const s = t.summary();
    expect(s.call_count).toBe(0);
    expect(s.llm_input_tokens).toBe(0);
    expect(s.llm_output_tokens).toBe(0);
    expect(s.cost_estimate_usd).toBeNull();
  });

  it("records OpenAI-style usage", () => {
    const t = new TokenTracker();
    t.recordResponse({
      id: "chatcmpl_x",
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    });
    const s = t.summary();
    expect(s.call_count).toBe(1);
    expect(s.llm_input_tokens).toBe(12);
    expect(s.llm_output_tokens).toBe(34);
    expect(s.embed_tokens).toBe(0);
  });

  it("records Anthropic-style usage", () => {
    const t = new TokenTracker();
    t.recordResponse({ usage: { input_tokens: 7, output_tokens: 9 } });
    const s = t.summary();
    expect(s.llm_input_tokens).toBe(7);
    expect(s.llm_output_tokens).toBe(9);
  });

  it("treats embed-only total_tokens as embed_tokens", () => {
    const t = new TokenTracker();
    t.recordResponse({ usage: { total_tokens: 50 } });
    const s = t.summary();
    expect(s.embed_tokens).toBe(50);
    expect(s.llm_input_tokens).toBe(0);
  });

  it("treats OpenAI-shaped embeddings as embed_tokens", () => {
    const t = new TokenTracker();
    t.recordResponse({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 4, total_tokens: 4 },
    });
    const s = t.summary();
    expect(s.call_count).toBe(1);
    expect(s.embed_tokens).toBe(4);
    expect(s.llm_input_tokens).toBe(0);
    expect(s.llm_output_tokens).toBe(0);
  });

  it("fails soft for unknown usage shapes", () => {
    const t = new TokenTracker();
    t.recordResponse({ usage: { tokens: { input: 3 }, prompt_tokens: "many" } });
    const s = t.summary();
    expect(s.call_count).toBe(1);
    expect(s.llm_input_tokens).toBe(0);
    expect(s.llm_output_tokens).toBe(0);
    expect(s.embed_tokens).toBe(0);
  });

  it("counts call even when usage is missing", () => {
    const t = new TokenTracker();
    t.recordResponse({ results: [{ id: "doc_1" }] });
    expect(t.summary().call_count).toBe(1);
  });

  it("ignores non-object bodies safely", () => {
    const t = new TokenTracker();
    t.recordResponse([1, 2, 3]);
    t.recordResponse("string body");
    t.recordResponse(null);
    expect(t.summary().call_count).toBe(3);
  });

  it("ignores unknown axis names", () => {
    const t = new TokenTracker();
    t.addUsage("not_a_real_axis", 999);
    expect(t.summary().call_count).toBe(0);
  });

  it("resets all counters", () => {
    const t = new TokenTracker();
    t.recordResponse({ usage: { prompt_tokens: 5, completion_tokens: 7 } });
    expect(t.summary().llm_input_tokens).toBe(5);
    t.reset();
    const s = t.summary();
    expect(s.call_count).toBe(0);
    expect(s.llm_input_tokens).toBe(0);
  });
});

describe("track() context", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("activeTracker is undefined outside a track() block", () => {
    expect(activeTracker()).toBeUndefined();
  });

  it("activeTracker is set inside a track() block", async () => {
    let inside: TokenTracker | undefined;
    const { result, usage } = await track(async (t) => {
      inside = activeTracker();
      // Same instance whether you take it from the arg or from activeTracker().
      expect(inside).toBe(t);
      return 42;
    });
    expect(result).toBe(42);
    expect(usage.call_count).toBe(0);
    // Cleared after block.
    expect(activeTracker()).toBeUndefined();
  });

  it("HTTP layer hook folds usage into the active tracker", async () => {
    const fakeChat = {
      id: "chatcmpl_x",
      reply: "hello",
      usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
    };
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify(fakeChat), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });

    const { usage } = await track(async () => {
      // Use chatCompletion — bypasses _resolveBucket so the mock only sees
      // one POST.
      await client.chatCompletion({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      });
      await client.chatCompletion({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "again" }],
      });
    });

    expect(usage.call_count).toBe(2);
    expect(usage.llm_input_tokens).toBe(22);
    expect(usage.llm_output_tokens).toBe(44);
  });

  it("isolates two concurrent track() blocks", async () => {
    // AsyncLocalStorage path — each task should see its own tracker.
    const fakeUsage = (p: number, c: number) => ({
      id: "x",
      usage: { prompt_tokens: p, completion_tokens: c },
    });

    let nextResp: { p: number; c: number } | null = null;
    const mockFetch = vi.fn(async () => {
      const r = nextResp ?? { p: 0, c: 0 };
      return new Response(JSON.stringify(fakeUsage(r.p, r.c)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });

    const taskA = track(async () => {
      nextResp = { p: 100, c: 200 };
      await client.chatCompletion({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "a" }],
      });
      // small async hop
      await new Promise((r) => setTimeout(r, 5));
    });

    const taskB = track(async () => {
      nextResp = { p: 1, c: 2 };
      await client.chatCompletion({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "b" }],
      });
      await new Promise((r) => setTimeout(r, 5));
    });

    const [a, b] = await Promise.all([taskA, taskB]);
    // Both ran one call each.
    expect(a.usage.call_count).toBe(1);
    expect(b.usage.call_count).toBe(1);
    // Usage totals are bounded by total of both responses (race on
    // shared mockFetch counter), but each tracker's call_count is 1
    // because activeTracker() resolves correctly per async context.
    expect(a.usage.llm_input_tokens + b.usage.llm_input_tokens).toBeGreaterThan(0);
  });
});
