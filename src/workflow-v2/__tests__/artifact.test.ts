import { describe, expect, it } from "vitest";
import { Schift } from "../../client.js";
import { workflow } from "../index.js";

describe("Workflow v2 artifact", () => {
  it("creates a lightweight artifact from the Schift client", async () => {
    const schift = new Schift({ apiKey: "sch_test" });

    const artifact = schift.workflow({
      workflow: {
        schemaVersion: 2,
        runtime: "schift.workflow.v2",
        name: "answer-flow",
        blocks: [
          {
            id: "answer",
            type: "llm_generate",
            config: {
              provider: "vercel-ai-sdk",
              model: "openai/gpt-4o-mini",
              prompt: "Answer from context",
            },
          },
        ],
        edges: [],
      },
    });

    await expect(artifact.toJSON()).resolves.toMatchObject({
      schemaVersion: 2,
      runtime: "schift.workflow.v2",
      name: "answer-flow",
      blocks: [{ id: "answer", type: "llm_generate" }],
    });
  });

  it("validates block and edge references without importing framework SDKs", async () => {
    const artifact = workflow({
      workflow: {
        schemaVersion: 2,
        runtime: "schift.workflow.v2",
        name: "broken",
        blocks: [{ id: "a", type: "start" }],
        edges: [{ source: "a", target: "missing" }],
      },
    });

    await expect(artifact.validate()).resolves.toContain(
      "Edge references missing target block: 'missing'.",
    );
  });

  it("runs the full artifact graph locally without sending YAML to Schift Cloud", async () => {
    const artifact = workflow({
      workflow: {
        schemaVersion: 2,
        runtime: "schift.workflow.v2",
        name: "answer-flow",
        blocks: [
          { id: "start", type: "start" },
          {
            id: "prompt",
            type: "prompt_template",
            config: { template: "Q: {{query}}" },
          },
          { id: "end", type: "end" },
        ],
        edges: [
          { source: "start", target: "prompt" },
          { source: "prompt", target: "end" },
        ],
      },
    });

    const result = await artifact.run({ query: "contract risk" });

    expect(result).toMatchObject({
      status: "completed",
      inputs: { query: "contract risk" },
      outputs: { result: { prompt: "Q: contract risk", system_prompt: "" } },
      blockStates: {
        start: { status: "completed" },
        prompt: { status: "completed" },
        end: { status: "completed" },
      },
    });
  });

  it("streams stable workflow events around a runtime run", async () => {
    const artifact = workflow({
      workflow: {
        schemaVersion: 2,
        runtime: "schift.workflow.v2",
        name: "stream-flow",
        blocks: [{ id: "start", type: "start" }],
        edges: [],
      },
    });

    const events = [];
    for await (const event of artifact.stream({ inputs: { query: "hello" } })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "workflow.started",
      "block.completed",
      "workflow.completed",
    ]);
    expect(events[0]).toMatchObject({
      workflowName: "stream-flow",
      inputs: { query: "hello" },
    });
  });

  it("routes webhook and metadata blocks through caller-owned middleware", async () => {
    const receivedWebhooks: unknown[] = [];
    const storedMetadata: unknown[] = [];
    const deliveredWebhooks: unknown[] = [];
    const artifact = workflow({
      workflow: {
        schemaVersion: 2,
        runtime: "schift.workflow.v2",
        name: "middleware-flow",
        blocks: [
          {
            id: "incoming",
            type: "webhook_source",
            config: { webhook: "teacher-request" },
          },
          {
            id: "store",
            type: "metadata_store",
            config: { namespace: "lab-agent", key: "latest-request" },
          },
          {
            id: "callback",
            type: "outbound_webhook",
            config: { webhook: "workflow-finished" },
          },
        ],
        edges: [
          { source: "incoming", target: "store" },
          { source: "store", target: "callback" },
        ],
      },
    });

    const result = await artifact.run({
      inputs: {
        webhooks: {
          "teacher-request": { caseId: "case_1", grade: "middle" },
        },
      },
      middleware: {
        receiveWebhook: (event) => {
          receivedWebhooks.push(event);
          return event.payload;
        },
        writeMetadata: (entry) => {
          storedMetadata.push(entry);
          return { id: "meta_1" };
        },
        deliverWebhook: (event) => {
          deliveredWebhooks.push(event);
          return { id: "delivery_1" };
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(receivedWebhooks).toHaveLength(1);
    expect(storedMetadata).toHaveLength(1);
    expect(deliveredWebhooks).toHaveLength(1);
    expect(result.blockStates.store.outputs.stored).toEqual({ id: "meta_1" });
    expect(result.outputs.delivery).toEqual({ id: "delivery_1" });
  });

  it("routes HTTP, secret, HITL, wait, and subworkflow blocks through middleware", async () => {
    const calls: string[] = [];
    const artifact = workflow({
      workflow: {
        schemaVersion: 2,
        runtime: "schift.workflow.v2",
        name: "control-flow",
        blocks: [
          { id: "secret", type: "secret_read", config: { secret: "lab-api" } },
          {
            id: "http",
            type: "http_request",
            config: { url: "https://lab.local/hooks", method: "POST" },
          },
          {
            id: "approval",
            type: "human_approval",
            config: { prompt: "Publish set?", approvers: ["teacher"] },
          },
          {
            id: "form",
            type: "human_form",
            config: { form: "review", fields: [{ name: "note" }] },
          },
          { id: "pause", type: "wait", config: { resume: "webhook" } },
          {
            id: "child",
            type: "subworkflow",
            config: { workflow: "rubric-builder" },
          },
        ],
        edges: [
          { source: "secret", target: "http" },
          { source: "http", target: "approval" },
          { source: "approval", target: "form" },
          { source: "form", target: "pause" },
          { source: "pause", target: "child" },
        ],
      },
    });

    const result = await artifact.run({
      inputs: { requestId: "req_1" },
      middleware: {
        readSecret: (event) => {
          calls.push(`secret:${event.secret}`);
          return "token_1";
        },
        requestHttp: (event) => {
          calls.push(`http:${event.method}:${event.url}`);
          return { status: 202, json: { accepted: true } };
        },
        requestApproval: (event) => {
          calls.push(`approval:${event.prompt}`);
          return { approved: true, approvedBy: "teacher_1" };
        },
        requestForm: (event) => {
          calls.push(`form:${event.form}`);
          return { formData: { note: "ok" }, submittedBy: "teacher_1" };
        },
        wait: (event) => {
          calls.push(`wait:${event.resume}`);
          return { resumed: true };
        },
        runSubworkflow: (event) => {
          calls.push(`subworkflow:${event.workflowRef}`);
          return { childRunId: "run_child_1" };
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(calls).toEqual([
      "secret:lab-api",
      "http:POST:https://lab.local/hooks",
      "approval:Publish set?",
      "form:review",
      "wait:webhook",
      "subworkflow:rubric-builder",
    ]);
    expect(result.blockStates.secret.outputs.value).toBe("token_1");
    expect(result.blockStates.approval.outputs.approved).toBe(true);
    expect(result.outputs.result).toEqual({ childRunId: "run_child_1" });
  });

  it("runs Dify-normalized native blocks without Dify-specific runtime branches", async () => {
    const calls: string[] = [];
    const artifact = workflow({
      workflow: {
        schemaVersion: 2,
        runtime: "schift.workflow.v2",
        name: "dify-normalized-flow",
        metadata: { source_framework: "dify" },
        blocks: [
          { id: "start", type: "start" },
          {
            id: "extract",
            type: "document_extract",
            config: { input: "{{#start.files#}}", mode: "extract_text" },
          },
          {
            id: "render",
            type: "transform",
            config: { operation: "template", default: { prompt: "Summarize" } },
          },
          {
            id: "review",
            type: "human_input",
            config: {
              form_schema: [{ output_variable_name: "review_notes" }],
              actions: [{ id: "approve", title: "Approve" }],
              delivery: [{ id: "webapp", type: "webapp", enabled: true }],
              timeout: 2,
              resume: { mode: "pause_resume", payload: "form_submission" },
            },
          },
          {
            id: "search",
            type: "tool_call",
            config: {
              framework: "dify",
              dify_type: "tool",
              tool: "search",
              capability: "google.search",
              provider_type: "builtin",
              configurations: { result_type: "text" },
              raw: { credential_id: "cred_1" },
              parameters: { query: "{{#render.output#}}" },
            },
          },
          {
            id: "each_item",
            type: "iteration",
            config: { item_selector: "{{#search.results#}}", parallel: true },
          },
          {
            id: "retry",
            type: "loop",
            config: { max_iterations: 5, break_condition: { conditions: [] } },
          },
        ],
        edges: [
          { source: "start", target: "extract" },
          { source: "extract", target: "render" },
          { source: "render", target: "review" },
          { source: "review", target: "search" },
          { source: "search", target: "each_item" },
          { source: "each_item", target: "retry" },
        ],
      },
    });

    const result = await artifact.run({
      inputs: { files: ["contract.pdf"] },
      middleware: {
        extractDocument: (event) => {
          calls.push(`document:${event.input}`);
          return { text: "contract text" };
        },
        requestHumanInput: (event) => {
          calls.push(`human:${event.actions.length}:${event.delivery.length}`);
          return { submitted: true, action: "approve" };
        },
        executeDifyTool: (event) => {
          calls.push(
            `dify-tool:${event.dify?.providerType}:${event.dify?.credentialId}:${event.capability}`,
          );
          expect(event.dify).toMatchObject({
            providerType: "builtin",
            pluginUniqueIdentifier: "google.search",
            credentialId: "cred_1",
            toolConfigurations: { result_type: "text" },
          });
          return { results: [{ title: "result" }] };
        },
      },
    });

    expect(result.status).toBe("completed");
    expect(calls).toEqual([
      "document:{{#start.files#}}",
      "human:1:1",
      "dify-tool:builtin:cred_1:google.search",
    ]);
    expect(result.blockStates.extract.outputs.document).toEqual({
      text: "contract text",
    });
    expect(result.blockStates.review.outputs.humanInput).toEqual({
      submitted: true,
      action: "approve",
    });
    expect(result.blockStates.retry.outputs.loop).toMatchObject({
      maxIterations: 5,
      simulatedIterations: 3,
    });
  });
});
