import { useState, useEffect } from "react";
import { useWorkflowUI } from "../context.js";
import { getBlockTypeDef, CATEGORY_BADGE_COLORS, CATEGORY_ACCENT } from "../types.js";
import type { CanvasBlock } from "../types.js";
import SchemaBuilder from "./SchemaBuilder.js";

// ---- Fields Editor (shorthand for document_parser / field_selector) ----

interface FieldDef {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  items?: FieldDef[];
}

const FIELD_TYPES = ["string", "number", "boolean", "array", "object"];

function FieldsEditor({
  value,
  onChange,
}: {
  value: FieldDef[];
  onChange: (val: FieldDef[]) => void;
}) {
  const addField = () => {
    onChange([...value, { name: "", type: "string" }]);
  };
  const removeField = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };
  const updateField = (idx: number, updates: Partial<FieldDef>) => {
    onChange(value.map((f, i) => (i === idx ? { ...f, ...updates } : f)));
  };
  const addSubItem = (idx: number) => {
    const field = value[idx];
    const items = field.items ?? [];
    updateField(idx, { items: [...items, { name: "", type: "string" }] });
  };
  const updateSubItem = (fieldIdx: number, subIdx: number, updates: Partial<FieldDef>) => {
    const field = value[fieldIdx];
    const items = (field.items ?? []).map((s, i) => (i === subIdx ? { ...s, ...updates } : s));
    updateField(fieldIdx, { items });
  };
  const removeSubItem = (fieldIdx: number, subIdx: number) => {
    const field = value[fieldIdx];
    updateField(fieldIdx, { items: (field.items ?? []).filter((_, i) => i !== subIdx) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-[var(--schift-gray-50)]">Fields</label>
        <button onClick={addField} className="text-[10px] text-[var(--schift-blue)] hover:underline">+ Add</button>
      </div>
      {value.length === 0 && (
        <p className="text-[10px] text-[var(--schift-gray-60)] text-center py-2">No fields. Click + Add to define extraction fields.</p>
      )}
      {value.map((field, idx) => (
        <div key={idx} className="rounded border border-[var(--schift-gray-70)] bg-[var(--schift-gray-90)] p-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <input
              value={field.name}
              onChange={(e) => updateField(idx, { name: e.target.value })}
              placeholder="Field name"
              className="flex-1 min-w-0 bg-transparent text-xs text-[var(--schift-gray-20)] border-none outline-none font-mono"
            />
            <select
              value={field.type}
              onChange={(e) => updateField(idx, { type: e.target.value, items: e.target.value === "array" ? field.items ?? [] : undefined })}
              className="bg-[var(--schift-gray-100)] text-[10px] text-[var(--schift-gray-30)] border border-[var(--schift-gray-70)] rounded px-1 py-0.5"
            >
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => removeField(idx)} className="text-[10px] text-[var(--schift-gray-60)] hover:text-red-400">&times;</button>
          </div>
          {/* Array sub-items */}
          {field.type === "array" && (
            <div className="ml-3 border-l-2 border-[var(--schift-gray-70)] pl-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--schift-gray-60)]">array items:</span>
                <button onClick={() => addSubItem(idx)} className="text-[10px] text-[var(--schift-blue)]">+</button>
              </div>
              {(field.items ?? []).map((sub, sIdx) => (
                <div key={sIdx} className="flex items-center gap-1">
                  <input
                    value={sub.name}
                    onChange={(e) => updateSubItem(idx, sIdx, { name: e.target.value })}
                    placeholder="sub_field"
                    className="flex-1 min-w-0 bg-transparent text-[10px] text-[var(--schift-gray-20)] border-none outline-none font-mono"
                  />
                  <select
                    value={sub.type}
                    onChange={(e) => updateSubItem(idx, sIdx, { type: e.target.value })}
                    className="bg-[var(--schift-gray-100)] text-[10px] text-[var(--schift-gray-30)] border border-[var(--schift-gray-70)] rounded px-1 py-0.5"
                  >
                    {["string", "number", "boolean"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => removeSubItem(idx, sIdx)} className="text-[10px] text-[var(--schift-gray-60)] hover:text-red-400">&times;</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {value.length > 0 && (
        <p className="text-[10px] text-[var(--schift-gray-60)]">
          {value.length} field{value.length > 1 ? "s" : ""} defined &rarr; items output as Array&lt;Object&gt;
        </p>
      )}
    </div>
  );
}

interface BlockConfigPanelProps {
  block: CanvasBlock | null;
  onUpdate: (blockId: string, updates: Partial<CanvasBlock>) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
}

function ConfigField({
  name, value, onChange,
}: {
  name: string; value: unknown; onChange: (val: unknown) => void;
}) {
  const { Input } = useWorkflowUI();
  const strVal = value === null || value === undefined ? "" : String(value);

  if (name === "strategy" && typeof value === "string") {
    return (
      <div>
        <label className="text-xs text-[var(--schift-gray-50)] block mb-1 capitalize">{name}</label>
        <select value={strVal} onChange={(e) => onChange(e.target.value)} className="w-full h-8 px-2 text-xs bg-[var(--schift-gray-100)] border border-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] focus:outline-none focus:border-[var(--schift-blue)]">
          {["fixed", "sentence", "paragraph", "semantic", "concat"].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
  }

  if (name === "method" && typeof value === "string") {
    return (
      <div>
        <label className="text-xs text-[var(--schift-gray-50)] block mb-1 capitalize">{name}</label>
        <select value={strVal} onChange={(e) => onChange(e.target.value)} className="w-full h-8 px-2 text-xs bg-[var(--schift-gray-100)] border border-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] focus:outline-none focus:border-[var(--schift-blue)]">
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
  }

  if (name === "language" && typeof value === "string") {
    return (
      <div>
        <label className="text-xs text-[var(--schift-gray-50)] block mb-1 capitalize">{name}</label>
        <select value={strVal} onChange={(e) => onChange(e.target.value)} className="w-full h-8 px-2 text-xs bg-[var(--schift-gray-100)] border border-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] focus:outline-none focus:border-[var(--schift-blue)]">
          {["python", "javascript", "typescript"].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
  }

  if (name === "code" || name === "template") {
    return (
      <div>
        <label className="text-xs text-[var(--schift-gray-50)] block mb-1 capitalize">{name}</label>
        <textarea value={strVal} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full px-2 py-1.5 text-xs font-mono bg-[var(--schift-gray-100)] border border-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] focus:outline-none focus:border-[var(--schift-blue)] resize-none" />
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div>
        <label className="text-xs text-[var(--schift-gray-50)] block mb-1 capitalize">{name.replace(/_/g, " ")}</label>
        <Input type="number" value={strVal} onChange={(e) => onChange(Number(e.target.value))} className="h-8 text-xs" />
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <input type="checkbox" id={`cfg-${name}`} checked={value} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--schift-blue)]" />
        <label htmlFor={`cfg-${name}`} className="text-xs text-[var(--schift-gray-30)] capitalize">{name.replace(/_/g, " ")}</label>
      </div>
    );
  }

  if (name === "output_schema" && typeof value === "object" && value !== null) {
    return <SchemaBuilder value={value as Record<string, unknown>} onChange={(schema) => onChange(schema)} />;
  }

  // fields shorthand editor for document_parser / field_selector
  if (name === "fields" && Array.isArray(value)) {
    return <FieldsEditor value={value as FieldDef[]} onChange={onChange} />;
  }

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return (
      <div>
        <label className="text-xs text-[var(--schift-gray-50)] block mb-1 capitalize">{name.replace(/_/g, " ")} (advanced)</label>
        <textarea value={JSON.stringify(value, null, 2)} onChange={(e) => { try { onChange(JSON.parse(e.target.value)); } catch { /* invalid */ } }} rows={3} className="w-full px-2 py-1.5 text-xs font-mono bg-[var(--schift-gray-100)] border border-[var(--schift-gray-70)] rounded text-[var(--schift-gray-30)] focus:outline-none focus:border-[var(--schift-blue)] resize-none" />
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-[var(--schift-gray-50)] block mb-1 capitalize">{name.replace(/_/g, " ")}</label>
      <Input type="text" value={strVal} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}

export default function BlockConfigPanel({ block, onUpdate, onDelete, onClose }: BlockConfigPanelProps) {
  const { Button, Input } = useWorkflowUI();
  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (block) { setTitle(block.title); setConfig({ ...block.config }); setConfirmDelete(false); }
  }, [block?.id]);

  if (!block) {
    return (
      <aside className="w-64 flex-shrink-0 h-full bg-[var(--schift-gray-100)] border-l border-[var(--schift-gray-80)] flex items-center justify-center">
        <div className="px-4 text-center">
          <p className="text-sm text-[var(--schift-white)] mb-2">Pick a block to configure it</p>
          <div className="rounded-lg border border-[var(--schift-gray-80)] bg-[var(--schift-gray-90)] px-4 py-3 text-left">
            <p className="text-[10px] font-semibold text-[var(--schift-gray-50)] uppercase tracking-wider mb-2">Quick guide</p>
            <ul className="space-y-1 text-[11px] text-[var(--schift-gray-30)] leading-5">
              <li>Click a block once to open its settings here.</li>
              <li>Use the right-side port on one block, then the left-side port on another to connect them.</li>
              <li>Deleting a block also removes any edges attached to it.</li>
            </ul>
          </div>
        </div>
      </aside>
    );
  }

  const def = getBlockTypeDef(block.type);
  const badgeColor = def ? CATEGORY_BADGE_COLORS[def.category] : "bg-slate-500/20 text-slate-300";
  const accentColor = def ? CATEGORY_ACCENT[def.category] : "border-l-slate-500";

  const handleTitleChange = () => { onUpdate(block.id, { title }); };
  const handleConfigChange = (key: string, val: unknown) => {
    const newConfig = { ...config, [key]: val };
    setConfig(newConfig);
    onUpdate(block.id, { config: newConfig });
  };
  const handleDelete = () => { if (!confirmDelete) { setConfirmDelete(true); return; } onDelete(block.id); };

  return (
    <aside className="w-64 flex-shrink-0 h-full bg-[var(--schift-gray-100)] border-l border-[var(--schift-gray-80)] flex flex-col overflow-hidden">
      <div className={`px-4 py-3 border-b border-[var(--schift-gray-80)] border-l-4 ${accentColor} flex items-center justify-between`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">{def?.icon ?? "?"}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--schift-white)] truncate">{block.title}</p>
            {def && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>{def.category}</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-[var(--schift-gray-50)] hover:text-[var(--schift-white)] flex-shrink-0 ml-2" aria-label="Close panel">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="text-xs text-[var(--schift-gray-50)] block mb-1">Title</label>
          <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleTitleChange} onKeyDown={(e) => e.key === "Enter" && handleTitleChange()} className="h-8 text-xs" />
        </div>
        <div>
          <p className="text-xs text-[var(--schift-gray-50)] mb-1">Position</p>
          <p className="text-xs font-mono text-[var(--schift-gray-60)]">x: {Math.round(block.position.x)}, y: {Math.round(block.position.y)}</p>
        </div>
        <div className="rounded-lg border border-[var(--schift-gray-80)] bg-[var(--schift-gray-90)] px-3 py-3">
          <p className="text-[10px] font-semibold text-[var(--schift-gray-50)] uppercase tracking-wider mb-2">Next step</p>
          <p className="text-[11px] text-[var(--schift-gray-30)] leading-5">Edit this block here, then connect its right-side outputs to another block&apos;s left-side inputs on the canvas.</p>
        </div>
        {Object.keys(config).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--schift-gray-50)] uppercase tracking-wider mb-3">Configuration</p>
            <div className="space-y-3">
              {Object.entries(config).map(([key, val]) => <ConfigField key={key} name={key} value={val} onChange={(v) => handleConfigChange(key, v)} />)}
            </div>
          </div>
        )}
        {def && (def.inputs.length > 0 || def.outputs.length > 0) && (
          <div>
            <p className="text-xs font-semibold text-[var(--schift-gray-50)] uppercase tracking-wider mb-2">Ports</p>
            <p className="text-[10px] text-[var(--schift-gray-60)] mb-2">Inputs accept incoming data on the left. Outputs send data from the right.</p>
            {def.inputs.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-[var(--schift-gray-60)] mb-1">Inputs</p>
                <div className="flex flex-wrap gap-1">{def.inputs.map((p) => <span key={p} className="text-[10px] px-1.5 py-0.5 bg-[var(--schift-gray-80)] rounded text-[var(--schift-gray-30)]">{p}</span>)}</div>
              </div>
            )}
            {def.outputs.length > 0 && (
              <div>
                <p className="text-[10px] text-[var(--schift-gray-60)] mb-1">Outputs</p>
                <div className="flex flex-wrap gap-1">{def.outputs.map((p) => <span key={p} className="text-[10px] px-1.5 py-0.5 bg-[var(--schift-gray-80)] rounded text-[var(--schift-gray-30)]">{p}</span>)}</div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-[var(--schift-gray-80)]">
        {confirmDelete && <p className="text-[11px] text-[var(--schift-red)] mb-2 leading-5">Delete this block and every edge connected to it?</p>}
        <Button variant="destructive" size="sm" className="w-full" onClick={handleDelete}>{confirmDelete ? "Confirm delete" : "Delete block"}</Button>
        {confirmDelete && <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setConfirmDelete(false)}>Keep block</Button>}
      </div>
    </aside>
  );
}
