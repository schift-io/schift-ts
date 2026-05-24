/**
 * Descriptor registry — one INodeDescriptor per block type.
 *
 * This is the equivalent of n8n's per-node `Foo.node.json` + the codex/properties
 * sections of `FooV2.node.ts`, all in one file. Categories/subcategories/alias
 * are aligned to docs/research/n8n-catalog-mapping.md (Section 6).
 *
 * Pattern: `BlockType` enum value → `INodeDescriptor`. Lookup via
 * `getDescriptor(type)`. Listed via `listDescriptors()`. Filtered by category
 * via `descriptorsByCategory(cat)`.
 */

import { ConnectionTypes } from "./connection-types.js";
import type { INodeDescriptor } from "./descriptor.js";
import { mainPort, sidecarPort } from "./descriptor.js";
import { BlockType } from "./types.js";

// ---- Category constants (Schift taxonomy — see docs/research/n8n-catalog-mapping.md §6) ----

export const Category = {
  RAG: "RAG",
  Agent: "Agent",
  Flow: "Flow",
  DataTransformation: "Data Transformation",
  Files: "Files",
  HITL: "HITL",
  Communication: "Communication",
  Productivity: "Productivity",
  DataStorage: "Data & Storage",
  Development: "Development",
  Triggers: "Triggers",
  Utility: "Utility",
  CoreNodes: "Core Nodes",
} as const;

export type CategoryName = (typeof Category)[keyof typeof Category];

// ---- Helper: build a minimal descriptor (most fields default sensibly) ----

interface DescriptorInput extends Omit<INodeDescriptor, "version" | "defaultVersion"> {
  version?: number[];
  defaultVersion?: number;
}

function descriptor(d: DescriptorInput): INodeDescriptor {
  return {
    version: [1],
    defaultVersion: 1,
    ...d,
  };
}

// ---- Registry ----

const REGISTRY: Record<string, INodeDescriptor> = {};

function register(d: INodeDescriptor) {
  REGISTRY[d.name] = d;
}

// =============================================================================
// FLOW / TRIGGERS / CORE
// =============================================================================

register(
  descriptor({
    name: BlockType.START,
    displayName: "Start",
    description: "Workflow entry point. Receives initial inputs.",
    icon: "node:start",
    iconColor: "#10b981",
    group: ["trigger"],
    codex: {
      categories: [Category.CoreNodes, Category.Triggers],
      subcategories: { [Category.CoreNodes]: ["Other Trigger Nodes"] },
      alias: ["entry", "begin", "input", "trigger"],
    },
    inputs: [],
    outputs: [mainPort()],
    properties: [],
  }),
);

register(
  descriptor({
    name: BlockType.END,
    displayName: "End",
    description: "Workflow output. Marks final result.",
    icon: "node:end",
    iconColor: "#ef4444",
    group: ["output"],
    codex: {
      categories: [Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Flow"] },
      alias: ["finish", "done", "exit", "output"],
    },
    inputs: [mainPort()],
    outputs: [],
    properties: [],
  }),
);

register(
  descriptor({
    name: BlockType.MANUAL_TRIGGER,
    displayName: "Manual Trigger",
    description: "User-fired trigger. Used during development and one-off runs.",
    icon: "node:manual",
    iconColor: "#6b7280",
    group: ["trigger"],
    codex: {
      categories: [Category.CoreNodes, Category.Triggers],
      subcategories: { [Category.CoreNodes]: ["Other Trigger Nodes"] },
      alias: ["test", "run", "manual"],
    },
    inputs: [],
    outputs: [mainPort()],
    properties: [],
  }),
);

register(
  descriptor({
    name: BlockType.SCHEDULE_TRIGGER,
    displayName: "Schedule Trigger",
    description: "Run on a cron schedule.",
    icon: "node:schedule",
    iconColor: "#6b7280",
    group: ["schedule", "trigger"],
    codex: {
      categories: [Category.CoreNodes, Category.Triggers],
      subcategories: { [Category.CoreNodes]: ["Other Trigger Nodes"] },
      alias: ["cron", "interval", "timer", "scheduled"],
    },
    inputs: [],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Schedule",
        name: "schedule",
        type: "string",
        default: "0 9 * * *",
        placeholder: "0 9 * * *",
        description: "Cron expression (5-field). Default: every day at 09:00 UTC.",
        required: true,
      },
      {
        displayName: "Timezone",
        name: "timezone",
        type: "string",
        default: "UTC",
        placeholder: "Asia/Seoul",
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.WEBHOOK,
    displayName: "Webhook",
    description: "HTTP webhook trigger. Listens for incoming requests.",
    icon: "node:webhook",
    iconColor: "#10b981",
    group: ["trigger"],
    codex: {
      categories: [Category.CoreNodes, Category.Triggers, Category.Development],
      subcategories: { [Category.CoreNodes]: ["Helpers"] },
      alias: ["http", "callback", "webhook", "trigger", "wh"],
    },
    inputs: [],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "HTTP Method",
        name: "method",
        type: "options",
        default: "POST",
        options: [
          { name: "GET", value: "GET" },
          { name: "POST", value: "POST" },
          { name: "PUT", value: "PUT" },
          { name: "DELETE", value: "DELETE" },
          { name: "PATCH", value: "PATCH" },
        ],
      },
      {
        displayName: "Path",
        name: "path",
        type: "string",
        default: "",
        placeholder: "/my-webhook",
        required: true,
      },
    ],
  }),
);

// ---- Flow control ----

register(
  descriptor({
    name: BlockType.CONDITION,
    displayName: "If",
    description: "Route items to different branches based on a condition.",
    icon: "node:if",
    iconColor: "#10b981",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.Flow],
      subcategories: { [Category.CoreNodes]: ["Flow"] },
      alias: ["router", "filter", "condition", "logic", "boolean", "branch", "if"],
    },
    inputs: [mainPort()],
    outputs: [mainPort("true", 0), mainPort("false", 1)],
    properties: [
      {
        displayName: "Conditions",
        name: "conditions",
        type: "filter",
        default: {},
        typeOptions: { filter: { caseSensitive: true, typeValidation: "strict" } },
        required: true,
      },
    ],
    builderHint: {
      message:
        "Conditions use { combinator: 'and'|'or', conditions: [{leftValue, rightValue, operator: {type, operation}}] }",
    },
  }),
);

register(
  descriptor({
    name: BlockType.SWITCH,
    displayName: "Switch",
    description: "Route items to one of N branches by case.",
    icon: "node:switch",
    iconColor: "#10b981",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.Flow],
      subcategories: { [Category.CoreNodes]: ["Flow"] },
      alias: ["router", "case", "branch", "switch"],
    },
    inputs: [mainPort()],
    outputs: [mainPort("0", 0), mainPort("1", 1), mainPort("2", 2), mainPort("default", 3)],
    properties: [
      {
        displayName: "Mode",
        name: "mode",
        type: "options",
        default: "expression",
        options: [
          { name: "Expression", value: "expression" },
          { name: "Rules", value: "rules" },
        ],
      },
      {
        displayName: "Output (expression mode)",
        name: "output",
        type: "string",
        default: "0",
        description: "Which output to route to (0..N or 'default').",
        displayOptions: { show: { mode: ["expression"] } },
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.FILTER,
    displayName: "Filter",
    description: "Drop items that don't match a condition.",
    icon: "node:filter",
    iconColor: "#10b981",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Flow", "Data Transformation"] },
      alias: ["filter", "drop", "where", "select"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Conditions",
        name: "conditions",
        type: "filter",
        default: {},
        required: true,
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.MERGE,
    displayName: "Merge",
    description: "Combine inputs from multiple branches.",
    icon: "node:merge",
    iconColor: "#10b981",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Flow", "Data Transformation"] },
      alias: ["join", "concatenate", "combine", "merge", "wait"],
    },
    inputs: [mainPort("a", 0), mainPort("b", 1)],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Mode",
        name: "mode",
        type: "options",
        default: "append",
        options: [
          { name: "Append", value: "append", description: "Concatenate items in order" },
          { name: "Combine", value: "combine", description: "Merge by index" },
          { name: "Choose Branch", value: "chooseBranch", description: "Wait for first, drop rest" },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.LOOP,
    displayName: "Loop",
    description: "Iterate over items in batches.",
    icon: "node:loop",
    iconColor: "#10b981",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Flow"] },
      alias: ["loop", "iterate", "for", "foreach", "batch", "splitInBatches"],
    },
    inputs: [mainPort()],
    outputs: [mainPort("loop", 0), mainPort("done", 1)],
    properties: [
      {
        displayName: "Batch Size",
        name: "batchSize",
        type: "number",
        default: 1,
        typeOptions: { minValue: 1 },
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.WAIT,
    displayName: "Wait",
    description: "Pause workflow for a duration or until a webhook fires.",
    icon: "node:wait",
    iconColor: "#6b7280",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.HITL],
      subcategories: { [Category.CoreNodes]: ["Flow"], [Category.HITL]: ["Human in the Loop"] },
      alias: ["pause", "sleep", "delay", "wait", "hitl"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Resume On",
        name: "resume",
        type: "options",
        default: "timeInterval",
        options: [
          { name: "Time Interval", value: "timeInterval" },
          { name: "Specific Time", value: "specificTime" },
          { name: "Webhook", value: "webhook" },
        ],
      },
      {
        displayName: "Wait Amount",
        name: "amount",
        type: "number",
        default: 1,
        displayOptions: { show: { resume: ["timeInterval"] } },
      },
      {
        displayName: "Wait Unit",
        name: "unit",
        type: "options",
        default: "seconds",
        options: [
          { name: "Seconds", value: "seconds" },
          { name: "Minutes", value: "minutes" },
          { name: "Hours", value: "hours" },
          { name: "Days", value: "days" },
        ],
        displayOptions: { show: { resume: ["timeInterval"] } },
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.ROUTER,
    displayName: "Router",
    description: "Static rule-based router (legacy alias of Switch).",
    icon: "node:router",
    iconColor: "#10b981",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.Flow],
      subcategories: { [Category.CoreNodes]: ["Flow"] },
      alias: ["router", "switch", "branch"],
    },
    inputs: [mainPort()],
    outputs: [mainPort("0", 0), mainPort("1", 1)],
    properties: [],
  }),
);

register(
  descriptor({
    name: BlockType.AI_ROUTER,
    displayName: "AI Router",
    description: "LLM-driven branch selector. Picks one of N outputs by intent.",
    icon: "node:ai-router",
    iconColor: "#8b5cf6",
    group: ["transform"],
    codex: {
      categories: [Category.Agent, Category.Flow],
      subcategories: { Agent: ["Tools"] },
      alias: ["intent", "classify", "ai", "router", "llm-router"],
    },
    inputs: [mainPort(), sidecarPort(ConnectionTypes.AgentLanguageModel, { required: true })],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Routes",
        name: "routes",
        type: "fixedCollection",
        default: { values: [] },
        typeOptions: { multipleValues: true },
        options: [
          {
            displayName: "Route",
            name: "values",
            type: "collection",
            default: {},
            options: [
              { displayName: "Name", name: "name", type: "string", default: "" },
              { displayName: "Description", name: "description", type: "string", default: "" },
            ],
          },
        ],
      },
    ],
  }),
);

// =============================================================================
// DATA TRANSFORMATION
// =============================================================================

register(
  descriptor({
    name: BlockType.SET,
    displayName: "Set / Edit Fields",
    description: "Set, modify, or remove fields on each item.",
    icon: "node:set",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["set", "edit", "assign", "modify", "fields"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Mode",
        name: "mode",
        type: "options",
        default: "manual",
        options: [
          { name: "Manual Mapping", value: "manual" },
          { name: "JSON", value: "json" },
        ],
      },
      {
        displayName: "Fields",
        name: "fields",
        type: "fixedCollection",
        default: { values: [] },
        typeOptions: { multipleValues: true },
        displayOptions: { show: { mode: ["manual"] } },
        options: [
          {
            displayName: "Field",
            name: "values",
            type: "collection",
            default: {},
            options: [
              { displayName: "Name", name: "name", type: "string", default: "" },
              {
                displayName: "Type",
                name: "type",
                type: "options",
                default: "string",
                options: [
                  { name: "String", value: "string" },
                  { name: "Number", value: "number" },
                  { name: "Boolean", value: "boolean" },
                  { name: "Object", value: "object" },
                  { name: "Array", value: "array" },
                ],
              },
              { displayName: "Value", name: "value", type: "string", default: "" },
            ],
          },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.AGGREGATE,
    displayName: "Aggregate",
    description: "Combine items into a single output (e.g. concat fields, build list).",
    icon: "node:aggregate",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["aggregate", "group", "combine", "rollup"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Aggregate",
        name: "aggregate",
        type: "options",
        default: "individualFields",
        options: [
          { name: "Individual Fields", value: "individualFields" },
          { name: "All Item Data (into single list)", value: "aggregateAllItemData" },
        ],
      },
      {
        displayName: "Field to Aggregate",
        name: "field",
        type: "string",
        default: "",
        displayOptions: { show: { aggregate: ["individualFields"] } },
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.SORT,
    displayName: "Sort",
    description: "Sort items by one or more fields.",
    icon: "node:sort",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["sort", "order", "arrange"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Sort By",
        name: "sortBy",
        type: "string",
        default: "",
        placeholder: "fieldName",
      },
      {
        displayName: "Order",
        name: "order",
        type: "options",
        default: "ascending",
        options: [
          { name: "Ascending", value: "ascending" },
          { name: "Descending", value: "descending" },
          { name: "Random", value: "random" },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.LIMIT,
    displayName: "Limit",
    description: "Take the first or last N items.",
    icon: "node:limit",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["limit", "take", "head", "tail", "top"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      { displayName: "Max Items", name: "maxItems", type: "number", default: 10, typeOptions: { minValue: 1 } },
      {
        displayName: "Keep",
        name: "keep",
        type: "options",
        default: "firstItems",
        options: [
          { name: "First Items", value: "firstItems" },
          { name: "Last Items", value: "lastItems" },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.SPLIT_OUT,
    displayName: "Split Out",
    description: "Turn a list field into one item per element.",
    icon: "node:split-out",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["splitOut", "explode", "flatten", "unwind"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Field to Split",
        name: "fieldToSplitOut",
        type: "string",
        default: "",
        required: true,
        placeholder: "items",
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.SUMMARIZE,
    displayName: "Summarize",
    description: "Group items and compute aggregates (count/sum/avg/min/max).",
    icon: "node:summarize",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["summarize", "groupBy", "count", "sum", "avg"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Group By",
        name: "groupBy",
        type: "string",
        default: "",
        placeholder: "fieldName",
      },
      {
        displayName: "Aggregate",
        name: "aggregations",
        type: "fixedCollection",
        default: { values: [] },
        typeOptions: { multipleValues: true },
        options: [
          {
            displayName: "Aggregation",
            name: "values",
            type: "collection",
            default: {},
            options: [
              {
                displayName: "Function",
                name: "fn",
                type: "options",
                default: "count",
                options: [
                  { name: "Count", value: "count" },
                  { name: "Sum", value: "sum" },
                  { name: "Average", value: "avg" },
                  { name: "Min", value: "min" },
                  { name: "Max", value: "max" },
                ],
              },
              { displayName: "Field", name: "field", type: "string", default: "" },
            ],
          },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.REMOVE_DUPLICATES,
    displayName: "Remove Duplicates",
    description: "Deduplicate items by all fields or a key.",
    icon: "node:remove-duplicates",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["dedupe", "deduplicate", "unique", "distinct"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Compare",
        name: "compare",
        type: "options",
        default: "allFields",
        options: [
          { name: "All Fields", value: "allFields" },
          { name: "Selected Fields", value: "selectedFields" },
        ],
      },
      {
        displayName: "Fields",
        name: "fields",
        type: "string",
        default: "",
        placeholder: "id,email",
        displayOptions: { show: { compare: ["selectedFields"] } },
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.DATETIME,
    displayName: "Date & Time",
    description: "Format / parse / shift / diff dates and times.",
    icon: "node:datetime",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["date", "time", "datetime", "format", "parse"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        default: "format",
        options: [
          { name: "Format", value: "format" },
          { name: "Add to Date", value: "add" },
          { name: "Subtract from Date", value: "subtract" },
          { name: "Diff between Dates", value: "diff" },
          { name: "Get Now", value: "now" },
        ],
      },
      { displayName: "Value", name: "value", type: "string", default: "" },
      { displayName: "Format", name: "format", type: "string", default: "yyyy-MM-dd HH:mm:ss" },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.VARIABLE,
    displayName: "Variable",
    description: "Read or write a workflow-scoped variable.",
    icon: "node:variable",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["var", "variable", "state", "context"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Mode",
        name: "mode",
        type: "options",
        default: "set",
        options: [
          { name: "Set", value: "set" },
          { name: "Get", value: "get" },
        ],
      },
      { displayName: "Name", name: "name", type: "string", default: "", required: true },
      {
        displayName: "Value",
        name: "value",
        type: "string",
        default: "",
        displayOptions: { show: { mode: ["set"] } },
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.FIELD_SELECTOR,
    displayName: "Field Selector",
    description: "Pick or rename specific fields from each item.",
    icon: "node:field-selector",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.DataTransformation],
      subcategories: { [Category.CoreNodes]: ["Data Transformation"] },
      alias: ["select", "pick", "project", "rename"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Fields",
        name: "fields",
        type: "string",
        default: "",
        placeholder: "id,name,email",
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.PROMPT_TEMPLATE,
    displayName: "Prompt Template",
    description: "Render a prompt with variable interpolation.",
    icon: "node:prompt",
    iconColor: "#8b5cf6",
    group: ["transform"],
    codex: {
      categories: [Category.Agent, Category.DataTransformation],
      subcategories: { Agent: ["Chains"] },
      alias: ["prompt", "template", "format", "interpolate"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Template",
        name: "template",
        type: "string",
        default: "",
        typeOptions: { rows: 4 },
        required: true,
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.ANSWER,
    displayName: "Answer",
    description: "Final answer / output for a workflow run.",
    icon: "node:answer",
    iconColor: "#10b981",
    group: ["output"],
    codex: {
      categories: [Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Flow"] },
      alias: ["answer", "result", "output", "respond"],
    },
    inputs: [mainPort()],
    outputs: [],
    properties: [],
  }),
);

// =============================================================================
// AGENT / LLM
// =============================================================================

register(
  descriptor({
    name: BlockType.AI_AGENT,
    displayName: "AI Agent",
    description:
      "ReAct-loop agent. Pulls a Language Model (required) + optional Memory and Tools via sidecar ports; takes a Main input prompt and emits the final answer.",
    icon: "node:ai-agent",
    iconColor: "#8b5cf6",
    group: ["transform"],
    codex: {
      categories: [Category.Agent],
      subcategories: { Agent: ["Agents", "Root Nodes"] },
      alias: [
        "agent",
        "react",
        "react-loop",
        "tool-use",
        "ai",
        "autonomous",
        "openai-agent",
        "langchain-agent",
      ],
      resources: {
        primaryDocumentation: [
          { url: "https://docs.schift.io/agents/workflow-agent" },
        ],
      },
    },
    inputs: [
      mainPort(),
      sidecarPort(ConnectionTypes.AgentLanguageModel, { required: true }),
      sidecarPort(ConnectionTypes.AgentMemory, { required: false }),
      sidecarPort(ConnectionTypes.AgentTool, { required: false }),
      sidecarPort(ConnectionTypes.AgentOutputParser, { required: false }),
      sidecarPort(ConnectionTypes.AgentGuardrail, { required: false }),
    ],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "System Prompt",
        name: "systemPrompt",
        type: "string",
        default: "You are a helpful assistant.",
        typeOptions: { rows: 4 },
        description:
          "Top-level instruction. Each tool's description is appended automatically when the agent decides which tool to call.",
      },
      {
        displayName: "Max Steps",
        name: "maxSteps",
        type: "number",
        default: 10,
        typeOptions: { minValue: 1, maxValue: 50 },
        description:
          "Hard ceiling on think→tool→observe iterations. The loop stops at the first final answer or when this limit is hit.",
      },
      {
        displayName: "Token Budget",
        name: "tokenBudget",
        type: "number",
        default: 0,
        description: "0 = unlimited. Cumulative input+output tokens before the runtime aborts with TokenBudgetError.",
      },
      {
        displayName: "Stream Events",
        name: "streamEvents",
        type: "boolean",
        default: true,
        description: "Emit per-step events to the workflow run log (think / tool_call / tool_result / final).",
      },
      {
        displayName: "Failure Behaviour",
        name: "onError",
        type: "options",
        default: "fail",
        options: [
          { name: "Fail the run", value: "fail" },
          { name: "Return partial answer", value: "partial" },
          { name: "Return empty answer", value: "empty" },
        ],
      },
    ],
    builderHint: {
      message:
        "Connect a Language Model node to the agent_languageModel sidecar (required). Connect a Memory node for multi-turn / conversation. Connect any number of Tool nodes (HTTP Request, Code, Sub-Workflow, MCP Client, RAG Search/Reranker, Decision Review). Main input carries the user prompt; Main output is the final answer string.",
      relatedNodes: [
        { nodeType: BlockType.LLM, relationHint: "Required upstream — provides the language model the agent calls." },
        {
          nodeType: BlockType.RETRIEVER,
          relationHint:
            "Wrap a Retriever as a tool to give the agent RAG search; it can be invoked mid-loop to fetch context.",
        },
        {
          nodeType: BlockType.DECISION_REVIEW,
          relationHint:
            "Wrap Decision Review as a tool for adversarial second-opinion lookups inside the agent's reasoning.",
        },
        {
          nodeType: BlockType.HTTP_REQUEST,
          relationHint: "Generic escape hatch — expose any external API as a tool.",
        },
      ],
      inputs: {
        agent_languageModel: { required: true },
        agent_memory: { required: false },
        agent_tool: { required: false },
        agent_outputParser: { required: false },
        agent_guardrail: { required: false },
      },
    },
  }),
);

register(
  descriptor({
    name: BlockType.LLM,
    displayName: "Language Model",
    description: "Call an LLM (OpenAI, Anthropic, Google, Ollama, BYOK).",
    icon: "node:llm",
    iconColor: "#8b5cf6",
    group: ["transform"],
    codex: {
      categories: [Category.Agent],
      subcategories: { Agent: ["Language Models", "Root Nodes"] },
      alias: ["llm", "openai", "anthropic", "gemini", "claude", "gpt", "chat"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Provider",
        name: "provider",
        type: "options",
        default: "openai",
        options: [
          { name: "OpenAI", value: "openai" },
          { name: "Anthropic", value: "anthropic" },
          { name: "Google Gemini", value: "google" },
          { name: "Ollama (local)", value: "ollama" },
          { name: "Schift (router)", value: "schift" },
        ],
      },
      { displayName: "Model", name: "model", type: "string", default: "gpt-4o-mini" },
      {
        displayName: "Temperature",
        name: "temperature",
        type: "number",
        default: 0.7,
        typeOptions: { minValue: 0, maxValue: 2 },
      },
      { displayName: "System Prompt", name: "systemPrompt", type: "string", default: "", typeOptions: { rows: 3 } },
    ],
    credentials: [{ name: "llmApi", required: false }],
  }),
);

register(
  descriptor({
    name: BlockType.MODEL_SELECTOR,
    displayName: "Model Selector",
    description: "Pick the cheapest/fastest model that meets quality bar (Schift router).",
    icon: "node:model-selector",
    iconColor: "#8b5cf6",
    group: ["transform"],
    codex: {
      categories: [Category.Agent],
      subcategories: { Agent: ["Language Models"] },
      alias: ["router", "model-router", "cost", "quality"],
    },
    inputs: [mainPort()],
    outputs: [sidecarPort(ConnectionTypes.AgentLanguageModel)],
    properties: [
      {
        displayName: "Optimize For",
        name: "optimizeFor",
        type: "options",
        default: "quality",
        options: [
          { name: "Quality", value: "quality" },
          { name: "Speed", value: "speed" },
          { name: "Cost", value: "cost" },
          { name: "Balanced", value: "balanced" },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.METADATA_EXTRACTOR,
    displayName: "Metadata Extractor",
    description: "Extract structured fields (entities, dates, summary) from text via LLM.",
    icon: "node:extract",
    iconColor: "#8b5cf6",
    group: ["transform"],
    codex: {
      categories: [Category.Agent],
      subcategories: { Agent: ["Chains"] },
      alias: ["extract", "ner", "metadata", "parse", "structured"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Schema",
        name: "schema",
        type: "json",
        default: "{}",
        description: "JSON Schema for the fields to extract.",
      },
    ],
  }),
);

// =============================================================================
// RAG (Schift first-class)
// =============================================================================

register(
  descriptor({
    name: BlockType.VECTOR_STORE,
    displayName: "Vector Store",
    description: "Schift engine vector store (sub-300us search, SQ8 compression).",
    icon: "node:vector-store",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Search"] },
      alias: ["vectorstore", "engine", "schift-engine", "qdrant", "pinecone"],
    },
    inputs: [mainPort()],
    outputs: [sidecarPort(ConnectionTypes.RagCollection)],
    properties: [],
  }),
);

register(
  descriptor({
    name: BlockType.COLLECTION,
    displayName: "Collection",
    description: "RAG collection (independent embedding + chunking config).",
    icon: "node:collection",
    iconColor: "#06b6d4",
    group: ["input"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Search"] },
      alias: ["collection", "bucket", "index", "namespace"],
    },
    inputs: [],
    outputs: [sidecarPort(ConnectionTypes.RagCollection)],
    properties: [
      { displayName: "Bucket Name", name: "bucket", type: "string", default: "", required: true },
      { displayName: "Collection Name", name: "collection", type: "string", default: "default" },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.RETRIEVER,
    displayName: "Retriever",
    description: "Search a collection. Returns top-K chunks.",
    icon: "node:retriever",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Search"] },
      alias: ["search", "retrieve", "knn", "ann", "vector-search", "rag-search"],
    },
    inputs: [mainPort(), sidecarPort(ConnectionTypes.RagCollection, { required: true })],
    outputs: [sidecarPort(ConnectionTypes.RagSearch)],
    properties: [
      { displayName: "Top K", name: "topK", type: "number", default: 10, typeOptions: { minValue: 1, maxValue: 200 } },
      {
        displayName: "Mode",
        name: "mode",
        type: "options",
        default: "hybrid",
        options: [
          { name: "Hybrid (vector + BM25)", value: "hybrid" },
          { name: "Vector Only", value: "vector" },
          { name: "BM25 Only", value: "bm25" },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.RERANKER,
    displayName: "Reranker",
    description: "Re-score search candidates with a cross-encoder.",
    icon: "node:reranker",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Search"] },
      alias: ["rerank", "cross-encoder", "cohere-rerank"],
    },
    inputs: [sidecarPort(ConnectionTypes.RagSearch, { required: true })],
    outputs: [sidecarPort(ConnectionTypes.RagSearch)],
    properties: [
      { displayName: "Quota", name: "quota", type: "number", default: 3, typeOptions: { minValue: 1 } },
      { displayName: "Provider", name: "provider", type: "options", default: "schift", options: [
        { name: "Schift", value: "schift" },
        { name: "Cohere", value: "cohere" },
      ]},
    ],
  }),
);

register(
  descriptor({
    name: BlockType.EMBEDDER,
    displayName: "Embedder",
    description: "Embed text with schift-embed-1-small (Qwen3-VL-Embedding-2B 1024d).",
    icon: "node:embedder",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Search"] },
      alias: ["embed", "vectorize", "embedding", "schift-embed-1-small"],
    },
    inputs: [mainPort()],
    outputs: [sidecarPort(ConnectionTypes.RagEmbedding), mainPort()],
    properties: [
      { displayName: "Model", name: "model", type: "string", default: "schift-embed-1-small" },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.RAG,
    displayName: "RAG (search + answer)",
    description: "End-to-end RAG: search collection → assemble prompt → LLM answer.",
    icon: "node:rag",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Search"] },
      alias: ["rag", "qa", "chat", "search-and-answer"],
    },
    inputs: [
      mainPort(),
      sidecarPort(ConnectionTypes.RagCollection, { required: true }),
      sidecarPort(ConnectionTypes.AgentLanguageModel, { required: false }),
    ],
    outputs: [mainPort()],
    properties: [
      { displayName: "Top K", name: "topK", type: "number", default: 5 },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.DECISION_REVIEW,
    displayName: "Decision Review",
    description:
      "Surface favorable + contradicting evidence + dissenting opinions for a decision question.",
    icon: "node:decision-review",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Decision Review"] },
      alias: ["decision", "review", "case-review", "polarity", "dissent", "contradicting"],
    },
    inputs: [
      mainPort(),
      sidecarPort(ConnectionTypes.RagCollection, { required: true }),
    ],
    outputs: [sidecarPort(ConnectionTypes.RagDecisionReview), mainPort()],
    properties: [
      { displayName: "Top K per Aspect", name: "topK", type: "number", default: 10 },
      {
        displayName: "Aspects",
        name: "aspects",
        type: "string",
        default: "favorable,contradicting,dissenting",
        description: "Comma-separated aspect names to retrieve evidence for.",
      },
    ],
    builderHint: {
      message:
        "Use this for case-review / second-opinion flows. Inputs: a question + a collection. Outputs: structured evidence set with polarity tags.",
    },
  }),
);

register(
  descriptor({
    name: BlockType.DOCUMENT_LOADER,
    displayName: "Document Loader",
    description: "Load documents from a source (URL, file, S3, R2).",
    icon: "node:document-loader",
    iconColor: "#06b6d4",
    group: ["input"],
    codex: {
      categories: [Category.RAG, Category.Files],
      subcategories: { [Category.RAG]: ["Ingest"] },
      alias: ["load", "import", "ingest", "pdf", "docx", "html"],
    },
    inputs: [mainPort()],
    outputs: [sidecarPort(ConnectionTypes.RagDocumentLoader), mainPort()],
    properties: [
      {
        displayName: "Source",
        name: "source",
        type: "options",
        default: "url",
        options: [
          { name: "URL", value: "url" },
          { name: "Binary Input", value: "binary" },
          { name: "S3/R2", value: "s3" },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.DOCUMENT_PARSER,
    displayName: "Document Parser",
    description: "Parse PDF/DOCX/HTML into clean text + structure.",
    icon: "node:document-parser",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG, Category.Files],
      subcategories: { [Category.RAG]: ["Ingest"] },
      alias: ["parse", "pdf", "docx", "html", "ocr"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Format",
        name: "format",
        type: "options",
        default: "auto",
        options: [
          { name: "Auto-detect", value: "auto" },
          { name: "PDF", value: "pdf" },
          { name: "DOCX", value: "docx" },
          { name: "HTML", value: "html" },
          { name: "Markdown", value: "markdown" },
        ],
      },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.CHUNKER,
    displayName: "Chunker",
    description: "Split text into chunks for embedding.",
    icon: "node:chunker",
    iconColor: "#06b6d4",
    group: ["transform"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Ingest"] },
      alias: ["split", "chunk", "tokenize", "segment", "text-splitter"],
    },
    inputs: [mainPort()],
    outputs: [sidecarPort(ConnectionTypes.RagTextSplitter), mainPort()],
    properties: [
      {
        displayName: "Strategy",
        name: "strategy",
        type: "options",
        default: "recursive",
        options: [
          { name: "Recursive Character", value: "recursive" },
          { name: "Character", value: "character" },
          { name: "Token", value: "token" },
          { name: "Semantic", value: "semantic" },
        ],
      },
      { displayName: "Chunk Size", name: "chunkSize", type: "number", default: 512 },
      { displayName: "Chunk Overlap", name: "chunkOverlap", type: "number", default: 50 },
    ],
  }),
);

// =============================================================================
// HITL
// =============================================================================

register(
  descriptor({
    name: BlockType.HUMAN_APPROVAL,
    displayName: "Human Approval",
    description: "Pause workflow until a human approves via Slack / Email / Form.",
    icon: "node:approval",
    iconColor: "#f59e0b",
    group: ["transform"],
    codex: {
      categories: [Category.HITL],
      subcategories: { [Category.HITL]: ["Human in the Loop"] },
      alias: ["approval", "hitl", "human", "review", "sign-off", "wait"],
    },
    inputs: [mainPort()],
    outputs: [mainPort("approved", 0), mainPort("rejected", 1)],
    properties: [
      {
        displayName: "Channel",
        name: "channel",
        type: "options",
        default: "slack",
        options: [
          { name: "Slack", value: "slack" },
          { name: "Email", value: "email" },
          { name: "Web Form", value: "form" },
        ],
      },
      {
        displayName: "Recipient",
        name: "recipient",
        type: "string",
        default: "",
        placeholder: "@user or user@example.com",
      },
      { displayName: "Message", name: "message", type: "string", default: "Approve?", typeOptions: { rows: 3 } },
      { displayName: "Timeout (hours)", name: "timeoutHours", type: "number", default: 24 },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.HUMAN_FORM,
    displayName: "Human Form",
    description: "Pause workflow until a user fills out a form.",
    icon: "node:form",
    iconColor: "#f59e0b",
    group: ["transform"],
    codex: {
      categories: [Category.HITL],
      subcategories: { [Category.HITL]: ["Human in the Loop"] },
      alias: ["form", "input", "questionnaire", "hitl"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      { displayName: "Form Title", name: "title", type: "string", default: "Please complete the form" },
      {
        displayName: "Fields",
        name: "fields",
        type: "fixedCollection",
        default: { values: [] },
        typeOptions: { multipleValues: true },
        options: [
          {
            displayName: "Field",
            name: "values",
            type: "collection",
            default: {},
            options: [
              { displayName: "Label", name: "label", type: "string", default: "" },
              { displayName: "Type", name: "type", type: "options", default: "text",
                options: [
                  { name: "Text", value: "text" },
                  { name: "Number", value: "number" },
                  { name: "Email", value: "email" },
                  { name: "Date", value: "date" },
                  { name: "Dropdown", value: "select" },
                  { name: "Textarea", value: "textarea" },
                ],
              },
              { displayName: "Required", name: "required", type: "boolean", default: false },
            ],
          },
        ],
      },
    ],
  }),
);

// =============================================================================
// DEVELOPMENT (HTTP / Code / Webhook source / etc.)
// =============================================================================

register(
  descriptor({
    name: BlockType.HTTP_REQUEST,
    displayName: "HTTP Request",
    description: "Make an HTTP request (REST / GraphQL / cURL escape hatch).",
    icon: "node:http",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.Development, Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Helpers"] },
      alias: ["http", "rest", "api", "request", "url", "curl", "fetch"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Method",
        name: "method",
        type: "options",
        default: "GET",
        options: [
          { name: "GET", value: "GET" },
          { name: "POST", value: "POST" },
          { name: "PUT", value: "PUT" },
          { name: "PATCH", value: "PATCH" },
          { name: "DELETE", value: "DELETE" },
          { name: "HEAD", value: "HEAD" },
          { name: "OPTIONS", value: "OPTIONS" },
        ],
      },
      { displayName: "URL", name: "url", type: "string", default: "", required: true },
      { displayName: "Headers", name: "headers", type: "json", default: "{}" },
      { displayName: "Query", name: "query", type: "json", default: "{}" },
      {
        displayName: "Body",
        name: "body",
        type: "json",
        default: "{}",
        displayOptions: { hide: { method: ["GET", "HEAD"] } },
      },
      {
        displayName: "Authentication",
        name: "auth",
        type: "options",
        default: "none",
        options: [
          { name: "None", value: "none" },
          { name: "Bearer Token", value: "bearer" },
          { name: "Basic Auth", value: "basic" },
          { name: "API Key", value: "apiKey" },
        ],
      },
      { displayName: "Timeout (seconds)", name: "timeout", type: "number", default: 30 },
    ],
    parameterPane: "wide",
    builderHint: {
      message:
        "Universal HTTP escape hatch. Use when no dedicated connector exists. URL supports `={{ $json.foo }}` expressions.",
    },
  }),
);

register(
  descriptor({
    name: BlockType.CODE,
    displayName: "Code",
    description: "Run JavaScript or Python code.",
    icon: "node:code",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.Development, Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Helpers", "Data Transformation"] },
      alias: ["code", "javascript", "python", "js", "script", "function", "custom"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Language",
        name: "language",
        type: "options",
        default: "javascript",
        options: [
          { name: "JavaScript", value: "javascript" },
          { name: "Python", value: "python" },
        ],
      },
      {
        displayName: "Code",
        name: "code",
        type: "string",
        default: "// Item input is `$input`. Return an object or array.\nreturn $input;",
        typeOptions: { rows: 10, editor: "codeNodeEditor", editorLanguage: "javascript" },
        required: true,
      },
    ],
    parameterPane: "wide",
  }),
);

register(
  descriptor({
    name: BlockType.SOURCE_QUERY,
    displayName: "Source Query",
    description: "Read rows from a registered external Postgres source.",
    icon: "node:database-search",
    iconColor: "#2563eb",
    group: ["transform"],
    codex: {
      categories: [Category.DataStorage, Category.RAG],
      subcategories: { [Category.RAG]: ["Search"] },
      alias: ["source", "postgres", "sql", "query", "read", "database"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      { displayName: "Source ID", name: "source_id", type: "string", default: "", required: true },
      {
        displayName: "Query",
        name: "query",
        type: "string",
        default: "SELECT * FROM table_name LIMIT 100",
        required: true,
        typeOptions: { rows: 6, editor: "codeNodeEditor", editorLanguage: "sql" },
      },
      { displayName: "Limit", name: "limit", type: "number", default: 100 },
    ],
    parameterPane: "wide",
  }),
);

register(
  descriptor({
    name: BlockType.SOURCE_WRITE,
    displayName: "Source Write",
    description: "Write rows to a registered external Postgres source.",
    icon: "node:database-write",
    iconColor: "#7c3aed",
    group: ["output"],
    codex: {
      categories: [Category.DataStorage],
      alias: ["source", "postgres", "sql", "write", "insert", "update", "database"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      { displayName: "Source ID", name: "source_id", type: "string", default: "", required: true },
      {
        displayName: "Operation",
        name: "op_type",
        type: "options",
        default: "insert",
        options: [
          { name: "Insert", value: "insert" },
          { name: "Update", value: "update" },
        ],
      },
      { displayName: "Schema", name: "schema_name", type: "string", default: "public" },
      { displayName: "Table", name: "table_name", type: "string", default: "", required: true },
      {
        displayName: "Primary Key",
        name: "primary_key",
        type: "string",
        default: "",
        description: "Required for update operations.",
      },
    ],
    parameterPane: "wide",
  }),
);

register(
  descriptor({
    name: BlockType.WEBHOOK_SOURCE,
    displayName: "Webhook Source (ingest)",
    description: "Continuously ingest documents from an HTTP webhook source.",
    icon: "node:webhook-source",
    iconColor: "#06b6d4",
    group: ["trigger", "input"],
    codex: {
      categories: [Category.RAG, Category.Triggers],
      subcategories: { [Category.RAG]: ["Ingest"] },
      alias: ["webhook", "ingest", "source", "stream"],
    },
    inputs: [],
    outputs: [mainPort()],
    properties: [
      { displayName: "Path", name: "path", type: "string", default: "", required: true },
      { displayName: "Bucket", name: "bucket", type: "string", default: "" },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.INGEST_BRIDGE,
    displayName: "Ingest Bridge",
    description: "Bridge incoming items into a Schift bucket/collection.",
    icon: "node:ingest",
    iconColor: "#06b6d4",
    group: ["output"],
    codex: {
      categories: [Category.RAG],
      subcategories: { [Category.RAG]: ["Ingest"] },
      alias: ["ingest", "upsert", "import", "bridge"],
    },
    inputs: [mainPort(), sidecarPort(ConnectionTypes.RagCollection, { required: true })],
    outputs: [mainPort()],
    properties: [],
  }),
);

register(
  descriptor({
    name: BlockType.FEED_POLL,
    displayName: "Feed Poll",
    description: "Poll an RSS / Atom / JSON feed on a schedule.",
    icon: "node:feed",
    iconColor: "#0ea5e9",
    group: ["trigger", "input"],
    codex: {
      categories: [Category.Triggers, Category.CoreNodes],
      subcategories: { [Category.CoreNodes]: ["Other Trigger Nodes"] },
      alias: ["rss", "feed", "poll", "atom"],
    },
    inputs: [],
    outputs: [mainPort()],
    properties: [
      { displayName: "Feed URL", name: "url", type: "string", default: "", required: true },
      { displayName: "Interval (minutes)", name: "intervalMin", type: "number", default: 60 },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.NOTIFY,
    displayName: "Notify",
    description: "Send a notification (Slack / Email / SMS).",
    icon: "node:notify",
    iconColor: "#f59e0b",
    group: ["output"],
    codex: {
      categories: [Category.Communication],
      alias: ["notify", "send", "alert", "slack", "email", "sms"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Channel",
        name: "channel",
        type: "options",
        default: "slack",
        options: [
          { name: "Slack", value: "slack" },
          { name: "Email", value: "email" },
          { name: "SMS", value: "sms" },
        ],
      },
      { displayName: "Recipient", name: "recipient", type: "string", default: "" },
      { displayName: "Message", name: "message", type: "string", default: "", typeOptions: { rows: 3 } },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.SUBWORKFLOW,
    displayName: "Subworkflow",
    description: "Invoke another workflow as a subroutine and return its outputs.",
    icon: "node:subworkflow",
    iconColor: "#8b5cf6",
    group: ["transform"],
    codex: {
      categories: [Category.CoreNodes, Category.Flow],
      subcategories: { [Category.CoreNodes]: ["Flow"] },
      alias: ["sub", "subflow", "child", "call", "invoke", "execute workflow"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Workflow ID",
        name: "workflow_id",
        type: "string",
        default: "",
        required: true,
        description: "ID of the workflow to invoke. Must belong to the same org.",
      },
      { displayName: "Timeout (s)", name: "timeout_s", type: "number", default: 0 },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.OUTBOUND_WEBHOOK,
    displayName: "Outbound Webhook",
    description: "POST a configured payload to an external HTTPS URL.",
    icon: "node:outbound-webhook",
    iconColor: "#0ea5e9",
    group: ["output"],
    codex: {
      categories: [Category.Communication],
      alias: ["webhook", "post", "callback", "http", "outbound"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "URL",
        name: "url",
        type: "string",
        default: "",
        required: true,
        placeholder: "https://example.com/hook",
      },
      { displayName: "Headers", name: "headers", type: "json", default: "{}" },
      {
        displayName: "Forward Inputs",
        name: "forward_inputs",
        type: "boolean",
        default: false,
        description:
          "Auto-pack upstream inputs as the JSON body. Off by default to avoid data egress; explicit `body` always wins.",
      },
      { displayName: "Timeout (s)", name: "timeout", type: "number", default: 30 },
      { displayName: "Retry", name: "retry", type: "number", default: 0 },
    ],
  }),
);

register(
  descriptor({
    name: BlockType.WEB_SEARCH,
    displayName: "Web Search",
    description: "Search the web (Brave / SerpAPI / Tavily / Schift router).",
    icon: "node:web-search",
    iconColor: "#0ea5e9",
    group: ["transform"],
    codex: {
      categories: [Category.Agent, Category.Utility],
      subcategories: { Agent: ["Tools"] },
      alias: ["search", "web", "google", "brave", "tavily", "serpapi"],
    },
    inputs: [mainPort()],
    outputs: [mainPort()],
    properties: [
      {
        displayName: "Provider",
        name: "provider",
        type: "options",
        default: "schift",
        options: [
          { name: "Schift (router)", value: "schift" },
          { name: "Brave", value: "brave" },
          { name: "SerpAPI", value: "serpapi" },
          { name: "Tavily", value: "tavily" },
        ],
      },
      { displayName: "Max Results", name: "maxResults", type: "number", default: 5 },
    ],
  }),
);

// ---- Public API ----

/**
 * Look up a descriptor by block type. Returns undefined if not registered.
 */
export function getDescriptor(type: string): INodeDescriptor | undefined {
  return REGISTRY[type];
}

/**
 * List all registered descriptors (used by /meta/block-types endpoint).
 */
export function listDescriptors(): INodeDescriptor[] {
  return Object.values(REGISTRY);
}

/**
 * Filter descriptors by category. Returns nodes whose codex.categories includes
 * the given category name.
 */
export function descriptorsByCategory(category: string): INodeDescriptor[] {
  return listDescriptors().filter((d) => d.codex.categories.includes(category));
}

/**
 * Search descriptors by alias / name / displayName (case-insensitive substring).
 * Useful for the Studio UI's node-add palette.
 */
export function searchDescriptors(query: string): INodeDescriptor[] {
  const q = query.toLowerCase();
  return listDescriptors().filter((d) => {
    if (d.name.toLowerCase().includes(q)) return true;
    if (d.displayName.toLowerCase().includes(q)) return true;
    if (d.codex.alias?.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });
}

/**
 * Group descriptors by top-level category (for the "Add node" sidebar).
 */
export function descriptorsByCategoryGrouped(): Record<string, INodeDescriptor[]> {
  const grouped: Record<string, INodeDescriptor[]> = {};
  for (const d of listDescriptors()) {
    for (const cat of d.codex.categories) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(d);
    }
  }
  return grouped;
}
