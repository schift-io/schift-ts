/**
 * OpenAI SDK drop-in demo against Schift.
 *
 * Demonstrates that pointing the official `openai` Node SDK at Schift's
 * `/v1/openai` base URL unlocks vector_stores + files + search end-to-end
 * without any other code changes.
 *
 * Setup:
 *   npm install openai
 *   export SCHIFT_API_KEY=sch_xxx
 *
 * Run:
 *   npx tsx clients/sdk/ts/examples/openai-compat.ts
 *
 * Optional override:
 *   SCHIFT_BASE_URL=http://localhost:8000/v1/openai npx tsx ...
 */

import OpenAI, { toFile } from "openai";

const baseURL =
  process.env.SCHIFT_BASE_URL ?? "https://api.schift.io/v1/openai";
const apiKey = process.env.SCHIFT_API_KEY ?? process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("Set SCHIFT_API_KEY (or OPENAI_API_KEY) first.");
  process.exit(1);
}

// The entire migration: change baseURL.
const client = new OpenAI({ apiKey, baseURL });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function header(label: string) {
  console.log(`\n=== ${label} ===`);
}

async function main() {
  // 1. Files API.
  header("Upload file");
  const file = await client.files.create({
    file: await toFile(
      Buffer.from(
        ("Refund policy: customers may request a full refund within 14 days of purchase. " +
          "Partial refunds (50%) are available between 15 and 30 days. After 30 days, no " +
          "refunds are issued. Contact support@example.com for any questions about this policy. ").repeat(8),
      ),
      "policy.txt",
    ),
    purpose: "assistants",
  });
  console.log(
    `file_id=${file.id}  bytes=${file.bytes}  purpose=${file.purpose}`,
  );

  // 2. Vector store with metadata + expires_after.
  header("Create vector store");
  const vs = await client.vectorStores.create({
    name: `demo-${Math.floor(Date.now() / 1000)}`,
    metadata: { team: "support", env: "demo" },
    expires_after: { anchor: "last_active_at", days: 7 },
  });
  console.log(
    `vector_store=${vs.id}  metadata=${JSON.stringify(vs.metadata)}  expires_after=${JSON.stringify(vs.expires_after)}`,
  );

  // 3. Attach file with attributes.
  header("Attach file → vector store");
  const vsf = await client.vectorStores.files.create(vs.id, {
    file_id: file.id,
    attributes: { category: "refund", priority: 5 },
  });
  console.log(
    `vector_store.file=${vsf.id}  status=${vsf.status}  attributes=${JSON.stringify(vsf.attributes)}`,
  );

  // Wait for indexing (poll).
  header("Wait for indexing");
  for (let i = 0; i < 30; i++) {
    const refreshed = await client.vectorStores.files.retrieve(vs.id, vsf.id);
    console.log(`  status=${refreshed.status}`);
    if (refreshed.status === "completed" || refreshed.status === "failed") break;
    await sleep(1000);
  }

  // 4. Structured attribute filter.
  header("Search with attribute filter");
  const results = await client.vectorStores.search(vs.id, {
    query: "refund policy",
    max_num_results: 5,
    filters: {
      type: "and",
      filters: [
        { type: "eq", key: "category", value: "refund" },
        { type: "gte", key: "priority", value: 1 },
      ],
    },
  });
  for (const hit of results.data) {
    console.log(
      `  ${hit.score.toFixed(3)}  ${hit.filename}  attrs=${JSON.stringify(hit.attributes)}`,
    );
  }

  // 5. Modify metadata.
  header("Modify vector store");
  const modified = await client.vectorStores.update(vs.id, {
    metadata: { team: "support", env: "demo", owner: "jskang" },
  });
  console.log(`updated metadata=${JSON.stringify(modified.metadata)}`);

  // 6. Cleanup.
  header("Cleanup");
  await client.vectorStores.files.delete(vs.id, vsf.id);
  await client.vectorStores.delete(vs.id);
  await client.files.delete(file.id);
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
