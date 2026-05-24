# @schift-io/sdk

Schift TypeScript SDK for bucket upload, vector search, and workflows.

## Install

```bash
npm install @schift-io/sdk
```

## Quick Start

```typescript
import { Schift } from "@schift-io/sdk";

const client = new Schift({ apiKey: "sch_your_api_key" });

// Create or reuse a bucket, upload a document, then search it.
// All bucket methods accept a name or ID — no need to track UUIDs.
await client.createBucket({ name: "company-docs" });
const file = new File([await readFile("manual.pdf")], "manual.pdf", {
  type: "application/pdf",
});
await client.db.upload("company-docs", { files: [file] });

const jobs = await client.listJobs({ bucket: "company-docs", limit: 5 });
const results = await client.bucketSearch("company-docs", {
  query: "refund policy",
  topK: 5,
});

console.log(jobs[0]?.status ?? "queued");
console.log(results[0]);
```

Use `search({ bucket: ... })` when you want raw bucket retrieval, `POST /v1/chat` for bucket-backed RAG chat with sources, and `POST /v1/chat/completions` for OpenAI-compatible LLM routing without bucket context.

## API Key

Get your API key from the [Schift Dashboard](https://schift.io/app) > API Keys.

You can also use environment variables:

```typescript
const client = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });
```

## Local Auth Readiness

`/v1/auth/me` validates a user JWT, not a `sch_*` API key. For local Docker
smoke tests, use the auth helper to create a disposable user and verify the
same JWT against the running API:

```typescript
import { Schift } from "@schift-io/sdk";

const auth = Schift.auth({ baseUrl: "http://127.0.0.1:8011" });
await auth.health();
const signup = await auth.signup({
  email: `sdk-smoke-${Date.now()}@example.test`,
  password: "SmokePass1234!",
  name: "SDK Smoke",
  orgName: "SDK Smoke Org",
  region: "seoul",
});
const me = await auth.me(signup.token);
console.log(me.user.email, me.orgs[0]?.name);
```

With a local API already running:

```bash
SCHIFT_API_URL=http://127.0.0.1:8011 npm run smoke:auth
```

## Features

### Embeddings

```typescript
// Single text
const resp = await client.embed({
  text: "Search query",
  model: "openai/text-embedding-3-small", // optional
  dimensions: 1024,                       // optional
});
// resp: { embedding: number[], model: string, dimensions: number, usage: { tokens: number } }

// Batch (up to 2048 texts)
const batch = await client.embedBatch({
  texts: ["doc 1", "doc 2", "doc 3"],
  model: "gemini/text-embedding-004",
});
// batch: { embeddings: number[][], model: string, dimensions: number, usage: { tokens, count } }
```

### Search

```typescript
const results = await client.search({
  query: "How does projection work?",
  bucket: "my-docs",
  topK: 10,
});
// results: Array<{ id, score, modality, metadata? }>
```

### Web Search

```typescript
// Schift Cloud web search
const results = await client.webSearch("latest AI regulations 2026", 5);
results.forEach((r) => {
  console.log(r.title, r.url);
});
```

```typescript
// BYOK provider for direct web search
import { WebSearch } from "@schift-io/sdk";

const webSearch = new WebSearch({
  provider: "tavily",
  providerApiKey: process.env.TAVILY_API_KEY!,
  maxResults: 5,
});

const fresh = await webSearch.search("Schift framework launch updates");
```

Tool calling helpers created from `client.tools` include `schift_web_search` by default, so OpenAI/Claude/Vercel AI SDK integrations can call live web search without extra wiring.

### PII Masking

Mask Korean PII before sending text to an LLM, vector store, or workflow step.
Use `types` when you want the masking contract to be visible and selectable.

```typescript
const piiTypes = [
  "resident_id",
  "alien_registration",
  "passport",
  "driver_license",
  "address",
  "phone",
  "bank_account",
];

const result = await client.redactPii({
  text: "주민등록번호 850205-1234567, 연락처 010-1234-5678",
  returnMode: "both",
  types: piiTypes,
});

const masked = await client.mask("계좌 123-45-678901", {
  types: ["bank_account"],
});
```

The default token format returns tokens such as `[PII_PHONE_1]` and a
`reverse_map` so the caller can restore the original values after the workflow
step. Keep that map only in your temporary restore path; Schift does not
persist or gateway-cache it for `pii_type_index` requests. Set
`tokenFormat: "label_index"` only when you need legacy tokens such as `[PHONE_1]`.

Send only `masked` into the LLM, agent, vector store, or workflow step. Never
include `reverse_map` in the AI payload; use it only after the AI result returns
if your app needs to restore values.

```typescript
const restored = await client.restorePii({
  text: "고객 연락처 [PII_PHONE_1]로 안내하세요.",
  reverseMap: result.reverse_map!,
});
```

`restorePii()` is a stateless API call. It requires an API key and does not
persist or cache the map.

### BYOK (Bring Your Own LLM Key)

Register your own OpenAI / Google / Anthropic key so `/v1/chat` and `/v1/chat/completions` call the provider directly instead of consuming Schift Cloud's shared LLM quota. Supported providers: `"openai"`, `"google"`, `"anthropic"`.

```typescript
// Register a key
await client.providers.set("google", {
  api_key: process.env.GOOGLE_API_KEY!,
  // endpoint_url: "https://custom-proxy.example.com",  // optional
});

// Check whether a provider is configured (api_key is never returned)
const status = await client.providers.get("openai");
// { provider: "openai", configured: true | false, endpoint_url: string | null }
```

Rotation: a stored BYOK record **shadows** any server-side env var or secret for that provider. To rotate, call `set()` again with the new key — changing env vars alone has no effect on orgs with a BYOK record.

### Agent SDK Compatibility

Schift sits underneath the agent framework. The integration point is always the same:

1. let the agent call a Schift search tool
2. run retrieval against Schift buckets or buckets
3. return grounded chunks back to the model

That means you can keep your preferred agent SDK and swap only the retrieval layer.

### Workflow v2 SDK Adapters

Run complete Workflow v2 graphs through the local Schift SDK runtime. The YAML
stays a contract in the user's process; it is not sent to Schift Cloud unless
you explicitly save/publish it through the workflow API:

```typescript
import { Schift } from "@schift-io/sdk";

const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });
const wf = schift.workflow({ yaml });

const run = await wf.run({
  query: "계약서 리스크 봐줘",
});

// For local nodes that need Schift APIs, pass the client explicitly:
await wf.run({ inputs: { query: "계약서 리스크 봐줘" }, client: schift });

// Webhook/metadata side effects stay caller-owned through middleware.
await wf.run({
  inputs: { webhooks: { "teacher-request": { caseId: "case_1" } } },
  middleware: {
    receiveWebhook: (event) => event.payload,
    writeMetadata: async (entry) => {
      await localDb.metadata.put(entry.namespace, entry.key, entry.value);
      return { stored: true };
    },
    deliverWebhook: async (event) => {
      await appServer.deliver(event.webhook, event.payload);
      return { delivered: true };
    },
    requestHttp: (request) => appServer.fetch(request),
    readSecret: (request) => localSecrets.get(request.secret),
    requestApproval: (request) => approvals.enqueue(request),
    requestForm: (request) => forms.enqueue(request),
    wait: (request) => scheduler.defer(request),
    runSubworkflow: (request) => workflowRegistry.run(request.workflowRef, request.subworkflowInputs),
  },
});

for await (const event of wf.stream({ query: "계약서 리스크 봐줘" })) {
  if (event.type === "block.completed") console.log(event.blockId);
  if (event.type === "workflow.completed") console.log(event.run.outputs);
}
```

Framework adapters are intentionally narrower. `asVercelAI()` projects one
selected Workflow v2 `llm_generate` block into Vercel AI SDK call options. It
does not execute upstream retrieval, transforms, conditions, or the full graph.
Use the local runtime with `workflow.run()` / `workflow.stream()` for graph
execution. Use `schift.workflows.run(workflowId, inputs)` only for intentionally
hosted, persisted workflows:

```typescript
import { generateText } from "ai";
import { Schift } from "@schift-io/sdk";
import { asVercelAI } from "@schift-io/workflow-vercel-ai";

const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });
const wf = schift.workflow({ yaml });

const result = await generateText(
  await asVercelAI(wf, {
    mode: "generateText",
    entry: "answer",
  }),
);
```

Structured output schemas can live in the Workflow v2 YAML block config as
`response_schema` / `output_schema` / `schema`. Vercel adapters pass that schema
through as `schema` for `generateObject`/`streamObject`, while Google Gen AI
adapters map it to `config.responseMimeType = "application/json"` and
`config.responseSchema`.

```typescript
import { GoogleGenAI } from "@google/genai";
import { Schift } from "@schift-io/sdk";
import { asGoogleGenAI } from "@schift-io/workflow-google-genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });
const wf = schift.workflow({ yaml });

const response = await ai.models.generateContent(
  await asGoogleGenAI(wf, { entry: "answer" }),
);
```

```typescript
import { asLangGraph } from "@schift-io/workflow-langgraph";

const graph = await asLangGraph(wf, {
  state: { messages: [] },
});

const result = await graph.invoke({
  messages: [{ role: "user", content: "계약서 리스크 봐줘" }],
});
```

The adapter packages declare framework SDKs as peer dependencies and do not add
Vercel AI SDK, Google Gen AI, or LangGraph to the core `@schift-io/sdk` bundle.

### Google Gen AI SDK

```typescript
import { GoogleGenAI } from "@google/genai";
import { Schift } from "@schift-io/sdk";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });

const firstTurn = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "What changed in the latest billing policy?",
  config: {
    tools: schift.tools.googleGenAI(),
  },
});

const functionCall = firstTurn.functionCalls?.[0];
if (functionCall) {
  const functionResponsePart = await schift.tools.googleFunctionResponse({
    name: functionCall.name,
    args: functionCall.args ?? {},
  });

  const secondTurn = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      { role: "user", parts: [{ text: "What changed in the latest billing policy?" }] },
      { role: "model", parts: [{ functionCall }] },
      { role: "user", parts: [functionResponsePart] },
    ],
  });

  console.log(secondTurn.text);
}
```

### Vercel AI SDK

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { Schift } from "@schift-io/sdk";

const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });

const result = await generateText({
  model: openai("gpt-4o-mini"),
  prompt: "What changed in the latest billing policy?",
  tools: schift.tools.vercelAI(),
  maxSteps: 5,
});

console.log(result.text);
```

### Mastra

If you are using Mastra, wrap `client.search()` in a Mastra tool and keep the rest of the agent stack unchanged.

```typescript
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { Schift } from "@schift-io/sdk";

const client = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });

const schiftSearchTool = createTool({
  id: "schift-search",
  description: "Retrieve context from a Schift bucket.",
  inputSchema: z.object({
    bucket: z.string(),
    query: z.string(),
    topK: z.number().int().min(1).max(10).default(5),
  }),
  execute: async ({ context }) => ({
    results: await client.search({
      bucket: context.bucket,
      query: context.query,
      topK: context.topK,
      mode: "hybrid",
    }),
  }),
});

const agent = new Agent({
  name: "docs-agent",
  instructions: "Use schift-search before answering document questions.",
  model: openai("gpt-4o-mini"),
  tools: { schiftSearchTool },
});
```

Examples:

- [`examples/google-genai-rag.ts`](./examples/google-genai-rag.ts)
- [`examples/vercel-ai-rag.ts`](./examples/vercel-ai-rag.ts)

### Buckets

```typescript
// List all buckets
const buckets = await client.listBuckets();

// Create a permission-scoped child collection inside a bucket
const supportCollection = await client.createBucketCollection("company-docs", {
  name: "support-only",
  description: "Visible to support agents",
});

await client.db.upload("company-docs", {
  files: [file],
  collectionId: supportCollection.id,
});

await client.grantBucketCollectionAccess("company-docs", supportCollection.id, {
  subjectType: "role",
  subjectId: "support",
});

const collections = await client.listBucketCollections("company-docs");

// Legacy collection aliases remain available for older integrations
const col = await client.getCollection("bucket-id");

await client.deleteCollection("bucket-id");
```

Bucket search is permission-scoped: the server searches only the child collections the caller can access and merges the ranked results.

### Workflows

Build and run RAG pipelines as composable DAGs.

#### One-block RAG (recommended)

`BlockType.RAG` is a single composite block that does retrieve + prompt + LLM
inline. No graph wiring required.

```typescript
import { Schift, BlockType } from "@schift-io/sdk";

const schift = new Schift({ apiKey: process.env.SCHIFT_API_KEY! });

const wf = await schift.workflows.create({ name: "fire-code-qa" });
await schift.workflows.addBlock(wf.id, {
  type: BlockType.RAG,
  config: { collection: "fire-code" }, // bucket name is the only required field
});

const run = await schift.workflows.run(wf.id, {
  query: "소방 설비는 얼마나 자주 점검해야 하나요?",
});
// run.outputs → { answer, sources, text, data, usage, results }
```

Advanced config (all optional, sensible defaults): `top_k`, `mode`, `filter`,
`rerank`, `model`, `temperature`, `max_tokens`, `thinking_budget`,
`system_prompt`, `template`, `response_schema`, `include_sources`.

Runtime overrides (passed via `workflows.run()` inputs): `bucket`, `filter`,
`tags`, `top_k`, `response_schema`.

#### Direct RAG endpoint (skip workflow entirely)

When you don't need a persisted workflow record, hit `/v1/rag/run` directly —
shares the same code path, less overhead, structured output supported.

That shared runtime is intentionally modular inside the server while staying
fused on the serving path: retrieval resolves the bucket and fetches hits,
context-build formats the prompt evidence, generation renders/calls the LLM,
and evidence-format returns sources/results to the caller. Keep custom prompt
templates on workflow RAG config or `/v1/rag/run`; public `/v1/chat` owns its
server-built RAG prompt and rejects client-supplied `system_prompt`.

```typescript
const resp = await fetch("https://api.schift.io/v1/rag/run", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.SCHIFT_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: "소방 점검 주기?",
    bucket: "fire-code",
    response_schema: {
      type: "object",
      properties: { months: { type: "integer" }, cite: { type: "string" } },
    },
  }),
});
const { answer, data, sources } = await resp.json();
```

#### Legacy multi-block pipelines

For custom pipelines (multi-source merge, conditional routing, tool use) you
can still build the graph from primitive blocks (`retriever`, `llm`,
`prompt_template`, etc.).

```typescript
// Create from template or blank
const wf = await client.workflows.create({ name: "My RAG Pipeline" });

// Run with inputs (multiple values supported)
const result = await client.workflows.run(wf.id, {
  query: "maternity leave policy",
  language: "ko",
});
console.log(result.outputs);
```

#### CRUD

```typescript
const wf = await client.workflows.create({ name: "Pipeline" });
const all = await client.workflows.list();
const one = await client.workflows.get(wf.id);
const updated = await client.workflows.update(wf.id, { name: "Renamed" });
await client.workflows.delete(wf.id);
```

#### Blocks & Edges

```typescript
// Add blocks
const retriever = await client.workflows.addBlock(wf.id, {
  type: "retriever",
  title: "Search Docs",
  config: { collection: "my-docs", top_k: 5, rerank: true },
});

const llm = await client.workflows.addBlock(wf.id, {
  type: "llm",
  config: {
    model: "openai/gpt-4o-mini", // or "anthropic/claude-sonnet-4-20250514", "gemini-2.5-flash"
    temperature: 0.7,
  },
});

// Connect blocks
await client.workflows.addEdge(wf.id, {
  source: retriever.id,
  target: llm.id,
});

// Remove
await client.workflows.removeBlock(wf.id, retriever.id);
await client.workflows.removeEdge(wf.id, edgeId);
```

#### WorkflowBuilder (Fluent API)

Build a graph locally, then send to the API in one call:

```typescript
import { WorkflowBuilder } from "@schift-io/sdk";

const request = new WorkflowBuilder("My RAG Pipeline")
  .description("Retrieval-augmented generation")
  .addBlock("start", { type: "start" })
  .addBlock("retriever", {
    type: "retriever",
    config: { collection: "my-docs", top_k: 5 },
  })
  .addBlock("prompt", {
    type: "prompt_template",
    config: { template: "Context:\n{{results}}\n\nQ: {{query}}" },
  })
  .addBlock("llm", {
    type: "llm",
    config: { model: "openai/gpt-4o-mini" },
  })
  .addBlock("end", { type: "end" })
  .connect("start", "retriever")
  .connect("retriever", "prompt")
  .connect("prompt", "llm")
  .connect("llm", "end")
  .build();

const wf = await client.workflows.create(request);
```

#### YAML Import / Export

```typescript
// Export
const yaml = await client.workflows.exportYaml(wf.id);

// Import from YAML string
const imported = await client.workflows.importYaml(yamlString);
```

#### Validation & Meta

```typescript
// Validate graph
const { valid, errors } = await client.workflows.validate(wf.id);

// List available block types
const blockTypes = await client.workflows.getBlockTypes();

// List available templates
const templates = await client.workflows.getTemplates();
```

#### Block Types

| Category | Types |
|----------|-------|
| Control | `start`, `end`, `conditional`, `loop` |
| Retrieval | `retriever`, `reranker` |
| LLM | `llm`, `prompt_template`, `answer` |
| Data | `document_loader`, `chunker`, `embedder`, `text_processor` |
| Web | `web_search` |
| Integration | `api_call`, `webhook`, `code_executor` |
| Storage | `vector_store`, `cache` |

## Configuration

```typescript
const client = new Schift({
  apiKey: "sch_...",                      // required
  baseUrl: "https://api.schift.io",       // default
  timeout: 60_000,                        // default, in milliseconds
});
```

## Error Handling

```typescript
import { Schift, AuthError, QuotaError, SchiftError } from "@schift-io/sdk";

try {
  await client.embed({ text: "test" });
} catch (err) {
  if (err instanceof AuthError) {
    // 401: Invalid or expired API key
  } else if (err instanceof QuotaError) {
    // 402: Insufficient credits
  } else if (err instanceof SchiftError) {
    // Other API errors (403, 422, 429, 500, 502)
    console.error(err.message, err.statusCode);
  }
}
```

## Supported Models

| Model | Provider | Dimensions |
|-------|----------|------------|
| `openai/text-embedding-3-small` | OpenAI | 1536 |
| `openai/text-embedding-3-large` | OpenAI | 3072 |
| `gemini/text-embedding-004` | Google | 768 |
| `voyage/voyage-3-large` | Voyage | 1024 |
| `schift-embed-1-small` | Schift | 1024 |

All models output to a canonical 1024-dimensional space via Schift's projection layer.

## Releases

Published from the `schift-io/schift` monorepo to npm via
`.github/workflows/sdk-publish-ts.yml`. Cut a release with:

```bash
# 1. Bump version
$EDITOR clients/sdk/ts/package.json   # version: "0.X.Y"
git add clients/sdk/ts/package.json && git commit -m "chore(sdk-ts): bump 0.X.Y"
git push origin main

# 2. Create the release (tag pattern: npm-v*)
gh release create npm-v0.X.Y \
  --title "@schift-io/sdk v0.X.Y" \
  --notes "..."
```

The workflow verifies the tag matches `package.json`, runs `tsc`, `npm test`,
`npm run build`, then `npm publish --access public`.

> The public mirror at `schift-io/schift-ts` is sync-only (no workflows
> there). All publish automation lives in the monorepo.

## License

MIT
