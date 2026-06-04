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

function difyToolMetadata(config: Record<string, unknown>) {
  const raw = record(config.raw);
  const toolConfigurations = Object.keys(configRecord(config, "configurations")).length
    ? configRecord(config, "configurations")
    : record(raw.tool_configurations);
  const credentialId = raw.credential_id;
  const metadata = {
    providerType: config.provider_type === undefined ? raw.provider_type : config.provider_type,
    pluginUniqueIdentifier:
      config.capability === undefined ? raw.plugin_unique_identifier : config.capability,
    toolConfigurations,
    credentialId,
  };
  return {
    ...(metadata.providerType === undefined ? {} : { providerType: String(metadata.providerType) }),
    ...(metadata.pluginUniqueIdentifier === undefined
      ? {}
      : { pluginUniqueIdentifier: String(metadata.pluginUniqueIdentifier) }),
    ...(Object.keys(toolConfigurations).length ? { toolConfigurations } : {}),
    ...(credentialId === undefined ? {} : { credentialId: String(credentialId) }),
  };
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

export class WorkflowV2HumanInputNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const actions = Array.isArray(this.config.actions) ? this.config.actions : [];
    const delivery = Array.isArray(this.config.delivery) ? this.config.delivery : [];
    const request = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      formSchema: this.config.form_schema ?? this.config.schema ?? [],
      actions,
      delivery,
      timeout: this.config.timeout,
      resume: this.config.resume ?? { mode: "pause_resume" },
    };
    const response = await runtime.middleware?.requestHumanInput?.(request);
    return {
      ...inputs,
      humanInput: response ?? {
        pending: true,
        submitted: false,
        resume: request.resume,
      },
    };
  }
}

export class WorkflowV2TransformNode extends SDKBaseNode {
  async execute(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      ...inputs,
      transform: {
        operation: this.config.operation,
        result: this.config.default ?? inputs,
      },
    };
  }
}

export class WorkflowV2DocumentExtractNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const request = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      input: configString(this.config, "input"),
      mode: configString(this.config, "mode", "extract_text"),
    };
    const extracted = await runtime.middleware?.extractDocument?.(request);
    return {
      ...inputs,
      document: extracted ?? { staged: true, input: request.input, mode: request.mode },
    };
  }
}

export class WorkflowV2ToolCallNode extends SDKBaseNode {
  async execute(
    inputs: Record<string, unknown>,
    ctx: SDKExecutionContext,
  ): Promise<Record<string, unknown>> {
    const runtime = getWorkflowV2Runtime(ctx.client);
    const request = {
      blockId: this.block.id,
      blockType: this.block.type,
      config: this.config,
      inputs,
      workflow: runtime.workflow,
      tool: configString(this.config, "tool", this.block.id),
      capability: configString(this.config, "capability", this.block.id),
      provider:
        this.config.provider === undefined ? undefined : String(this.config.provider),
      dify: difyToolMetadata(this.config),
      parameters: configRecord(this.config, "parameters"),
    };
    const result =
      request.dify.pluginUniqueIdentifier && runtime.middleware?.executeDifyTool
        ? await runtime.middleware.executeDifyTool(request)
        : await runtime.middleware?.callTool?.(request);
    return {
      ...inputs,
      tool: request.tool,
      toolResult: result ?? { staged: true },
    };
  }
}

export class WorkflowV2IterationNode extends SDKBaseNode {
  async execute(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      ...inputs,
      iteration: {
        itemSelector: this.config.item_selector,
        parallel: Boolean(this.config.parallel),
        maxConcurrency: this.config.max_concurrency,
        errorStrategy: this.config.error_strategy,
      },
    };
  }
}

export class WorkflowV2LoopNode extends SDKBaseNode {
  async execute(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const configuredMax = Number(this.config.max_iterations ?? 0);
    return {
      ...inputs,
      loop: {
        maxIterations: this.config.max_iterations,
        simulatedIterations:
          Number.isFinite(configuredMax) && configuredMax > 0
            ? Math.min(configuredMax, 3)
            : 0,
        breakCondition: this.config.break_condition,
        errorStrategy: this.config.error_strategy,
      },
    };
  }
}

export class WorkflowV2ControlBoundaryNode extends SDKBaseNode {
  async execute(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      ...inputs,
      boundary: {
        kind: this.block.type,
        boundary: this.config.boundary,
        parent: this.config.parent,
      },
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
