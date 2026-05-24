import { SDKBaseNode } from "./base.js";
import type { SDKExecutionContext } from "./base.js";
import { getWorkflowV2Runtime } from "../v2-runtime.js";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configString(
  config: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = config[key];
  return value === undefined || value === null ? fallback : String(value);
}

function webhookPayload(
  inputs: Record<string, unknown>,
  webhook: string,
): Record<string, unknown> {
  const byName = record(inputs.webhooks)[webhook];
  if (byName !== undefined) return record(byName);
  if (inputs.payload !== undefined) return record(inputs.payload);
  return inputs;
}

function configRecord(
  config: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return record(config[key]);
}

export class WorkflowV2WebhookNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const webhook = configString(this.config, "webhook", this.block.id);
    const payload = webhookPayload(inputs, webhook);
    const event = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      webhook,
      direction: "inbound" as const,
      payload,
    };
    const received = await runtime.middleware?.receiveWebhook?.(event);
    const nextPayload = isRecord(received) ? received : payload;
    return {
      webhook,
      payload: nextPayload,
      ...nextPayload,
    };
  }
}

export class WorkflowV2OutboundWebhookNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const webhook = configString(this.config, "webhook", this.block.id);
    const payload = record(this.config.payload);
    const eventPayload = Object.keys(payload).length ? payload : inputs;
    const event = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      webhook,
      direction: "outbound" as const,
      payload: eventPayload,
    };
    const delivery = await runtime.middleware?.deliverWebhook?.(event);
    return {
      webhook,
      payload: eventPayload,
      delivery: delivery ?? { staged: true },
    };
  }
}

export class WorkflowV2SourceQueryNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const source = configString(this.config, "source", this.block.id);
    const query = this.config.query ?? inputs.query ?? {};
    const result = await runtime.middleware?.querySource?.({
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      source,
      query,
    });
    const resultRecord = record(result);
    return Array.isArray(result)
      ? { source, query, rows: result }
      : { source, query, ...resultRecord, rows: resultRecord.rows ?? [] };
  }
}

export class WorkflowV2SourceWriteNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const source = configString(this.config, "source", this.block.id);
    const table = configString(this.config, "table");
    const configuredRecord = record(this.config.record);
    const recordToWrite = Object.keys(configuredRecord).length
      ? configuredRecord
      : record(inputs.record);
    const sourceWrite = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      source,
      table,
      record: Object.keys(recordToWrite).length ? recordToWrite : inputs,
    };
    const stored = await runtime.middleware?.writeSource?.(sourceWrite);
    return {
      source,
      table,
      record: sourceWrite.record,
      stored: stored ?? { staged: true },
    };
  }
}

export class WorkflowV2MetadataStoreNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const namespace = configString(
      this.config,
      "namespace",
      runtime.workflow?.name ?? "workflow",
    );
    const key = configString(this.config, "key", this.block.id);
    const value = this.config.value ?? inputs.metadata ?? inputs;
    const entry = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      namespace,
      key,
      value,
    };
    const stored = await runtime.middleware?.writeMetadata?.(entry);
    return {
      namespace,
      key,
      value,
      stored: stored ?? { staged: true },
    };
  }
}

export class WorkflowV2HttpRequestNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const url = configString(this.config, "url");
    const method = configString(this.config, "method", "GET").toUpperCase();
    const body = this.config.body ?? inputs.body ?? inputs;
    const request = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      url,
      method,
      headers: configRecord(this.config, "headers"),
      body,
    };
    const response = await runtime.middleware?.requestHttp?.(request);
    return {
      request: {
        url,
        method,
        headers: request.headers,
        body,
      },
      response: response ?? { staged: true },
    };
  }
}

export class WorkflowV2SecretReadNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const secret = configString(this.config, "secret", this.block.id);
    const value = await runtime.middleware?.readSecret?.({
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      secret,
    });
    return {
      secret,
      value,
      value_available: value !== undefined,
    };
  }
}

export class WorkflowV2SubworkflowNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const workflowRef = configString(
      this.config,
      "workflow",
      configString(this.config, "template_id", this.block.id),
    );
    const configuredInputs = configRecord(this.config, "inputs");
    const subworkflowInputs = Object.keys(configuredInputs).length
      ? configuredInputs
      : inputs;
    const result = await runtime.middleware?.runSubworkflow?.({
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      workflowRef,
      subworkflowInputs,
    });
    return {
      subworkflow: workflowRef,
      inputs: subworkflowInputs,
      result: result ?? { staged: true },
    };
  }
}

export class WorkflowV2HumanApprovalNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const response = await runtime.middleware?.requestApproval?.({
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      prompt: configString(this.config, "prompt", configString(this.config, "title")),
      approvers: Array.isArray(this.config.approvers)
        ? this.config.approvers.map(String)
        : [],
    });
    if (typeof response === "boolean") {
      return { ...inputs, approved: response };
    }
    return {
      ...inputs,
      ...(response ?? { approved: false, pending: true }),
    };
  }
}

export class WorkflowV2HumanFormNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const response = await runtime.middleware?.requestForm?.({
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      form: configString(this.config, "form", this.block.id),
      schema: this.config.schema ?? this.config.fields ?? {},
    });
    return {
      ...inputs,
      formData: {},
      ...(response ?? { pending: true }),
    };
  }
}

export class WorkflowV2WaitNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const amount =
      this.config.amount === undefined ? undefined : Number(this.config.amount);
    const request = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      resume: configString(this.config, "resume", "timeInterval"),
      ...(Number.isFinite(amount) ? { amount } : {}),
      ...(this.config.unit ? { unit: String(this.config.unit) } : {}),
      ...(this.config.until !== undefined ? { until: this.config.until } : {}),
    };
    const response = await runtime.middleware?.wait?.(request);
    return {
      ...inputs,
      wait: response ?? { staged: true, resume: request.resume },
    };
  }
}
