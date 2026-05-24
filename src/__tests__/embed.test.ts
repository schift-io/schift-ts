import { afterEach, describe, expect, it, vi } from "vitest";
import { Schift } from "../client.js";

describe("Schift client embed → /v1/embeddings", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("embed() POSTs OpenAI-shaped body to /v1/embeddings and unwraps single", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
          model: "schift-embed-1-small",
          usage: { prompt_tokens: 4, total_tokens: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const out = await client.embed({ text: "hello", model: "schift-embed-1-small" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.schift.io/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"input":"hello"'),
      }),
    );
    expect(out).toEqual({
      embedding: [0.1, 0.2, 0.3],
      model: "schift-embed-1-small",
      dimensions: 3,
      usage: { tokens: 4 },
    });
  });

  it("embedBatch() sends array input and preserves index order on unwrap", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          object: "list",
          data: [
            { object: "embedding", index: 1, embedding: [0.4, 0.5] },
            { object: "embedding", index: 0, embedding: [0.1, 0.2] },
          ],
          model: "schift-embed-1-small",
          usage: { prompt_tokens: 7, total_tokens: 7 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const out = await client.embedBatch({ texts: ["a", "bb"] });

    const call = mockFetch.mock.calls[0];
    expect(call?.[0]).toBe("https://api.schift.io/v1/embeddings");
    expect(String(call?.[1]?.body)).toContain('"input":["a","bb"]');
    expect(out.embeddings).toEqual([
      [0.1, 0.2],
      [0.4, 0.5],
    ]);
    expect(out.usage).toEqual({ tokens: 7, count: 2 });
  });
});
