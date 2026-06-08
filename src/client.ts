import {
  AuthError,
  EntitlementError,
  QuotaError,
  SchiftError,
} from "./errors.js";
import type {
  SchiftConfig,
  EmbedRequest,
  EmbedResponse,
  EmbedBatchRequest,
  EmbedBatchResponse,
  EmbedImageRequest,
  EmbedImageResponse,
  PiiRedactRequest,
  PiiRedactResponse,
  PiiRestoreRequest,
  PiiRestoreResponse,
  SearchRequest,
  SearchResult,
  ProjectRequest,
  ProjectResponse,
  BucketUploadResult,
  BucketCollection,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  CatalogModel,
  AggregateRequest,
  AggregateResponse,
  BucketContextRequest,
  BucketContextResponse,
  SchiftAuthConfig,
  AuthSignupRequest,
  AuthSignupResponse,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  CompanyCore,
  CompanyCoreUpdate,
  CompleteOnboardingRequest,
  CompleteOnboardingResponse,
  OnboardingStateRequest,
  OnboardingStateResponse,
  OnboardingStateUpdate,
} from "./types.js";
import { _recordResponseInActiveTracker } from "./tracker.js";
import { WorkflowClient } from "./workflow/client.js";
import type { HttpTransport } from "./workflow/client.js";
import {
  SchiftWorkflowArtifact,
  workflow as createWorkflowArtifact,
} from "./workflow-v2/index.js";
import type { WorkflowV2ArtifactInput } from "./workflow-v2/index.js";
import { AgentsClient } from "./agents/client.js";
import { ProvidersClient } from "./providers/client.js";
import { MigrateClient } from "./migrate/client.js";
import { SchiftTools } from "./tools.js";

const DEFAULT_BASE_URL = "https://api.schift.io";
const DEFAULT_TIMEOUT = 60_000;
const VERSION = "0.9.2";

interface OpenAIEmbeddingsResponse {
  object: "list";
  data: Array<{ object: "embedding"; index: number; embedding: number[] }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

function unwrapSingle(raw: OpenAIEmbeddingsResponse): EmbedResponse {
  const first = raw.data[0];
  if (!first) {
    throw new SchiftError("embeddings response had no data");
  }
  return {
    embedding: first.embedding,
    model: raw.model,
    dimensions: first.embedding.length,
    usage: { tokens: raw.usage.total_tokens },
  };
}

function unwrapBatch(raw: OpenAIEmbeddingsResponse): EmbedBatchResponse {
  const sorted = [...raw.data].sort((a, b) => a.index - b.index);
  const embeddings = sorted.map((d) => d.embedding);
  return {
    embeddings,
    model: raw.model,
    dimensions: embeddings[0]?.length ?? 0,
    usage: { tokens: raw.usage.total_tokens, count: embeddings.length },
  };
}

export class SchiftAuth {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: SchiftAuthConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  async signup(request: AuthSignupRequest): Promise<AuthSignupResponse> {
    return this.post<AuthSignupResponse>("/v1/auth/signup", {
      email: request.email,
      password: request.password,
      name: request.name ?? "",
      org_name: request.orgName,
      region: request.region ?? "seoul",
    });
  }

  async login(request: AuthLoginRequest): Promise<AuthLoginResponse> {
    return this.post<AuthLoginResponse>("/v1/auth/login", {
      email: request.email,
      password: request.password,
    });
  }

  async me(token: string): Promise<AuthMeResponse> {
    return this.get<AuthMeResponse>("/v1/auth/me", token);
  }

  async getOnboardingState(
    token: string,
    request: OnboardingStateRequest = {},
  ): Promise<OnboardingStateResponse> {
    const params = request.orgId
      ? `?${new URLSearchParams({ orgId: request.orgId }).toString()}`
      : "";
    return this.get<OnboardingStateResponse>(`/v1/onboarding/state${params}`, token);
  }

  async updateOnboardingState(
    token: string,
    request: OnboardingStateUpdate,
  ): Promise<OnboardingStateResponse> {
    return this.put<OnboardingStateResponse>("/v1/onboarding/state", token, request);
  }

  async completeOnboarding(
    token: string,
    request: CompleteOnboardingRequest,
  ): Promise<CompleteOnboardingResponse> {
    return this.post<CompleteOnboardingResponse>(
      "/v1/onboarding/complete",
      {
        orgId: request.orgId,
        selectedSources: request.selectedSources ?? [],
        selectedAutomations: request.selectedAutomations ?? [],
        businessRegistration: request.businessRegistration,
        ownerConfirmed: request.ownerConfirmed ?? false,
      },
      token,
    );
  }

  async getCompanyCore(token: string, orgId: string): Promise<CompanyCore> {
    return this.get<CompanyCore>(
      `/v1/organizations/${encodeURIComponent(orgId)}/company-core`,
      token,
    );
  }

  async updateCompanyCore(
    token: string,
    orgId: string,
    request: CompanyCoreUpdate,
  ): Promise<CompanyCore> {
    return this.put<CompanyCore>(
      `/v1/organizations/${encodeURIComponent(orgId)}/company-core`,
      token,
      { ...request },
    );
  }

  async health(): Promise<{ status: string; checks?: Record<string, unknown> }> {
    const resp = await fetch(`${this.baseUrl}/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse(resp);
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
    token?: string,
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": `schift-ts/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse<T>(resp);
  }

  private async get<T>(path: string, token: string): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse<T>(resp);
  }

  private async put<T>(
    path: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse<T>(resp);
  }

  private async handleResponse<T>(resp: Response): Promise<T> {
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new SchiftError(`Auth API error ${resp.status}: ${text}`, resp.status);
    }
    return (await resp.json()) as T;
  }
}

export class Schift {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  /**
   * Workflow sub-client for building and running RAG pipelines.
   *
   * @example
   * ```ts
   * const wf = await client.workflows.create({ name: "My RAG" });
   * const run = await client.workflows.run(wf.id, { query: "hello" });
   * ```
   */
  readonly workflows: WorkflowClient;

  /**
   * Lightweight Workflow v2 artifact factory.
   *
   * Framework adapters are intentionally not bundled into the core SDK. Use
   * separate packages such as `@schift-io/workflow-vercel-ai` to project this
   * artifact into a specific execution SDK.
   */
  workflow(input: WorkflowV2ArtifactInput): SchiftWorkflowArtifact {
    return createWorkflowArtifact(input);
  }

  /**
   * Managed Agents sub-client — create agents, start runs, stream events.
   *
   * @example
   * ```ts
   * const agent = await client.agents.create({ name: "CS Bot", instructions: "..." });
   * const run = await client.agents.runs(agent.id).create({ message: "Hello" });
   * ```
   */
  readonly agents: AgentsClient;

  /**
   * Models sub-module — list and inspect available embedding models.
   *
   * @example
   * ```ts
   * const models = await client.models.listModels();
   * const info = await client.models.getModel("openai/text-embedding-3-large");
   * ```
   */
  readonly models: {
    listModels(): Promise<CatalogModel[]>;
    getModel(modelId: string): Promise<CatalogModel>;
  };

  /**
   * DB sub-module for bucket and document management.
   *
   * @example
   * ```ts
   * const result = await client.db.upload("my-docs", {
   *   files: [new File([pdfBytes], "manual.pdf")],
   * });
   * ```
   */
  readonly db: {
    upload(
      bucket: string,
      options: {
        files: File[] | Blob[];
        /**
         * Per-upload metadata attached to every chunk of every file in this
         * call. Values are coerced to strings server-side. Use for filtering
         * at search time via `filter: { key: value }`.
         *
         * Limits: up to 32 keys, keys match `[A-Za-z0-9_.-]+` and are ≤64
         * chars, values are ≤512 chars, total JSON ≤4 KB. Reserved keys
         * (`document_id`, `chunk_id`, `bucket_id`, `text`, …) are rejected.
         *
         * @example { week: "18", team: "growth" }
         */
        metadata?: Record<string, string | number | boolean>;
        collectionId?: string;
      },
    ): Promise<BucketUploadResult>;
  };

  /**
   * Tool calling helpers — plug Schift search/chat into any LLM agent.
   *
   * @example
   * ```ts
   * // OpenAI
   * const response = await openai.chat.completions.create({
   *   model: "gpt-4o-mini",
   *   tools: schift.tools.openai(),
   *   messages: [{ role: "user", content: "계약서에서 해지 조건?" }],
   * });
   * const result = await schift.tools.handle(response.choices[0].message.tool_calls[0]);
   *
   * // Claude
   * const response = await anthropic.messages.create({
   *   tools: schift.tools.anthropic(),
   *   ...
   * });
   * ```
   */
  readonly tools: SchiftTools;

  /**
   * Providers sub-client for managing LLM API keys (BYOK).
   *
   * @example
   * ```ts
   * // Register a Gemini key
   * await client.providers.set("google", { api_key: "AIza..." });
   *
   * // Check if configured
   * const config = await client.providers.get("openai");
   * console.log(config.configured);
   * ```
   */
  readonly providers: ProvidersClient;

  /**
   * Migration client — vectors-in migration (pgvector / chroma / pinecone /
   * weaviate → schift-embed-1-small hub).
   *
   * @example
   * ```ts
   * const q = await schift.migrate.quote({ source: { kind: "pgvector", config: { dsn, table } } });
   * const job = await schift.migrate.start({ source, target_collection_id: "col_x" });
   * ```
   */
  readonly migrate: MigrateClient;

  /**
   * HTTP transport for agent/RAG use.
   *
   * @example
   * ```ts
   * const schift = new Schift({ apiKey: 'sch_...' });
   * const rag = new RAG({ bucket: 'docs' }, schift.transport);
   * const agent = new Agent({ ..., transport: schift.transport });
   * ```
   */
  readonly transport: HttpTransport;
  static auth(config: SchiftAuthConfig = {}): SchiftAuth {
    return new SchiftAuth(config);
  }

  constructor(config: SchiftConfig) {
    if (!config.apiKey?.startsWith("sch_")) {
      throw new SchiftError("Invalid API key. Keys start with 'sch_'");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;

    this.transport = {
      get: <T>(path: string) => this.get<T>(path),
      post: <T>(path: string, body: Record<string, unknown>) =>
        this.post<T>(path, body),
      patch: <T>(path: string, body: Record<string, unknown>) =>
        this.patch<T>(path, body),
      put: <T>(path: string, body: Record<string, unknown>) =>
        this.put<T>(path, body),
      delete: (path: string) => this.del(path),
    };

    this.workflows = new WorkflowClient(this.transport);
    this.agents = new AgentsClient(this.transport);
    this.providers = new ProvidersClient(this.transport);
    this.migrate = new MigrateClient(this.transport);

    // models sub-module — model catalog browsing
    this.models = {
      listModels: () => this.get<CatalogModel[]>("/v1/catalog"),
      getModel: (modelId: string) =>
        this.get<CatalogModel>(`/v1/catalog/${modelId}`),
    };

    // db sub-module — bind `this` so private helpers remain accessible
    this.db = {
      upload: this._dbUpload.bind(this),
    };

    // Tool calling helpers (web search auto-enabled)
    this.tools = new SchiftTools(
      (req: SearchRequest) => this.search(req),
      (req: ChatRequest) => this.chat(req),
      { includeWebSearch: true },
      (req) => this.webSearch(req.query, req.maxResults),
    );
  }

  // ---- Bucket resolution ----

  /** Bucket list cache — avoids redundant API calls within a single client instance. */
  private _bucketCache: Array<{ id: string; name: string }> | null = null;
  private _bucketCacheTs = 0;

  /**
   * Resolve a bucket name-or-ID to an actual bucket ID.
   * - 32-char hex string → treated as UUID, used as-is
   * - Anything else → looked up by name from /v1/buckets
   */
  private async _resolveBucket(nameOrId: string): Promise<string> {
    // UUID pattern: 32 hex chars (with or without dashes)
    const hex = nameOrId.replace(/-/g, "");
    if (/^[0-9a-f]{32}$/i.test(hex)) return hex;

    // Name → lookup
    const now = Date.now();
    if (!this._bucketCache || now - this._bucketCacheTs > 30_000) {
      this._bucketCache =
        await this.get<Array<{ id: string; name: string }>>("/v1/buckets");
      this._bucketCacheTs = now;
    }
    const found = this._bucketCache.find((b) => b.name === nameOrId);
    if (!found) {
      throw new SchiftError(
        `Bucket not found: "${nameOrId}". Create it first or pass a valid bucket ID.`,
      );
    }
    return found.id;
  }

  // ---- Embeddings ----

  /**
   * Embed a single text string via the OpenAI-compatible /v1/embeddings endpoint.
   *
   * Wraps the OpenAI response shape into the SDK's `EmbedResponse` shape so
   * existing callers don't need to change.
   */
  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const raw = await this.post<OpenAIEmbeddingsResponse>("/v1/embeddings", {
      input: request.text,
      model: request.model,
      dimensions: request.dimensions,
      task_type: request.taskType,
    });
    return unwrapSingle(raw);
  }

  /**
   * Embed multiple texts via the OpenAI-compatible /v1/embeddings endpoint.
   *
   * Wraps the OpenAI response shape into the SDK's `EmbedBatchResponse` shape.
   */
  async embedBatch(request: EmbedBatchRequest): Promise<EmbedBatchResponse> {
    const raw = await this.post<OpenAIEmbeddingsResponse>("/v1/embeddings", {
      input: request.texts,
      model: request.model,
      dimensions: request.dimensions,
      task_type: request.taskType,
    });
    return unwrapBatch(raw);
  }

  /** Embed images (base64-encoded). Requires a vision-capable model (e.g. schift-embed-1-small). */
  async embedImages(request: EmbedImageRequest): Promise<EmbedImageResponse> {
    return this.post("/v1/embed/image", {
      images: request.images,
      model: request.model,
      dimensions: request.dimensions,
    });
  }

  // ---- PII redaction ----

  /** Redact Korean PII before sending text to an LLM, vector DB, or fine-tuning job. */
  async redactPii(request: PiiRedactRequest): Promise<PiiRedactResponse> {
    return this.post<PiiRedactResponse>("/v1/pii/redact", {
      text: request.text,
      score_threshold: request.scoreThreshold ?? 0.5,
      scope: request.scope ?? "broad",
      types: request.types,
      token_format: request.tokenFormat ?? "pii_type_index",
      return: request.returnMode ?? "both",
    });
  }

  /** Convenience helper that returns only the masked text. */
  async mask(
    text: string,
    options?: Omit<PiiRedactRequest, "text" | "returnMode">,
  ): Promise<string> {
    const response = await this.redactPii({
      text,
      scoreThreshold: options?.scoreThreshold,
      scope: options?.scope,
      types: options?.types,
      tokenFormat: options?.tokenFormat,
      returnMode: "masked",
    });
    return response.masked ?? text;
  }

  /** Restore text from reversible PII tokens using a caller-held reverse map. */
  async restorePii(request: PiiRestoreRequest): Promise<PiiRestoreResponse> {
    return this.post<PiiRestoreResponse>("/v1/pii/restore", {
      text: request.text,
      reverse_map: request.reverseMap,
    });
  }

  // ---- Search ----

  async search(request: SearchRequest): Promise<SearchResult[]> {
    const bucket = request.bucket ?? request.collection;
    if (!bucket) {
      throw new Error("search requires `bucket`");
    }
    const body: Record<string, unknown> = {
      query: request.query,
      top_k: request.topK,
    };
    if (request.queryVector) body.query_vector = request.queryVector;
    if (request.model) body.model = request.model;
    if (request.filter) body.filter = request.filter;
    if (request.mode) body.mode = request.mode;
    if (request.rerank !== undefined) body.rerank = request.rerank;
    if (request.rerankTopK) body.rerank_top_k = request.rerankTopK;
    if (request.rerankModel) body.rerank_model = request.rerankModel;
    if (request.task) body.task = request.task;
    if (request.temporal) {
      body.temporal = request.temporal;
      if (request.temporalStart !== undefined) {
        body.temporal_start = request.temporalStart;
      }
      if (request.temporalEnd !== undefined) {
        body.temporal_end = request.temporalEnd;
      }
    }
    const response = await this.post<{
      bucket_id?: string;
      collection?: string;
      results: SearchResult[];
    }>(`/v1/buckets/${bucket}/search`, body);
    return response.results;
  }

  // ---- Aggregation ----

  /**
   * Aggregate metadata — group-by-count on vector metadata.
   *
   * @example
   * ```ts
   * const result = await client.aggregate({
   *   collection: "legal-qa",
   *   groupBy: "role",
   * });
   * // result.groups: [{value: "user", count: 150}, {value: "assistant", count: 148}]
   * ```
   */
  async aggregate(request: AggregateRequest): Promise<AggregateResponse> {
    return this.post<AggregateResponse>("/v1/aggregate", {
      collection: request.collection,
      group_by: request.groupBy,
      filter_key: request.filterKey,
      filter_value: request.filterValue,
    });
  }

  // ---- RAG Chat ----

  /**
   * RAG Chat — search bucket + generate answer in one call.
   *
   * @example
   * ```ts
   * const result = await client.chat({
   *   bucket: "my-bucket",        // name or ID — both work
   *   message: "how do I reset my password?",
   * });
   * console.log(result.reply, result.sources);
   * ```
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const raw = request.bucket ?? request.bucketId;
    const bucketId = await this._resolveBucket(raw);
    return this.post<ChatResponse>("/v1/chat", {
      bucket_id: bucketId,
      message: request.message,
      history: request.history,
      model: request.model,
      top_k: request.topK,
      stream: false,
      system_prompt: request.systemPrompt,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });
  }

  /**
   * RAG Chat with SSE streaming.
   * Returns an async iterator of ChatStreamEvent.
   *
   * @example
   * ```ts
   * for await (const event of client.chatStream({
   *   bucket: "my-bucket",        // name or ID
   *   message: "summarize the Q4 report",
   * })) {
   *   if (event.type === "sources") console.log(event.sources);
   *   if (event.type === "chunk") process.stdout.write(event.content ?? "");
   *   if (event.type === "done") console.log("\n--- done ---");
   * }
   * ```
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const raw = request.bucket ?? request.bucketId;
    const resolvedBucketId = await this._resolveBucket(raw);
    const url = `${this.baseUrl}/v1/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      body: JSON.stringify({
        bucket_id: resolvedBucketId,
        message: request.message,
        history: request.history,
        model: request.model,
        top_k: request.topK,
        stream: true,
        system_prompt: request.systemPrompt,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      await this.throwError(res);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new SchiftError("No response body", 500);

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventType: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
          continue;
        }
        if (!line.startsWith("data: ")) {
          currentEventType = null;
          continue;
        }
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (currentEventType === "pipeline_step") {
            parsed.type = "pipeline_step";
          }
          yield parsed as ChatStreamEvent;
        } catch {
          // skip malformed
        }
        currentEventType = null;
      }
    }
  }

  // ---- Web Search ----

  /**
   * Web search powered by Schift Cloud.
   *
   * @example
   * ```ts
   * const results = await client.webSearch("latest AI regulations 2026");
   * results.forEach(r => console.log(r.title, r.url));
   * ```
   */
  async webSearch(
    query: string,
    maxResults?: number,
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const resp = await this.post<{
      results: Array<{ title: string; url: string; snippet: string }>;
    }>("/v1/web-search", { query, max_results: maxResults ?? 5 });
    return resp.results;
  }

  // ---- Model Routing (Projection) ----

  /**
   * @deprecated Not yet available on the server.
   * Use the Python SDK for projection until this endpoint is released.
   */
  async project(_request: ProjectRequest): Promise<ProjectResponse> {
    throw new SchiftError(
      "project() is not yet available. Use the Python SDK for projection.",
      501,
    );
  }

  // ---- DB / Buckets ----

  /**
   * Upload files to a named bucket. Creates the bucket if it does not exist.
   *
   * @example
   * ```ts
   * const result = await client.db.upload("my-docs", {
   *   files: [new File([pdfBytes], "manual.pdf", { type: "application/pdf" })],
   * });
   * console.log(result.bucket_id, result.uploaded);
   * ```
   */
  private async _dbUpload(
    bucket: string,
    options: {
      files: File[] | Blob[];
      metadata?: Record<string, string | number | boolean>;
      collectionId?: string;
    },
  ): Promise<BucketUploadResult> {
    // 1. Get or create bucket
    const buckets =
      await this.get<Array<{ id: string; name: string }>>("/v1/buckets");
    const existing = buckets.find((b) => b.name === bucket);
    let bucketId: string;
    if (existing) {
      bucketId = existing.id;
    } else {
      const created = await this.post<{ id: string }>("/v1/buckets", {
        name: bucket,
      });
      bucketId = created.id;
    }

    const metadataJson =
      options.metadata && Object.keys(options.metadata).length > 0
        ? JSON.stringify(options.metadata)
        : null;

    // 2. Upload each file via multipart/form-data
    const uploaded: unknown[] = [];
    for (const file of options.files) {
      const form = new FormData();
      form.append("files", file);
      if (metadataJson) form.append("metadata", metadataJson);
      if (options.collectionId) {
        form.append("collection_id", options.collectionId);
      }

      const resp = await fetch(
        `${this.baseUrl}/v1/buckets/${bucketId}/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "User-Agent": `schift-ts/${VERSION}`,
            // Do NOT set Content-Type — fetch sets it automatically with boundary
          },
          body: form,
          signal: AbortSignal.timeout(this.timeout),
        },
      );

      if (!resp.ok) {
        await this.throwError(resp);
      }

      uploaded.push(await resp.json());
    }

    return { bucket_id: bucketId, bucket_name: bucket, uploaded };
  }

  // ---- Buckets (legacy collection aliases kept below) ----

  /** @deprecated Use listBuckets() instead. */
  async listCollections(): Promise<any[]> {
    return this.listBuckets();
  }

  /** @deprecated Use bucket APIs instead. */
  async getCollection(collectionId: string): Promise<any> {
    return this.get<any>(`/v1/collections/${collectionId}`);
  }

  /** @deprecated Use bucket APIs instead. */
  async deleteCollection(collectionId: string): Promise<void> {
    await this.del(`/v1/collections/${collectionId}`);
  }

  // ---- Rerank ----
  async rerank(request: {
    query: string;
    documents: Array<{ id?: string; text: string }>;
    topK?: number;
    model?: string;
  }): Promise<any> {
    return this.post("/v1/rerank", {
      query: request.query,
      documents: request.documents,
      top_k: request.topK ?? 5,
      model: request.model,
    });
  }

  // ---- Decision Review (adversarial RAG) ----

  /**
   * Run an adversarial decision review against a Schift engine collection.
   * The pipeline decomposes the scenario into sub-issues, retrieves per
   * sub-issue, classifies each retrieved chunk into supporting / counter /
   * neutral, and verbatim-verifies citations.
   *
   * Substrates have to be ingested ahead of time (see /v1/legal/ingest-corpus
   * Admin API). List available built-in substrates with `listSubstrates()`.
   */
  async decisionReview(
    request: import("./types.js").DecisionReviewRequest,
  ): Promise<import("./types.js").DecisionReviewResponse> {
    const persona = request.persona;
    const body: Record<string, unknown> = {
      scenario: {
        subject: request.scenario.subject,
        perspective: request.scenario.perspective,
        core_question: request.scenario.coreQuestion,
      },
      corpus_id: request.corpusId,
    };
    if (persona) {
      body.persona = {
        role: persona.role,
        ...(persona.language ? { language: persona.language } : {}),
        ...(persona.decompositionHint
          ? { decomposition_hint: persona.decompositionHint }
          : {}),
      };
    }
    if (request.maxSubIssues !== undefined) body.max_sub_issues = request.maxSubIssues;
    if (request.kPerSubIssue !== undefined) body.k_per_sub_issue = request.kPerSubIssue;
    if (request.favorableDisplayCap !== undefined)
      body.favorable_display_cap = request.favorableDisplayCap;
    if (request.counterDisplayCap !== undefined)
      body.counter_display_cap = request.counterDisplayCap;
    if (request.useHybrid !== undefined) body.use_hybrid = request.useHybrid;
    if (request.metadataFilter) body.metadata_filter = request.metadataFilter;
    return this.post("/v1/decision-review", body);
  }

  /**
   * Streaming variant of decisionReview() — yields events as the pipeline
   * runs (decompose → sub_issue × N → verbatim → done). UX win for the
   * 6-10s end-to-end latency.
   */
  async *decisionReviewStream(
    request: import("./types.js").DecisionReviewRequest,
  ): AsyncGenerator<import("./types.js").DecisionReviewStreamEvent> {
    const persona = request.persona;
    const body: Record<string, unknown> = {
      scenario: {
        subject: request.scenario.subject,
        perspective: request.scenario.perspective,
        core_question: request.scenario.coreQuestion,
      },
      corpus_id: request.corpusId,
    };
    if (persona) {
      body.persona = {
        role: persona.role,
        ...(persona.language ? { language: persona.language } : {}),
        ...(persona.decompositionHint
          ? { decomposition_hint: persona.decompositionHint }
          : {}),
      };
    }
    if (request.maxSubIssues !== undefined) body.max_sub_issues = request.maxSubIssues;
    if (request.kPerSubIssue !== undefined) body.k_per_sub_issue = request.kPerSubIssue;
    if (request.favorableDisplayCap !== undefined)
      body.favorable_display_cap = request.favorableDisplayCap;
    if (request.counterDisplayCap !== undefined)
      body.counter_display_cap = request.counterDisplayCap;
    if (request.useHybrid !== undefined) body.use_hybrid = request.useHybrid;
    if (request.metadataFilter) body.metadata_filter = request.metadataFilter;

    const url = `${this.baseUrl}/v1/decision-review/stream`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      throw new Error(`decisionReviewStream HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE frames are separated by blank lines.
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const lines = frame.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            yield { type: event, data: parsed } as import(
              "./types.js"
            ).DecisionReviewStreamEvent;
          } catch {
            // skip malformed frame
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Enumerate built-in substrates available to the caller. */
  async listSubstrates(): Promise<{
    substrates: import("./types.js").DecisionReviewSubstrate[];
  }> {
    return this.get("/v1/decision-review/substrates");
  }

  // ---- Legacy collection aliases ----
  /** @deprecated Use createBucket() when possible. */
  async createCollection(request: {
    name: string;
    dimension: number;
    model?: string;
    backend?: string;
  }): Promise<any> {
    return this.post(
      "/v1/collections",
      request as unknown as Record<string, unknown>,
    );
  }
  /** @deprecated Use bucket stats APIs when possible. */
  async collectionStats(collectionId: string): Promise<any> {
    return this.get(`/v1/collections/${collectionId}/stats`);
  }
  /** @deprecated Use bucket-oriented ingest APIs when possible. */
  async upsertVectors(collection: string, vectors: any[]): Promise<any> {
    return this.post(`/v1/collections/${collection}/vectors`, { vectors });
  }
  /** @deprecated Use bucket-oriented ingest APIs when possible. */
  async deleteVectors(collection: string, ids: string[]): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/v1/collections/${collection}/vectors`,
      {
        method: "DELETE",
        headers: this.headers(),
        body: JSON.stringify({ ids }),
      },
    );
    if (!res.ok) throw new Error(`Schift API error: ${res.status}`);
    return res.json();
  }
  async upsertDocuments(
    collection: string,
    documents: any[],
    model: string,
  ): Promise<any> {
    return this.post(`/v1/collections/${collection}/documents`, {
      documents,
      model,
    });
  }
  async collectionAdd(
    collection: string,
    request: {
      documents: string[];
      ids?: string[];
      metadata?: any[];
      task?: string;
      model?: string;
    },
  ): Promise<any> {
    return this.post(
      `/v1/collections/${collection}/add`,
      request as unknown as Record<string, unknown>,
    );
  }
  async collectionSearch(
    collection: string,
    request: {
      query: string;
      topK?: number;
      filter?: any;
      task?: string;
      model?: string;
      mode?: string;
      rerank?: boolean;
    },
  ): Promise<any> {
    return this.post(`/v1/buckets/${collection}/search`, {
      query: request.query,
      top_k: request.topK ?? 10,
      filter: request.filter,
      task: request.task,
      model: request.model,
      mode: request.mode ?? "vector",
      rerank: request.rerank,
    });
  }

  // ---- Buckets ----
  async listBuckets(): Promise<any[]> {
    return this.get("/v1/buckets");
  }
  async createBucket(request: {
    name: string;
    description?: string;
  }): Promise<any> {
    return this.post(
      "/v1/buckets",
      request as unknown as Record<string, unknown>,
    );
  }
  async deleteBucket(bucketOrName: string): Promise<void> {
    const bucketId = await this._resolveBucket(bucketOrName);
    const res = await fetch(`${this.baseUrl}/v1/buckets/${bucketId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Schift API error: ${res.status}`);
  }
  async bucketSearch(
    bucketOrName: string,
    request: {
      query: string;
      topK?: number;
      mode?: string;
      rerank?: boolean;
      model?: string;
    },
  ): Promise<any> {
    const bucketId = await this._resolveBucket(bucketOrName);
    return this.post(`/v1/buckets/${bucketId}/search`, {
      query: request.query,
      top_k: request.topK ?? 7,
      mode: request.mode ?? "hybrid",
      rerank: request.rerank,
      model: request.model,
    });
  }
  /**
   * Single-call RAG context — Honcho-style token-budget-aware retrieval.
   *
   * Returns a paste-ready context block with [1] [2] citation markers,
   * ready for direct injection into an LLM prompt. Backed by semantic cache
   * (p50 cache hit ≤ 50ms, p50 miss ≤ 500ms).
   *
   * @example
   * ```ts
   * const ctx = await client.bucketContext("my-docs", {
   *   query: "이 환자의 약물 상호작용은?",
   *   tokenBudget: 4000,
   *   mode: "rerank",
   * });
   * // ctx.text — paste into your LLM prompt directly
   * // ctx.chunks — original retrieved chunks with scores
   * // ctx.cacheHit — true when served from semantic cache
   * ```
   */
  async bucketContext(
    bucketOrName: string,
    request: BucketContextRequest,
  ): Promise<BucketContextResponse> {
    const bucketId = await this._resolveBucket(bucketOrName);
    const body: Record<string, unknown> = {
      query: request.query,
      token_budget: request.tokenBudget ?? 2000,
      mode: request.mode ?? "auto",
      include_messages: request.includeMessages ?? 0,
      top_k: request.topK ?? 10,
    };
    if (request.sessionId !== undefined) body.session_id = request.sessionId;
    if (request.filters !== undefined) body.filters = request.filters;

    const raw = await this.post<{
      text: string;
      tokens: number;
      chunks: Array<{ id: string; text: string; score: number; metadata: Record<string, string> }>;
      session_turns: Array<{ role: string; content: string }>;
      truncated_count: number;
      skipped_count: number;
      mode_used: string;
      cache_hit: boolean;
    }>(`/v1/buckets/${bucketId}/context`, body);

    return {
      text: raw.text,
      tokens: raw.tokens,
      chunks: raw.chunks,
      sessionTurns: raw.session_turns,
      truncatedCount: raw.truncated_count,
      skippedCount: raw.skipped_count,
      modeUsed: raw.mode_used,
      cacheHit: raw.cache_hit,
    };
  }

  async bucketGraph(
    bucketOrName: string,
    query?: string,
    topK?: number,
  ): Promise<any> {
    const bucketId = await this._resolveBucket(bucketOrName);
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (topK) params.set("top_k", String(topK));
    const qs = params.toString();
    return this.get(`/v1/buckets/${bucketId}/graph${qs ? `?${qs}` : ""}`);
  }

  async listBucketCollections(bucketOrName: string): Promise<BucketCollection[]> {
    const bucketId = await this._resolveBucket(bucketOrName);
    return this.get<BucketCollection[]>(`/v1/buckets/${bucketId}/collections`);
  }

  // ---- Routing ----
  async getRouting(): Promise<any> {
    return this.get("/v1/routing");
  }
  async setRouting(request: {
    primary?: string;
    fallback?: string;
    mode?: string;
  }): Promise<any> {
    return this.put("/v1/routing", request as Record<string, unknown>);
  }

  // ---- Usage ----
  async usage(): Promise<any> {
    return this.get("/v1/usage/me");
  }
  async usageSummary(): Promise<any> {
    return this.get("/v1/usage/current");
  }

  // ---- Jobs ----
  async getJob(jobId: string): Promise<any> {
    return this.get(`/v1/jobs/${jobId}`);
  }
  async listJobs(options?: {
    orgId?: string;
    bucketId?: string;
    bucket?: string;
    status?: string;
    limit?: number;
  }): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.orgId) params.set("org_id", options.orgId);
    const bucketRef = options?.bucket ?? options?.bucketId;
    if (bucketRef) {
      const resolvedId = await this._resolveBucket(bucketRef);
      params.set("bucket_id", resolvedId);
    }
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.get(`/v1/jobs${qs ? `?${qs}` : ""}`);
  }
  async cancelJob(jobId: string): Promise<any> {
    return this.post(`/v1/jobs/${jobId}/cancel`, {});
  }
  async reprocessJob(jobId: string): Promise<any> {
    return this.post(`/v1/jobs/${jobId}/reprocess`, {});
  }

  // ---- Chat Completions ----
  async chatCompletion(request: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stream?: boolean;
    stop?: string[];
  }): Promise<any> {
    return this.post("/v1/chat/completions", {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      stream: request.stream,
      stop: request.stop,
    });
  }
  async listModels(): Promise<any[]> {
    return this.get("/v1/models");
  }

  // ---- Tasks ----
  async similarity(request: {
    textA: string;
    textB: string;
    model?: string;
  }): Promise<{ score: number }> {
    return this.post("/v1/similarity", {
      text_a: request.textA,
      text_b: request.textB,
      model: request.model,
    });
  }
  async cluster(request: {
    texts: string[];
    nClusters?: number;
    model?: string;
  }): Promise<{ labels: number[]; centroids: number[][]; n_clusters: number }> {
    return this.post("/v1/cluster", {
      texts: request.texts,
      n_clusters: request.nClusters ?? 5,
      model: request.model,
    });
  }
  async classify(request: {
    text: string;
    labels: string[];
    model?: string;
  }): Promise<{ label: string; scores: Record<string, number> }> {
    return this.post("/v1/classify", {
      text: request.text,
      labels: request.labels,
      model: request.model,
    });
  }

  // ---- Artifacts ----
  async createArtifact(request: {
    kind: string;
    uri: string;
    checksum?: string;
    dims?: number;
    contentType?: string;
    label?: string;
  }): Promise<any> {
    return this.post("/v1/artifacts", {
      kind: request.kind,
      uri: request.uri,
      checksum: request.checksum,
      dims: request.dims,
      content_type: request.contentType,
      label: request.label,
    });
  }
  async listArtifacts(kind?: string): Promise<any[]> {
    const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return this.get(`/v1/artifacts${qs}`);
  }
  async getArtifact(artifactId: string): Promise<any> {
    return this.get(`/v1/artifacts/${artifactId}`);
  }

  // ---- Benchmark Suites ----
  async createBenchmarkSuite(request: {
    name: string;
    sourceModel: string;
    targetModel: string;
    sampleRatios?: number[];
    queryCount?: number;
    bucketDocumentCount?: number;
    bucketDocumentIds?: string[];
    queryIds?: string[];
    qrels?: Record<string, string[]>;
    artifactRefs?: Record<string, string>;
  }): Promise<any> {
    return this.post("/v1/benchmark-suites", {
      name: request.name,
      source_model: request.sourceModel,
      target_model: request.targetModel,
      sample_ratios: request.sampleRatios,
      query_count: request.queryCount,
      bucket_document_count: request.bucketDocumentCount,
      bucket_document_ids: request.bucketDocumentIds,
      query_ids: request.queryIds,
      qrels: request.qrels,
      artifact_refs: request.artifactRefs,
    });
  }
  async listBenchmarkSuites(): Promise<any[]> {
    return this.get("/v1/benchmark-suites");
  }
  async getBenchmarkSuite(suiteId: string): Promise<any> {
    return this.get(`/v1/benchmark-suites/${suiteId}`);
  }
  async listBenchmarkRuns(suiteId: string): Promise<any[]> {
    return this.get(`/v1/benchmark-suites/${suiteId}/runs`);
  }
  async getBenchmarkRun(runId: string): Promise<any> {
    return this.get(`/v1/benchmark-runs/${runId}`);
  }

  // ---- Drift Monitors ----
  async createDriftMonitor(request: {
    name: string;
    suiteId: string;
    cadence?: string;
    minRecoveryR10?: number;
  }): Promise<any> {
    return this.post("/v1/drift-monitors", {
      name: request.name,
      suite_id: request.suiteId,
      cadence: request.cadence,
      min_recovery_r10: request.minRecoveryR10,
    });
  }
  async listDriftMonitors(): Promise<any[]> {
    return this.get("/v1/drift-monitors");
  }
  async getDriftMonitor(monitorId: string): Promise<any> {
    return this.get(`/v1/drift-monitors/${monitorId}`);
  }
  async listDriftRuns(monitorId: string): Promise<any[]> {
    return this.get(`/v1/drift-monitors/${monitorId}/runs`);
  }
  async getDriftRun(driftRunId: string): Promise<any> {
    return this.get(`/v1/drift-runs/${driftRunId}`);
  }
  async dueMonitors(): Promise<any[]> {
    return this.get("/v1/drift-monitor-due");
  }

  // ---- HTTP layer ----

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse(resp);
  }

  private async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse(resp);
  }

  private async patch<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse(resp);
  }

  private async put<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": `schift-ts/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    return this.handleResponse(resp);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": `schift-ts/${VERSION}`,
    };
  }

  private async del(path: string): Promise<void> {
    await this.request("DELETE", path);
  }

  private async request(method: string, path: string): Promise<Response> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "User-Agent": `schift-ts/${VERSION}`,
      },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!resp.ok) {
      await this.throwError(resp);
    }
    return resp;
  }

  private async handleResponse<T>(resp: Response): Promise<T> {
    if (!resp.ok) {
      await this.throwError(resp);
    }
    const body = (await resp.json()) as T;
    // Phase A token tracker hook: if a TokenTracker is active in this
    // async context, fold the response's `usage` field into it. No-op
    // when no tracker is active.
    _recordResponseInActiveTracker(body);
    return body;
  }

  private async throwError(resp: Response): Promise<never> {
    const text = await resp.text().catch(() => "");
    const detail = (() => {
      try {
        return JSON.parse(text).detail;
      } catch {
        return text;
      }
    })();

    if (resp.status === 401) throw new AuthError(detail);
    if (resp.status === 402) throw new QuotaError(detail);
    if (resp.status === 403) throw new EntitlementError(detail);
    throw new SchiftError(`API error ${resp.status}: ${detail}`, resp.status);
  }
}
