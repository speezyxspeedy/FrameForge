import React, { useMemo, useState } from 'react';
import { Download, FolderOpen, Plus, Save, Trash2, Upload } from 'lucide-react';
import type { FieldValuesMap, ProtocolSchema, ProtocolTemplate } from '../../types/protocol';
import { encodePacket } from '../../engine/binaryWriter';
import { exportSchemaJsonFile, formatByteSize } from '../../utilities/formatters';

interface TemplatesViewProps {
  builtInTemplates: ProtocolTemplate[];
  customTemplates: ProtocolTemplate[];
  activeSchema: ProtocolSchema;
  activeFieldValues: FieldValuesMap;
  onLoadTemplate: (template: ProtocolTemplate) => void;
  onSaveCustomTemplate: (name: string, summary: string) => void;
  onDeleteCustomTemplate: (templateId: string) => void;
  onCreateBlankSchema: () => void;
  onOpenImportModal: () => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  builtInTemplates,
  customTemplates,
  activeSchema,
  activeFieldValues,
  onLoadTemplate,
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
  onCreateBlankSchema,
  onOpenImportModal,
}) => {
  const [customName, setCustomName] = useState(activeSchema.name);
  const [customSummary, setCustomSummary] = useState(activeSchema.description);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const allTemplates = useMemo(
    () => [...builtInTemplates, ...customTemplates],
    [builtInTemplates, customTemplates]
  );

  // Encode every template using the real engine so byte counts and hex previews are computed live
  const previews = useMemo(() => {
    const map = new Map<string, { hex: string; bytes: number; ok: boolean }>();
    for (const tpl of allTemplates) {
      const enc = encodePacket(tpl.schema, tpl.sampleValues);
      map.set(tpl.id, {
        hex: enc.hexString,
        bytes: enc.byteLength,
        ok: enc.success,
      });
    }
    return map;
  }, [allTemplates]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customName.trim();
    if (!trimmed) return;
    onSaveCustomTemplate(
      trimmed,
      customSummary.trim() || 'Custom user-defined binary protocol schema.'
    );
    setSaveMessage(`Saved "${trimmed}" to local custom templates.`);
    setTimeout(() => setSaveMessage(null), 2500);
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-5 space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Protocol Templates
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Load real production binary packet templates into the builder, save your own schemas locally, or import/export JSON definitions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCreateBlankSchema}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Blank Schema</span>
          </button>
          <button
            type="button"
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Schema JSON</span>
          </button>
        </div>
      </div>

      {/* Save Current Workspace Schema Form */}
      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
      >
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Save Active Schema as Custom Template
          </span>
          <span className="font-mono text-slate-500 dark:text-slate-400">
            {activeSchema.fields.length} fields · {activeSchema.endianness}-endian
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Template name"
            className="md:col-span-4 h-8 px-2.5 text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
          />
          <input
            type="text"
            value={customSummary}
            onChange={(e) => setCustomSummary(e.target.value)}
            placeholder="Brief description of packet format and use case"
            className="md:col-span-6 h-8 px-2.5 text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!customName.trim()}
            className="md:col-span-2 h-8 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Template</span>
          </button>
        </div>

        {saveMessage && (
          <div className="text-xs text-emerald-700 dark:text-emerald-400">{saveMessage}</div>
        )}
      </form>

      {/* Template Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {allTemplates.map((tpl) => {
          const preview = previews.get(tpl.id);
          const isCurrent = tpl.schema.name === activeSchema.name;
          return (
            <div
              key={tpl.id}
              className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {tpl.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                      <span>{tpl.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{tpl.schema.fields.length} fields</span>
                      <span aria-hidden="true">·</span>
                      <span>{tpl.schema.endianness}-endian</span>
                      {tpl.schema.checksum?.enabled && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-700 dark:text-cyan-400">
                            {tpl.schema.checksum.algorithm}
                          </span>
                        </>
                      )}
                      {preview && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatByteSize(preview.bytes)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {!tpl.builtIn && (
                    <button
                      type="button"
                      onClick={() => onDeleteCustomTemplate(tpl.id)}
                      title="Delete custom template"
                      aria-label={`Delete template ${tpl.name}`}
                      className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {tpl.summary}
                </p>

                {/* Field summary list */}
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                  {tpl.schema.fields
                    .map((f) => `${f.name}:${f.type}`)
                    .join(' · ')}
                </div>

                {/* Live Computed Hex Preview */}
                {preview && preview.ok && (
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-cyan-700 dark:text-cyan-300 break-all">
                    {preview.hex}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onLoadTemplate(tpl)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{isCurrent ? 'Reload in Builder' : 'Load in Builder'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    exportSchemaJsonFile(tpl.schema, tpl.sampleValues, tpl.id)
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
