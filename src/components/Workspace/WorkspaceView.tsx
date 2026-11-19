import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileCode2,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  DecodedPacket,
  EncodedPacket,
  FieldValue,
  FieldValuesMap,
  NavigationView,
  OperationLogEntry,
  ProtocolField,
  ProtocolSchema,
  RoundTripResult,
} from '../../types/protocol';
import { inspectByteAtOffset } from '../../engine/bitVisualizer';
import { bytesToHexString } from '../../engine/binaryWriter';
import {
  copyToClipboard,
  formatByteSize,
  getFieldTypeShortLabel,
} from '../../utilities/formatters';
import { BitVisualizerPanel } from '../HexInspector/BitVisualizerPanel';
import { ByteVisualizerSvg } from '../HexInspector/ByteVisualizerSvg';
import { FieldEditorPanel } from '../PacketBuilder/FieldEditorPanel';

interface WorkspaceViewProps {
  schema: ProtocolSchema;
  fieldValues: FieldValuesMap;
  encodedPacket: EncodedPacket;
  activeBytes: Uint8Array;
  hasManualEdits: boolean;
  decodedPacket: DecodedPacket;
  roundTripResult: RoundTripResult | null;
  operationLog: OperationLogEntry[];
  selectedFieldId: string | null;
  selectedByteOffset: number | null;
  onSelectField: (fieldId: string | null) => void;
  onSelectByte: (offset: number) => void;
  onUpdateSchema: (schema: ProtocolSchema) => void;
  onUpdateFieldValue: (fieldName: string, value: FieldValue) => void;
  onUpdateFieldConfig: (updated: ProtocolField) => void;
  onAddField: () => void;
  onRunRoundTrip: () => void;
  onToggleBit: (byteOffset: number, bitIndex: number) => void;
  onResetManualEdits: () => void;
  onNavigate: (view: NavigationView) => void;
}

type BottomTab = 'validation' | 'checksum' | 'errors' | 'log';

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  schema,
  fieldValues,
  encodedPacket,
  activeBytes,
  hasManualEdits,
  decodedPacket,
  roundTripResult,
  operationLog,
  selectedFieldId,
  selectedByteOffset,
  onSelectField,
  onSelectByte,
  onUpdateSchema,
  onUpdateFieldValue,
  onUpdateFieldConfig,
  onAddField,
  onRunRoundTrip,
  onToggleBit,
  onResetManualEdits,
  onNavigate,
}) => {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('validation');
  const [manualBitEdit, setManualBitEdit] = useState(true);
  const [copiedHex, setCopiedHex] = useState(false);

  const selectedField = useMemo(
    () => schema.fields.find((f) => f.id === selectedFieldId) ?? schema.fields[0] ?? null,
    [schema.fields, selectedFieldId]
  );

  const activeOffset =
    selectedByteOffset !== null && selectedByteOffset < activeBytes.length
      ? selectedByteOffset
      : activeBytes.length > 0
        ? 0
        : null;

  const byteDetail = useMemo(
    () =>
      activeOffset !== null
        ? inspectByteAtOffset(
            activeBytes,
            activeOffset,
            decodedPacket.fieldMappings.length > 0
              ? decodedPacket.fieldMappings
              : encodedPacket.fieldMappings,
            decodedPacket.bitRanges.length > 0
              ? decodedPacket.bitRanges
              : encodedPacket.bitRanges
          )
        : null,
    [activeBytes, activeOffset, decodedPacket, encodedPacket]
  );

  const activeHex = useMemo(() => bytesToHexString(activeBytes), [activeBytes]);

  const totalErrorCount = encodedPacket.errors.length + decodedPacket.errors.length;

  const handleCopyHex = async () => {
    if (!activeHex) return;
    const ok = await copyToClipboard(activeHex);
    if (ok) {
      setCopiedHex(true);
      setTimeout(() => setCopiedHex(false), 1500);
    }
  };

  // Empty state when no fields exist
  if (schema.fields.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-center space-y-4">
          <FileCode2 className="w-8 h-8 mx-auto text-cyan-500" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Empty Protocol Workspace
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Your active schema "{schema.name}" has no fields defined yet. Add your first binary field or load one of the built-in templates to begin encoding and inspecting bytes.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onAddField}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Field</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('templates')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200"
            >
              <span>Browse Templates</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Upper 3-Column Workbench */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden divide-y xl:divide-y-0 xl:divide-x divide-slate-200 dark:divide-slate-800">
        {/* LEFT PANE: Schema Tree + Field Configuration */}
        <section
          className={`${
            leftCollapsed ? 'xl:w-10' : 'xl:w-80 2xl:w-88'
          } shrink-0 flex flex-col bg-white dark:bg-[#0F1522] min-h-0`}
        >
          <div className="h-9 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            {!leftCollapsed && (
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                Schema Tree ({schema.fields.length})
              </span>
            )}
            <div className="flex items-center gap-1">
              {!leftCollapsed && (
                <button
                  type="button"
                  onClick={onAddField}
                  title="Add field"
                  aria-label="Add field"
                  className="p-1 rounded text-cyan-600 dark:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setLeftCollapsed((v) => !v)}
                title={leftCollapsed ? 'Expand schema panel' : 'Collapse schema panel'}
                aria-label={leftCollapsed ? 'Expand schema panel' : 'Collapse schema panel'}
                className="hidden xl:inline-flex p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {leftCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {!leftCollapsed && (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
              {/* Field list */}
              <div className="p-2 space-y-0.5 max-h-56 overflow-y-auto">
                {schema.fields.map((f) => {
                  const isSel = selectedField?.id === f.id;
                  const mapping = encodedPacket.fieldMappings.find(
                    (m) => m.fieldId === f.id
                  );
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onSelectField(f.id);
                        if (mapping) onSelectByte(mapping.startOffset);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-left text-xs transition-colors ${
                        isSel
                          ? 'bg-cyan-500/12 text-cyan-800 dark:text-cyan-300 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: f.color ?? '#06B6D4' }}
                        />
                        <span className="font-mono truncate">{f.name}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                        {getFieldTypeShortLabel(f.type)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Field Editor */}
              {selectedField && (
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    <span>Field Settings</span>
                    <button
                      type="button"
                      onClick={() => onNavigate('builder')}
                      className="text-cyan-600 dark:text-cyan-400 font-normal hover:underline"
                    >
                      Full Builder
                    </button>
                  </div>
                  <FieldEditorPanel
                    field={selectedField}
                    allFields={schema.fields}
                    globalEndianness={schema.endianness}
                    onChange={onUpdateFieldConfig}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* CENTER PANE: Live Packet Values + Encoded Hex Output + SVG Byte Visualization */}
        <section className="flex-1 min-w-0 flex flex-col bg-slate-50/70 dark:bg-[#0B0F17] min-h-0">
          <div className="h-9 px-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs min-w-0">
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                Packet Workbench
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {formatByteSize(activeBytes.length)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => onUpdateSchema({ ...schema, endianness: 'big' })}
                  className={`px-2 py-0.5 rounded font-medium ${
                    schema.endianness === 'big'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  BE
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSchema({ ...schema, endianness: 'little' })}
                  className={`px-2 py-0.5 rounded font-medium ${
                    schema.endianness === 'little'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  LE
                </button>
              </div>

              <button
                type="button"
                onClick={onRunRoundTrip}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 whitespace-nowrap"
              >
                <Play className="w-3 h-3" />
                <span>Round-Trip</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {/* Compact Value Editor Grid */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Live Field Values
                </span>
                {hasManualEdits && (
                  <button
                    type="button"
                    onClick={onResetManualEdits}
                    className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Manual byte edits active — Reset</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {schema.fields.map((field) => {
                  const val =
                    fieldValues[field.name] !== undefined
                      ? fieldValues[field.name]
                      : field.defaultValue;
                  const err = encodedPacket.errors.find((e) => e.fieldId === field.id);

                  return (
                    <div
                      key={field.id}
                      onClick={() => onSelectField(field.id)}
                      className={`p-2 rounded border transition-colors ${
                        selectedField?.id === field.id
                          ? 'border-cyan-500/60 bg-cyan-500/5'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                          {field.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {getFieldTypeShortLabel(field.type)}
                        </span>
                      </div>
                      {field.type === 'boolean' ? (
                        <button
                          type="button"
                          onClick={() => onUpdateFieldValue(field.name, !Boolean(val))}
                          className="w-full h-7 px-2 text-left font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        >
                          {Boolean(val) ? 'true (0x01)' : 'false (0x00)'}
                        </button>
                      ) : (
                        <input
                          type="text"
                          value={
                            val instanceof Uint8Array
                              ? bytesToHexString(val)
                              : String(val ?? '')
                          }
                          onChange={(e) => onUpdateFieldValue(field.name, e.target.value)}
                          className={`w-full h-7 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border focus:outline-none ${
                            err
                              ? 'border-red-500 text-red-700 dark:text-red-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-cyan-500'
                          }`}
                        />
                      )}
                      {err && (
                        <div className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                          {err.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Encoded Hex Frame */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Encoded Wire Output
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyHex}
                    disabled={!activeHex}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 disabled:opacity-40"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedHex ? 'Copied' : 'Copy Hex'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('hex')}
                    className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline"
                  >
                    Full Hex Inspector
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-cyan-700 dark:text-cyan-300 break-all leading-relaxed">
                {activeHex || '(Fix encoding errors to generate bytes)'}
              </div>

              <ByteVisualizerSvg
                bytes={activeBytes}
                fieldMappings={
                  decodedPacket.fieldMappings.length > 0
                    ? decodedPacket.fieldMappings
                    : encodedPacket.fieldMappings
                }
                selectedByteOffset={activeOffset}
                selectedFieldId={selectedFieldId}
                onSelectByte={onSelectByte}
                onSelectField={onSelectField}
              />
            </div>
          </div>
        </section>

        {/* RIGHT PANE: Decoded Fields + Selected Byte & Bit Inspector */}
        <section
          className={`${
            rightCollapsed ? 'xl:w-10' : 'xl:w-96'
          } shrink-0 flex flex-col bg-white dark:bg-[#0F1522] min-h-0`}
        >
          <div className="h-9 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => setRightCollapsed((v) => !v)}
              title={rightCollapsed ? 'Expand inspector panel' : 'Collapse inspector panel'}
              aria-label={rightCollapsed ? 'Expand inspector panel' : 'Collapse inspector panel'}
              className="hidden xl:inline-flex p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {rightCollapsed ? (
                <ChevronLeft className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
            {!rightCollapsed && (
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                Decoded Fields & Byte Inspector
              </span>
            )}
          </div>

          {!rightCollapsed && (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
              {/* Decoded Fields Table */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Live Decoded Fields
                  </span>
                  <span
                    className={`font-mono font-medium ${
                      decodedPacket.success
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {decodedPacket.success ? 'Valid' : 'Error'}
                  </span>
                </div>

                {decodedPacket.fields.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    No decoded fields available.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                          <th className="py-1 pr-2 font-medium">Field</th>
                          <th className="py-1 px-1.5 font-medium">Off</th>
                          <th className="py-1 pl-1.5 font-medium text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                        {decodedPacket.fields.map((entry) => (
                          <tr
                            key={`${entry.fieldId}-${entry.startOffset}`}
                            onClick={() => {
                              onSelectByte(entry.startOffset);
                              if (entry.fieldId !== '__checksum__') {
                                onSelectField(entry.fieldId);
                              }
                            }}
                            className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50"
                          >
                            <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-200 truncate max-w-[110px]">
                              {entry.fieldName}
                            </td>
                            <td className="py-1.5 px-1.5 tabular-nums text-slate-500 dark:text-slate-400">
                              +{entry.startOffset}
                            </td>
                            <td className="py-1.5 pl-1.5 text-right text-cyan-700 dark:text-cyan-300 truncate max-w-[140px]">
                              {entry.formattedValue}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Selected Byte Inspector + Compact 8-bit Visualizer */}
              <div className="p-3 space-y-3">
                {byteDetail ? (
                  <>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono tabular-nums">
                      <div className="p-2 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] font-sans text-slate-500 block">Hex</span>
                        <span className="font-semibold text-cyan-700 dark:text-cyan-400">
                          0x{byteDetail.hex}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] font-sans text-slate-500 block">Dec</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {byteDetail.decimalUnsigned} ({byteDetail.decimalSigned})
                        </span>
                      </div>
                      <div className="p-2 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] font-sans text-slate-500 block">ASCII</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {byteDetail.isPrintableAscii ? `'${byteDetail.ascii}'` : '·'}
                        </span>
                      </div>
                    </div>

                    <BitVisualizerPanel
                      bytes={activeBytes}
                      selectedOffset={byteDetail.offset}
                      fieldMappings={
                        decodedPacket.fieldMappings.length > 0
                          ? decodedPacket.fieldMappings
                          : encodedPacket.fieldMappings
                      }
                      bitRanges={
                        decodedPacket.bitRanges.length > 0
                          ? decodedPacket.bitRanges
                          : encodedPacket.bitRanges
                      }
                      manualEditEnabled={manualBitEdit}
                      onToggleManualEdit={() => setManualBitEdit((v) => !v)}
                      onToggleBit={onToggleBit}
                      compact
                    />
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Click any byte in the byte map to inspect its bits.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* BOTTOM COLLAPSIBLE DIAGNOSTIC CONSOLE */}
      <section className="shrink-0 bg-white dark:bg-[#0E1420] border-t border-slate-200 dark:border-slate-800">
        <div className="h-9 px-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: 'validation', label: 'Validation & Round-Trip' },
                { id: 'checksum', label: 'Checksum Status' },
                {
                  id: 'errors',
                  label: `Errors (${totalErrorCount})`,
                },
                { id: 'log', label: `Operation Log (${operationLog.length})` },
              ] as Array<{ id: BottomTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setBottomTab(tab.id);
                  setBottomCollapsed(false);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  bottomTab === tab.id && !bottomCollapsed
                    ? 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setBottomCollapsed((v) => !v)}
            aria-label={bottomCollapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            {bottomCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {!bottomCollapsed && (
          <div className="h-36 overflow-y-auto px-4 py-2.5 text-xs">
            {bottomTab === 'validation' && (
              <div className="space-y-2">
                {roundTripResult ? (
                  <>
                    <div className="flex items-center gap-2 font-medium">
                      {roundTripResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <span
                        className={
                          roundTripResult.success
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {roundTripResult.summary}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {roundTripResult.comparisons.map((c) => (
                        <span key={c.fieldId}>
                          {c.fieldName}:{' '}
                          <strong
                            className={
                              c.matched
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {c.matched ? 'OK' : 'DIFF'}
                          </strong>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
                    <span>
                      Click "Round-Trip" to encode your schema values, decode the resulting bytes, and verify field-by-field integrity.
                    </span>
                    <button
                      type="button"
                      onClick={onRunRoundTrip}
                      className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium whitespace-nowrap"
                    >
                      Run Check
                    </button>
                  </div>
                )}
              </div>
            )}

            {bottomTab === 'checksum' && (
              <div className="space-y-2 font-mono">
                {decodedPacket.checksum ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <ShieldCheck
                      className={`w-4 h-4 shrink-0 ${
                        decodedPacket.checksum.valid
                          ? 'text-emerald-500'
                          : 'text-red-500'
                      }`}
                    />
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {decodedPacket.checksum.algorithm}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Range [{decodedPacket.checksum.startOffset}..{decodedPacket.checksum.endOffset})
                    </span>
                    <span className="text-cyan-700 dark:text-cyan-400">
                      Packet: 0x{decodedPacket.checksum.actualHex}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      Expected: 0x{decodedPacket.checksum.expectedHex}
                    </span>
                    <span
                      className={
                        decodedPacket.checksum.valid
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-red-600 dark:text-red-400 font-semibold'
                      }
                    >
                      {decodedPacket.checksum.valid ? 'VALID' : 'MISMATCH'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-sans">
                    <span>
                      No packet checksum field is currently enabled on this schema. Enable one in Packet Builder or test standalone CRCs in Checksum Lab.
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('checksum')}
                      className="text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
                    >
                      Open Checksum Lab
                    </button>
                  </div>
                )}
              </div>
            )}

            {bottomTab === 'errors' && (
              <div className="space-y-1.5 font-mono">
                {totalErrorCount === 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-sans">
                    No encoding or decoding errors detected.
                  </span>
                ) : (
                  <>
                    {encodedPacket.errors.map((err, i) => (
                      <div key={`enc-${i}`} className="text-red-600 dark:text-red-400">
                        [ENCODE] {err.fieldName ? `${err.fieldName}: ` : ''}
                        {err.message}
                      </div>
                    ))}
                    {decodedPacket.errors.map((err, i) => (
                      <div key={`dec-${i}`} className="text-red-600 dark:text-red-400">
                        [DECODE] {err.fieldName ? `${err.fieldName}: ` : ''}
                        {err.message}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {bottomTab === 'log' && (
              <div className="space-y-1 font-mono text-[11px]">
                {operationLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2">
                    <span className="text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                      {entry.timestamp}
                    </span>
                    <span
                      className={`shrink-0 uppercase ${
                        entry.level === 'error'
                          ? 'text-red-500'
                          : entry.level === 'warning'
                            ? 'text-amber-500'
                            : entry.level === 'success'
                              ? 'text-emerald-500'
                              : 'text-cyan-500'
                      }`}
                    >
                      [{entry.category}]
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
