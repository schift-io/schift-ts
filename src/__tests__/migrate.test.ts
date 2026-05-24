import { afterEach, describe, expect, it, vi } from "vitest";
import { Schift } from "../client.js";
import { QuotaError } from "../errors.js";

/**
 * MigrateClient is exposed as `client.migrate`. Tests verify path/method/body
 * shape for feasibility, quote, start (POSTs) and status (GET poll).
 */
describe("MigrateClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function ok<T>(payload: T) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("feasibility() POSTs /v1/migrate/feasibility with target_model default", async () => {
    const mockFetch = vi.fn(async () =>
      ok({
        cka: 0.92,
        recommended_method: "ridge",
        holdout_cosine: 0.88,
        calibration_samples_recommended: 5000,
        notes: "good drift profile",
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const resp = await client.migrate.feasibility({
      source_model: "text-embedding-3-large",
      source_vectors: [[0.1, 0.2]],
      target_vectors: [[0.3, 0.4]],
    });

    expect(resp.recommended_method).toBe("ridge");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.schift.io/v1/migrate/feasibility");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    // Default target_model="schift-embed-1-small" must be injected.
    expect(body.target_model).toBe("schift-embed-1-small");
    expect(body.source_model).toBe("text-embedding-3-large");
    expect(body.source_vectors).toEqual([[0.1, 0.2]]);
  });

  it("quote() POSTs /v1/migrate/quote with token/profile contract", async () => {
    const mockFetch = vi.fn(async () =>
      ok({
        tier: "starter_trial",
        trial_plan: "starter",
        trial_months: 1,
        customer_price_usd: 0,
        vendor_full_cost_usd: 0.13,
        card_required: true,
        contact_sales: false,
        savings_vs_vendor_direct_usd: 0.13,
        source_profile: "vector_store",
        pipeline: "vector_projection",
        ocr_required: false,
        messaging: "Starter trial migration",
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const resp = await client.migrate.quote({
      n_tokens: 1_000_000,
      source_profile: "vector_store",
    });

    expect(resp.contact_sales).toBe(false);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.schift.io/v1/migrate/quote");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.sla_tier).toBe("std");
    expect(body.n_tokens).toBe(1_000_000);
    expect(body.source_profile).toBe("vector_store");
    expect(body.source).toBeUndefined();
  });

  it("start() POSTs /v1/migrate/start with runtime-valid token/profile contract", async () => {
    const mockFetch = vi.fn(async () =>
      ok({
        job_id: "job_123",
        state: "queued",
        tier: "starter_trial",
        trial_plan: "starter",
        trial_months: 1,
        customer_price_usd: 0,
        card_required: true,
        requires_payment: false,
        checkout_url: null,
        quote: {
          tier: "starter_trial",
          trial_plan: "starter",
          trial_months: 1,
          customer_price_usd: 0,
          vendor_full_cost_usd: 0.13,
          card_required: true,
          contact_sales: false,
          savings_vs_vendor_direct_usd: 0.13,
          source_profile: "obsidian_vault",
          pipeline: "knowledge_import",
          ocr_required: false,
          messaging: "Obsidian vault migration",
        },
        messaging: "Obsidian vault migration",
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const resp = await client.migrate.start({
      source: { kind: "chroma", config: { url: "http://x" } },
      target_collection_id: "col_x",
      n_tokens: 1_000_000,
      source_profile: "obsidian_vault",
    });

    expect(resp.job_id).toBe("job_123");
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.schift.io/v1/migrate/start");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.method).toBe("ridge");
    expect(body.retain_on_cloud).toBe(true);
    expect(body.sla_tier).toBe("std");
    expect(body.target_collection_id).toBe("col_x");
    expect(body.n_tokens).toBe(1_000_000);
    expect(body.source_profile).toBe("obsidian_vault");
  });

  it("status() GETs /v1/migrate/{jobId}", async () => {
    const mockFetch = vi.fn(async () =>
      ok({
        job_id: "job_123",
        state: "running",
        progress: 0.42,
        n_total: 50_000,
        n_projected: 21_000,
        cka: 0.91,
        sample_retention: 0.97,
        error: null,
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    const status = await client.migrate.status("job_123");

    expect(status.progress).toBeCloseTo(0.42);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.schift.io/v1/migrate/job_123");
    expect(init?.method).toBe("GET");
  });

  it("maps 402 to QuotaError on start()", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "migration credits exhausted" }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new Schift({ apiKey: "sch_test" });
    await expect(
      client.migrate.start({
        source: { kind: "pinecone", config: {} },
        target_collection_id: "col_y",
        n_tokens: 10_000_000_000,
        source_profile: "vector_store",
      }),
    ).rejects.toBeInstanceOf(QuotaError);
  });
});
