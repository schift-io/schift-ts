/**
 * Client-side TokenTracker — accumulate per-call usage locally.
 *
 * Phase A: in-process accumulator. Walks response bodies for a `usage`
 * field and folds it into the active TokenTracker. The 6+ axis slots map
 * to the server-side metering axes (`search`, `ingest`, `execution`,
 * `web_search`, `llm`, `storage`). Axes the server does not currently
 * expose per-response stay at zero; Phase B will fill those in via
 * response headers.
 *
 * Inspired by LightRAG's `TokenTracker` pattern, extended to our 6 axis
 * slots and made async-safe via Node's `AsyncLocalStorage` when available
 * (with a `globalThis` fallback for browser/edge runtimes).
 *
 * @example
 * ```ts
 * import { Schift, track } from "@schift-io/sdk";
 *
 * const client = new Schift({ apiKey: "sch_xxx" });
 * const { result, usage } = await track(async () => {
 *   return client.chat({ bucket: "docs", message: "hello" });
 * });
 * console.log(usage);
 * // { call_count: 1, llm_input_tokens: 12, llm_output_tokens: 38, ... }
 * ```
 */

export interface TrackerSummary {
  call_count: number;
  llm_input_tokens: number;
  llm_output_tokens: number;
  search_calls: number;
  rerank_calls: number;
  ingest_pages: number;
  execution_calls: number;
  web_search_calls: number;
  storage_bytes: number;
  embed_tokens: number;
  /** Phase A: always null. Phase B will populate via response headers. */
  cost_estimate_usd: number | null;
}

const AXES: ReadonlyArray<keyof Omit<TrackerSummary, "call_count" | "cost_estimate_usd">> = [
  "llm_input_tokens",
  "llm_output_tokens",
  "search_calls",
  "rerank_calls",
  "ingest_pages",
  "execution_calls",
  "web_search_calls",
  "storage_bytes",
  "embed_tokens",
];

function emptyTotals(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of AXES) out[a] = 0;
  return out;
}

export class TokenTracker {
  private callCount = 0;
  private totals: Record<string, number> = emptyTotals();
  private costEstimateUsd: number | null = null;

  /** Add `amount` to `axis`. Unknown axes are silently ignored. */
  addUsage(axis: string, amount: number): void {
    if (!(axis in this.totals)) return;
    if (!amount) return;
    this.totals[axis] += Math.trunc(amount);
  }

  /** Record one (or more) API calls. Called by the HTTP layer hook. */
  addCall(count = 1): void {
    this.callCount += count;
  }

  /**
   * Extract usage info from a response body and fold it in.
   *
   * Recognises:
   * - `{usage: {prompt_tokens, completion_tokens}}` (OpenAI-style)
   * - `{usage: {input_tokens, output_tokens}}` (Anthropic-style)
   * - OpenAI-shaped embeddings responses with `data[].embedding`
   * - `{usage: {total_tokens}}` (embed/rerank fallback → embed_tokens)
   *
   * Bodies without a `usage` field still increment `call_count`.
   */
  recordResponse(body: unknown): void {
    this.addCall();
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    const usage = (body as { usage?: unknown }).usage;
    if (!usage || typeof usage !== "object") return;

    const u = usage as Record<string, unknown>;
    if (isEmbeddingResponse(body as Record<string, unknown>)) {
      const total = numeric(u.total_tokens) ?? numeric(u.prompt_tokens) ?? 0;
      if (total) this.addUsage("embed_tokens", total);
      return;
    }

    const promptTokens = numeric(u.prompt_tokens) ?? numeric(u.input_tokens) ?? 0;
    const completionTokens =
      numeric(u.completion_tokens) ?? numeric(u.output_tokens) ?? 0;

    if (promptTokens || completionTokens) {
      this.addUsage("llm_input_tokens", promptTokens);
      this.addUsage("llm_output_tokens", completionTokens);
      return;
    }

    const total = numeric(u.total_tokens) ?? 0;
    if (total) this.addUsage("embed_tokens", total);
  }

  /** Snapshot of the current totals. cost_estimate_usd is null in Phase A. */
  summary(): TrackerSummary {
    return {
      call_count: this.callCount,
      llm_input_tokens: this.totals.llm_input_tokens,
      llm_output_tokens: this.totals.llm_output_tokens,
      search_calls: this.totals.search_calls,
      rerank_calls: this.totals.rerank_calls,
      ingest_pages: this.totals.ingest_pages,
      execution_calls: this.totals.execution_calls,
      web_search_calls: this.totals.web_search_calls,
      storage_bytes: this.totals.storage_bytes,
      embed_tokens: this.totals.embed_tokens,
      cost_estimate_usd: this.costEstimateUsd,
    };
  }

  /** Clear all accumulated counters. */
  reset(): void {
    this.callCount = 0;
    this.totals = emptyTotals();
    this.costEstimateUsd = null;
  }
}

function numeric(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function isEmbeddingResponse(body: Record<string, unknown>): boolean {
  const data = body.data;
  return Array.isArray(data) && data.some(
    (item) =>
      !!item &&
      typeof item === "object" &&
      Array.isArray((item as Record<string, unknown>).embedding),
  );
}

// ---- active-tracker plumbing ----
//
// Node has AsyncLocalStorage; browser/edge does not. We try both, falling
// back to a globalThis-pinned single tracker for environments without ALS.
// The fallback isn't truly task-local but Phase A targets dev usage where a
// single in-flight `track()` block is the norm; Node ALS handles concurrent
// tasks correctly.

interface ActiveStore {
  run<T>(t: TokenTracker, fn: () => Promise<T> | T): Promise<T> | T;
  get(): TokenTracker | undefined;
}

let _store: ActiveStore | null = null;

async function loadStore(): Promise<ActiveStore> {
  if (_store) return _store;
  try {
    // Dynamic import so this still tree-shakes for browser builds; the
    // `node:` prefix prevents bundlers from trying to resolve it.
    const mod = await import("node:async_hooks").catch(() => null as unknown as { AsyncLocalStorage?: new () => unknown });
    const ALS = (mod as { AsyncLocalStorage?: new () => unknown } | null)?.AsyncLocalStorage;
    if (ALS) {
      const als = new ALS() as {
        run<T>(store: TokenTracker, fn: () => T): T;
        getStore(): TokenTracker | undefined;
      };
      _store = {
        run: (t, fn) => als.run(t, fn),
        get: () => als.getStore(),
      };
      return _store;
    }
  } catch {
    // fall through to globalThis fallback
  }
  // Fallback: globalThis-pinned single tracker. Sufficient for browser dev
  // demos where one `track()` block is in flight at a time.
  const KEY = "__schift_active_tracker__";
  _store = {
    run: async <T,>(t: TokenTracker, fn: () => Promise<T> | T): Promise<T> => {
      const g = globalThis as unknown as Record<string, TokenTracker | undefined>;
      const prev = g[KEY];
      g[KEY] = t;
      try {
        return await fn();
      } finally {
        g[KEY] = prev;
      }
    },
    get: () => {
      const g = globalThis as unknown as Record<string, TokenTracker | undefined>;
      return g[KEY];
    },
  };
  return _store;
}

// Eagerly init so `activeTracker()` works synchronously after first call.
let _storeReady: Promise<ActiveStore> | null = null;
function ensureStore(): Promise<ActiveStore> {
  if (!_storeReady) _storeReady = loadStore();
  return _storeReady;
}

/**
 * Run `fn` inside a fresh TokenTracker. Returns the function's result and
 * the tracker's summary.
 *
 * @example
 * ```ts
 * const { result, usage } = await track(async () => {
 *   return client.chat({ bucket: "docs", message: "hi" });
 * });
 * ```
 */
export async function track<T>(
  fn: (tracker: TokenTracker) => Promise<T> | T,
): Promise<{ result: T; usage: TrackerSummary; tracker: TokenTracker }> {
  const tracker = new TokenTracker();
  const store = await ensureStore();
  const result = await store.run(tracker, () => fn(tracker));
  return { result, usage: tracker.summary(), tracker };
}

/**
 * Return the currently-active tracker for this async context, or undefined.
 * Used by the HTTP layer to fold response usage into the right tracker.
 */
export function activeTracker(): TokenTracker | undefined {
  if (!_store) return undefined;
  return _store.get();
}

/**
 * Internal hook for the SDK's HTTP layer. Folds a response body's `usage`
 * field into the active tracker (if any). No-op when no tracker is active.
 */
export function _recordResponseInActiveTracker(body: unknown): void {
  const t = activeTracker();
  if (!t) return;
  try {
    t.recordResponse(body);
  } catch {
    // tracker must never break the actual API call
  }
}
