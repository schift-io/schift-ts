import type { WorkflowV2Document } from "../workflow-v2/artifact.js";

type MaybePromise<T> = T | Promise<T>;

export interface WorkflowV2MiddlewareContext {
  blockId: string;
  blockType: string;
  config: Record<string, unknown>;
  inputs: Record<string, unknown>;
  workflow?: WorkflowV2Document;
}

export interface WorkflowV2WebhookEvent extends WorkflowV2MiddlewareContext {
  webhook: string;
  direction: "inbound" | "outbound";
  payload: Record<string, unknown>;
}

export interface WorkflowV2MetadataEntry extends WorkflowV2MiddlewareContext {
  namespace: string;
  key: string;
  value: unknown;
}

export interface WorkflowV2SourceQuery extends WorkflowV2MiddlewareContext {
  source: string;
  query: unknown;
}

export interface WorkflowV2SourceWrite extends WorkflowV2MiddlewareContext {
  source: string;
  table: string;
  record: Record<string, unknown>;
}

export interface WorkflowV2HttpRequest extends WorkflowV2MiddlewareContext {
  url: string;
  method: string;
  headers: Record<string, unknown>;
  body: unknown;
}

export interface WorkflowV2SecretRead extends WorkflowV2MiddlewareContext {
  secret: string;
}

export interface WorkflowV2SubworkflowRun extends WorkflowV2MiddlewareContext {
  workflowRef: string;
  subworkflowInputs: Record<string, unknown>;
}

export interface WorkflowV2HumanApprovalRequest extends WorkflowV2MiddlewareContext {
  prompt: string;
  approvers: string[];
}

export interface WorkflowV2HumanFormRequest extends WorkflowV2MiddlewareContext {
  form: string;
  schema: unknown;
}

export interface WorkflowV2WaitRequest extends WorkflowV2MiddlewareContext {
  resume: string;
  amount?: number;
  unit?: string;
  until?: unknown;
}

export interface WorkflowV2RuntimeMiddleware {
  receiveWebhook?(
    event: WorkflowV2WebhookEvent,
  ): MaybePromise<Record<string, unknown> | void>;
  deliverWebhook?(
    event: WorkflowV2WebhookEvent,
  ): MaybePromise<Record<string, unknown> | void>;
  writeMetadata?(
    entry: WorkflowV2MetadataEntry,
  ): MaybePromise<Record<string, unknown> | void>;
  querySource?(
    query: WorkflowV2SourceQuery,
  ): MaybePromise<Record<string, unknown>[] | Record<string, unknown> | void>;
  writeSource?(
    write: WorkflowV2SourceWrite,
  ): MaybePromise<Record<string, unknown> | void>;
  requestHttp?(
    request: WorkflowV2HttpRequest,
  ): MaybePromise<Record<string, unknown> | void>;
  readSecret?(
    request: WorkflowV2SecretRead,
  ): MaybePromise<unknown>;
  runSubworkflow?(
    request: WorkflowV2SubworkflowRun,
  ): MaybePromise<Record<string, unknown> | void>;
  requestApproval?(
    request: WorkflowV2HumanApprovalRequest,
  ): MaybePromise<boolean | Record<string, unknown> | void>;
  requestForm?(
    request: WorkflowV2HumanFormRequest,
  ): MaybePromise<Record<string, unknown> | void>;
  wait?(
    request: WorkflowV2WaitRequest,
  ): MaybePromise<Record<string, unknown> | void>;
}

export interface WorkflowV2RuntimeBridge {
  __schiftWorkflowV2Runtime: true;
  middleware?: WorkflowV2RuntimeMiddleware;
  workflow?: WorkflowV2Document;
  originalClient?: unknown;
}

export function makeWorkflowV2RuntimeClient(
  originalClient: unknown,
  middleware: WorkflowV2RuntimeMiddleware | undefined,
  workflow: WorkflowV2Document,
): unknown {
  const bridge: WorkflowV2RuntimeBridge = {
    __schiftWorkflowV2Runtime: true,
    middleware,
    workflow,
    originalClient,
  };

  if (originalClient === null || originalClient === undefined) {
    return bridge;
  }

  if (typeof originalClient !== "object" && typeof originalClient !== "function") {
    return bridge;
  }

  return new Proxy(bridge as unknown as Record<PropertyKey, unknown>, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      const source = originalClient as Record<PropertyKey, unknown>;
      const value = source[prop];
      return typeof value === "function" ? value.bind(originalClient) : value;
    },
    has(target, prop) {
      return prop in target || prop in (originalClient as object);
    },
  });
}

export function getWorkflowV2Runtime(value: unknown): WorkflowV2RuntimeBridge {
  if (
    value &&
    typeof value === "object" &&
    (value as WorkflowV2RuntimeBridge).__schiftWorkflowV2Runtime === true
  ) {
    return value as WorkflowV2RuntimeBridge;
  }
  return {
    __schiftWorkflowV2Runtime: true,
    originalClient: value,
  };
}
