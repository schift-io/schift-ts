import { useState, useCallback } from "react";

// ---- Types ----

type FieldType = "string" | "number" | "boolean" | "array" | "object";

interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  description: string;
  required: boolean;
  children: SchemaField[];
}

interface SchemaBuilderProps {
  value: Record<string, unknown> | null;
  onChange: (schema: Record<string, unknown>) => void;
}

// ---- Presets ----

const PRESETS: { label: string; icon: string; fields: SchemaField[] }[] = [
  {
    label: "Document Text",
    icon: "\uD83D\uDCC4",
    fields: [
      { id: "f1", name: "text", type: "string", description: "Extracted text", required: true, children: [] },
      {
        id: "f2", name: "tables", type: "array", description: "Extracted tables", required: false,
        children: [{
          id: "f2a", name: "items", type: "object", description: "", required: false,
          children: [
            { id: "f2a1", name: "headers", type: "array", description: "", required: false, children: [] },
            { id: "f2a2", name: "rows", type: "array", description: "", required: false, children: [] },
          ],
        }],
      },
      {
        id: "f3", name: "metadata", type: "object", description: "", required: false,
        children: [
          { id: "f3a", name: "language", type: "string", description: "", required: false, children: [] },
          { id: "f3b", name: "has_images", type: "boolean", description: "", required: false, children: [] },
        ],
      },
    ],
  },
  {
    label: "Contract Clauses",
    icon: "\uD83D\uDCDC",
    fields: [
      {
        id: "c1", name: "clauses", type: "array", description: "Contract clauses", required: true,
        children: [{
          id: "c1a", name: "items", type: "object", description: "", required: false,
          children: [
            { id: "c1a1", name: "number", type: "string", description: "Clause number", required: true, children: [] },
            { id: "c1a2", name: "title", type: "string", description: "Clause title", required: false, children: [] },
            { id: "c1a3", name: "text", type: "string", description: "Full clause text", required: true, children: [] },
            { id: "c1a4", name: "obligations", type: "array", description: "Obligations", required: false, children: [] },
          ],
        }],
      },
      { id: "c2", name: "parties", type: "array", description: "Contract parties", required: false, children: [] },
      { id: "c3", name: "effective_date", type: "string", description: "", required: false, children: [] },
    ],
  },
  {
    label: "Invoice",
    icon: "\uD83E\uDDFE",
    fields: [
      { id: "i1", name: "invoice_number", type: "string", description: "", required: true, children: [] },
      { id: "i2", name: "date", type: "string", description: "", required: true, children: [] },
      { id: "i3", name: "vendor", type: "string", description: "", required: true, children: [] },
      { id: "i4", name: "total_amount", type: "number", description: "", required: true, children: [] },
      {
        id: "i5", name: "line_items", type: "array", description: "", required: false,
        children: [{
          id: "i5a", name: "items", type: "object", description: "", required: false,
          children: [
            { id: "i5a1", name: "description", type: "string", description: "", required: false, children: [] },
            { id: "i5a2", name: "quantity", type: "number", description: "", required: false, children: [] },
            { id: "i5a3", name: "unit_price", type: "number", description: "", required: false, children: [] },
            { id: "i5a4", name: "amount", type: "number", description: "", required: false, children: [] },
          ],
        }],
      },
    ],
  },
  {
    label: "Resume / CV",
    icon: "\uD83D\uDC64",
    fields: [
      { id: "r1", name: "name", type: "string", description: "", required: true, children: [] },
      { id: "r2", name: "email", type: "string", description: "", required: false, children: [] },
      { id: "r3", name: "summary", type: "string", description: "", required: false, children: [] },
      {
        id: "r4", name: "experience", type: "array", description: "", required: false,
        children: [{
          id: "r4a", name: "items", type: "object", description: "", required: false,
          children: [
            { id: "r4a1", name: "company", type: "string", description: "", required: false, children: [] },
            { id: "r4a2", name: "role", type: "string", description: "", required: false, children: [] },
            { id: "r4a3", name: "period", type: "string", description: "", required: false, children: [] },
            { id: "r4a4", name: "description", type: "string", description: "", required: false, children: [] },
          ],
        }],
      },
      { id: "r5", name: "skills", type: "array", description: "", required: false, children: [] },
    ],
  },
];

// ---- Helpers ----

let _fieldCounter = 100;
function newId() { return `f_${++_fieldCounter}`; }

function fieldsToJsonSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (f.required) required.push(f.name);
    if (f.type === "object") {
      properties[f.name] = fieldsToJsonSchema(f.children);
    } else if (f.type === "array") {
      const itemChild = f.children.find((c) => c.name === "items");
      let items: unknown = { type: "string" };
      if (itemChild && itemChild.type === "object") {
        items = fieldsToJsonSchema(itemChild.children);
      } else if (itemChild) {
        items = { type: itemChild.type };
      }
      properties[f.name] = { type: "array", items };
    } else {
      const prop: Record<string, unknown> = { type: f.type };
      if (f.description) prop.description = f.description;
      properties[f.name] = prop;
    }
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

function jsonSchemaToFields(schema: Record<string, unknown>): SchemaField[] {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const req = (schema.required ?? []) as string[];
  return Object.entries(props).map(([name, prop]) => {
    const type = (prop.type ?? "string") as FieldType;
    const field: SchemaField = {
      id: newId(), name, type,
      description: (prop.description ?? "") as string,
      required: req.includes(name),
      children: [],
    };
    if (type === "object" && prop.properties) {
      field.children = jsonSchemaToFields(prop as Record<string, unknown>);
    } else if (type === "array" && prop.items) {
      const items = prop.items as Record<string, unknown>;
      if (items.type === "object" && items.properties) {
        field.children = [{
          id: newId(), name: "items", type: "object", description: "", required: false,
          children: jsonSchemaToFields(items),
        }];
      }
    }
    return field;
  });
}

function countFields(fields: SchemaField[]): number {
  let count = 0;
  for (const f of fields) { count++; count += countFields(f.children); }
  return count;
}

// ---- Field Row ----

const TYPE_ICONS: Record<FieldType, string> = {
  string: "Aa", number: "#", boolean: "\u2713", array: "[ ]", object: "{ }",
};
const TYPE_COLORS: Record<FieldType, string> = {
  string: "text-green-400", number: "text-blue-400", boolean: "text-yellow-400",
  array: "text-purple-400", object: "text-orange-400",
};

function FieldRow({
  field, depth, onUpdate, onRemove, onAddChild,
}: {
  field: SchemaField; depth: number;
  onUpdate: (id: string, updates: Partial<SchemaField>) => void;
  onRemove: (id: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = field.type === "object" || field.type === "array";
  const actualChildren = field.type === "array"
    ? field.children.find((c) => c.name === "items")?.children ?? []
    : field.children;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 group py-1 hover:bg-[var(--schift-gray-80)]/50 rounded px-1"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="w-4 h-4 flex items-center justify-center text-[10px] text-[var(--schift-gray-50)] hover:text-[var(--schift-white)]">
            {expanded ? "\u25BC" : "\u25B6"}
          </button>
        ) : <span className="w-4" />}
        <button
          onClick={() => {
            const types: FieldType[] = ["string", "number", "boolean", "array", "object"];
            const idx = types.indexOf(field.type);
            onUpdate(field.id, { type: types[(idx + 1) % types.length], children: [] });
          }}
          className={`text-[10px] font-mono w-6 text-center ${TYPE_COLORS[field.type]} hover:opacity-70`}
          title="Change field type"
        >
          {TYPE_ICONS[field.type]}
        </button>
        <input
          value={field.name}
          onChange={(e) => onUpdate(field.id, { name: e.target.value })}
          placeholder="Field name"
          className="flex-1 min-w-0 bg-transparent text-xs text-[var(--schift-gray-20)] border-none outline-none font-mono"
        />
        <button
          onClick={() => onUpdate(field.id, { required: !field.required })}
          className={`text-[10px] px-1 rounded ${field.required ? "text-red-400 bg-red-400/10" : "text-[var(--schift-gray-60)] hover:text-[var(--schift-gray-40)]"}`}
          title={field.required ? "Required field" : "Optional field"}
        >
          {field.required ? "req" : "opt"}
        </button>
        {hasChildren && (
          <button onClick={() => onAddChild(field.id)} className="text-[10px] text-[var(--schift-gray-50)] hover:text-[var(--schift-blue)] opacity-0 group-hover:opacity-100" title="Add child field">+</button>
        )}
        <button onClick={() => onRemove(field.id)} className="text-[10px] text-[var(--schift-gray-60)] hover:text-red-400 opacity-0 group-hover:opacity-100" title="Remove field">&times;</button>
      </div>
      {depth === 0 && (
        <div style={{ paddingLeft: `${depth * 16 + 28}px` }}>
          <input value={field.description} onChange={(e) => onUpdate(field.id, { description: e.target.value })} placeholder="Description users will understand" className="w-full bg-transparent text-[10px] text-[var(--schift-gray-60)] border-none outline-none italic" />
        </div>
      )}
      {hasChildren && expanded && actualChildren.length > 0 && (
        <div>
          {actualChildren.map((child) => (
            <FieldRow key={child.id} field={child} depth={depth + 1} onUpdate={onUpdate} onRemove={onRemove} onAddChild={onAddChild} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main ----

export default function SchemaBuilder({ value, onChange }: SchemaBuilderProps) {
  const [fields, setFields] = useState<SchemaField[]>(() => {
    if (value && typeof value === "object" && "properties" in value) return jsonSchemaToFields(value);
    return [];
  });
  const [showPresets, setShowPresets] = useState(fields.length === 0);
  const [showJson, setShowJson] = useState(false);

  const emitChange = useCallback((newFields: SchemaField[]) => {
    setFields(newFields);
    onChange(fieldsToJsonSchema(newFields));
  }, [onChange]);

  const addField = () => {
    emitChange([...fields, { id: newId(), name: `field_${fields.length + 1}`, type: "string", description: "", required: false, children: [] }]);
  };

  const addChildToField = (parentId: string) => {
    const child: SchemaField = { id: newId(), name: "field", type: "string", description: "", required: false, children: [] };
    function addToTree(items: SchemaField[]): SchemaField[] {
      return items.map((f) => {
        if (f.id === parentId) {
          if (f.type === "array") {
            const itemsChild = f.children.find((c) => c.name === "items");
            if (itemsChild) return { ...f, children: f.children.map((c) => c.name === "items" ? { ...c, children: [...c.children, child] } : c) };
            return { ...f, children: [{ id: newId(), name: "items", type: "object" as FieldType, description: "", required: false, children: [child] }] };
          }
          return { ...f, children: [...f.children, child] };
        }
        return { ...f, children: addToTree(f.children) };
      });
    }
    emitChange(addToTree(fields));
  };

  const updateField = (id: string, updates: Partial<SchemaField>) => {
    function updateTree(items: SchemaField[]): SchemaField[] {
      return items.map((f) => f.id === id ? { ...f, ...updates } : { ...f, children: updateTree(f.children) });
    }
    emitChange(updateTree(fields));
  };

  const removeField = (id: string) => {
    function removeFromTree(items: SchemaField[]): SchemaField[] {
      return items.filter((f) => f.id !== id).map((f) => ({ ...f, children: removeFromTree(f.children) }));
    }
    emitChange(removeFromTree(fields));
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => { emitChange(preset.fields); setShowPresets(false); };
  const schema = fieldsToJsonSchema(fields);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-[var(--schift-gray-50)]">Answer fields</label>
        <div className="flex gap-1">
          <button onClick={() => setShowPresets(!showPresets)} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--schift-gray-80)] text-[var(--schift-gray-40)] hover:text-[var(--schift-white)]">Examples</button>
          <button onClick={() => setShowJson(!showJson)} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--schift-gray-80)] text-[var(--schift-gray-40)] hover:text-[var(--schift-white)]">{showJson ? "Visual" : "Advanced JSON"}</button>
        </div>
      </div>
      {showPresets && (
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => applyPreset(p)} className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] bg-[var(--schift-gray-80)] hover:bg-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] text-left">
              <span>{p.icon}</span><span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
      {showJson ? (
        <textarea
          value={JSON.stringify(schema, null, 2)}
          onChange={(e) => { try { const parsed = JSON.parse(e.target.value); onChange(parsed); setFields(jsonSchemaToFields(parsed)); } catch { /* invalid */ } }}
          rows={8}
          className="w-full px-2 py-1.5 text-[10px] font-mono bg-[var(--schift-gray-100)] border border-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] focus:outline-none focus:border-[var(--schift-blue)] resize-none"
        />
      ) : (
        <div className="bg-[var(--schift-gray-90)] border border-[var(--schift-gray-70)] rounded overflow-hidden">
          {fields.length === 0 ? (
            <p className="text-[10px] text-[var(--schift-gray-60)] text-center py-4">No fields defined. Add a field or pick a preset.</p>
          ) : (
            <div className="py-1">
              {fields.map((f) => <FieldRow key={f.id} field={f} depth={0} onUpdate={updateField} onRemove={removeField} onAddChild={addChildToField} />)}
            </div>
          )}
          <div className="border-t border-[var(--schift-gray-70)] px-2 py-1.5">
            <button onClick={addField} className="text-[10px] text-[var(--schift-blue)] hover:text-[var(--schift-blue-light)]">+ Add field</button>
          </div>
        </div>
      )}
      {fields.length > 0 && <p className="text-[10px] text-[var(--schift-gray-60)]">{countFields(fields)} fields defined</p>}
    </div>
  );
}
