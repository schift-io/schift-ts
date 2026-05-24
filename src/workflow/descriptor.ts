/**
 * Schift Node Descriptor schema.
 *
 * Mirrors n8n's `INodeTypeDescription` (https://github.com/n8n-io/n8n/blob/master/packages/workflow/src/interfaces.ts)
 * with naming aligned to Schift conventions. A descriptor is the metadata + UI form
 * schema for one block type, separate from its execution handler.
 *
 * Pattern (n8n parity):
 *   - `codex` = discovery metadata (categories / subcategories / alias / docs links)
 *   - `properties[]` = declarative UI form (no React, just data — UI renders it)
 *   - `inputs` / `outputs` = typed connection ports (see connection-types.ts)
 *   - `builderHint` = hints for LLM-driven workflow generation
 *   - `version[]` + `defaultVersion` = backward compat
 *
 * Each block type has at most ONE descriptor (the latest version). Versioned
 * descriptors live in V1/V2 subdirs by convention, mirroring n8n.
 */

import type { ConnectionType } from "./connection-types.js";

// ---- Property types (UI form schema) ----

/** Allowed property types — mirrors n8n's NodePropertyTypes. */
export type PropertyType =
  | "string"
  | "number"
  | "boolean"
  | "options"          // single-select dropdown
  | "multiOptions"     // multi-select
  | "collection"       // nested object with sub-fields
  | "fixedCollection"  // ordered list of nested objects
  | "json"
  | "dateTime"
  | "color"
  | "filter"           // structured condition builder (n8n's `filter` type)
  | "resourceLocator"  // entity picker (n8n: `resourceLocator`)
  | "credentialsSelect"
  | "notice"           // read-only info banner
  | "hidden";

/** Conditional show/hide rules for a property. Mirrors n8n's INodeProperties.displayOptions. */
export interface DisplayOptions {
  /** Show this property only if these other-property values match. */
  show?: Record<string, unknown[]>;
  /** Hide this property if these other-property values match. */
  hide?: Record<string, unknown[]>;
}

/** Typed validation hints for `string` / `number` / `collection` properties. */
export interface PropertyTypeOptions {
  /** Minimum value (number) or length (string). */
  minValue?: number;
  /** Maximum value (number) or length (string). */
  maxValue?: number;
  /** Render multi-line text input. */
  rows?: number;
  /** Render as code editor with the given language. */
  editor?: "codeNodeEditor" | "jsEditor" | "sqlEditor" | "htmlEditor";
  /** Programming language for code editor. */
  editorLanguage?: "javascript" | "typescript" | "python" | "sql" | "html";
  /** Filter type details (when type is `filter`). */
  filter?: {
    caseSensitive?: boolean | string;
    typeValidation?: "strict" | "loose";
  };
  /** Allow adding multiple values (collection). */
  multipleValues?: boolean;
  /** Allow value expressions like `={{ $json.foo }}`. */
  noDataExpression?: boolean;
  /** Password-style masked input. */
  password?: boolean;
}

/** A single property in a node's UI form. Recursive for collections. */
export interface INodeProperty {
  displayName: string;
  name: string;
  type: PropertyType;
  default: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  /** Static or dynamic options (for `options` / `multiOptions`). */
  options?: Array<
    | { name: string; value: string | number | boolean; description?: string }
    | INodeProperty // for fixedCollection nested fields
  >;
  /** Show/hide rules. */
  displayOptions?: DisplayOptions;
  /** Type-specific config. */
  typeOptions?: PropertyTypeOptions;
  /** Hint shown next to the field. */
  hint?: string;
}

// ---- Codex (discovery metadata) ----

/**
 * Discovery metadata. Top-level categories + nested subcategories + search
 * aliases. Exactly mirrors n8n's `codex` block.
 */
export interface NodeCodex {
  /** Top-level categories. A node can belong to multiple. */
  categories: string[];
  /** Nested subcategories per category. */
  subcategories?: Record<string, string[]>;
  /** Search synonyms (e.g. `If` node ⇒ ["Router","Filter","Condition","Logic"]). */
  alias?: string[];
  /** Docs links / blog posts. */
  resources?: {
    primaryDocumentation?: Array<{ url: string }>;
    credentialDocumentation?: Array<{ url: string }>;
    generic?: Array<{ label: string; icon?: string; url: string }>;
  };
}

// ---- Builder hints (for LLM workflow generation) ----

/**
 * Metadata that helps an LLM assemble valid workflows. Mirrors n8n's
 * `builderHint`. Optional but strongly recommended for first-class nodes.
 */
export interface BuilderHint {
  /** Free-form schema/usage hint. Shown to the LLM verbatim. */
  message?: string;
  /** Other nodes commonly used adjacent to this one. */
  relatedNodes?: Array<{
    nodeType: string;
    relationHint: string;
  }>;
  /** Sidecar input requirements per connection type. */
  inputs?: Partial<Record<ConnectionType, { required: boolean }>>;
}

// ---- Port descriptor ----

/**
 * Port = one input or output socket on a node. Each port has a connection type
 * (which restricts what other ports it can connect to) and an optional name
 * (for nodes with multiple ports of the same type, e.g. `If` has two `Main`
 * outputs named `true` and `false`).
 */
export interface PortDescriptor {
  type: ConnectionType;
  /** Optional display name (n8n: outputNames). E.g. "true" / "false" for If. */
  name?: string;
  /** Whether this port is required (sidecar inputs may be optional). */
  required?: boolean;
  /** Display index (for ordering). */
  index?: number;
}

// ---- Node descriptor (root) ----

/**
 * Group taxonomy from n8n. Determines visual placement in the editor:
 *   - trigger:   workflow entry point (cron, webhook, manual)
 *   - transform: in/out, data flow (most nodes)
 *   - input:     pulls data in from external source
 *   - output:    sends data out to external sink
 *   - schedule:  scheduled trigger (cron-like)
 */
export type NodeGroup = "trigger" | "transform" | "input" | "output" | "schedule";

/**
 * The complete metadata + UI schema for one block type.
 * Equivalent to n8n's `INodeTypeDescription` minus runtime concerns.
 *
 * Execution lives separately in the node handler classes (clients/sdk/ts/src/workflow/nodes/).
 * Descriptors are pure data and can be serialized to JSON for backend / Studio UI.
 */
export interface INodeDescriptor {
  /** Block type ID (matches BlockType enum value). */
  name: string;
  /** Human-readable label. */
  displayName: string;
  /** Icon ID or URL. n8n uses `node:foo` shorthand. */
  icon?: string;
  /** Optional brand color (hex). */
  iconColor?: string;
  /** One-line description. */
  description: string;

  /** Functional grouping (triggers vs transforms etc.). */
  group: NodeGroup[];

  /** Discovery metadata. */
  codex: NodeCodex;

  /** Versioning (for backward-compat handlers). */
  version: number[];
  defaultVersion: number;

  /** Default editor name shown when adding to a graph. */
  defaults?: { name?: string; color?: string };

  /** Typed input ports. */
  inputs: PortDescriptor[];
  /** Typed output ports. */
  outputs: PortDescriptor[];

  /** UI form schema. */
  properties: INodeProperty[];

  /** Credentials this node may require. */
  credentials?: Array<{ name: string; required?: boolean }>;

  /** LLM workflow-generation hints. */
  builderHint?: BuilderHint;

  /** UI hint — wide editor pane for nodes with lots of properties. */
  parameterPane?: "wide";
}

// ---- Helpers ----

/**
 * Quick constructor for Main I/O ports (the common case).
 */
export function mainPort(name?: string, index?: number): PortDescriptor {
  return { type: "main" as ConnectionType, name, index };
}

/**
 * Quick constructor for a sidecar dependency input.
 */
export function sidecarPort(
  type: ConnectionType,
  options: { required?: boolean; name?: string } = {},
): PortDescriptor {
  return { type, required: options.required ?? false, name: options.name };
}
