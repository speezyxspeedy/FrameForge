import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  ChecksumAlgorithm,
  EncodedPacket,
  Endianness,
  FieldValue,
  FieldValuesMap,
  ProtocolField,
  ProtocolSchema,
  RoundTripResult,
} from '../../types/protocol';
import { encodePacket } from '../../engine/binaryWriter';
import { isVariableLengthFieldType } from '../../engine/fieldEncoder';
import { CHECKSUM_SPECS } from '../../engine/checksumEngine';
import {
  copyToClipboard,
  formatByteSize,
  getFieldTypeShortLabel,
} from '../../utilities/formatters';
import { ByteVisualizerSvg } from '../HexInspector/ByteVisualizerSvg';
import { FieldEditorPanel } from './FieldEditorPanel';

interface PacketBuilderViewProps {
  schema: ProtocolSchema;
  fieldValues: FieldValuesMap;
  encodedPacket: EncodedPacket;
  roundTripResult: RoundTripResult | null;
  selectedFieldId: string | null;
  selectedByteOffset: number | null;
  onSelectField: (fieldId: string | null) => void;
  onSelectByte: (offset: number) => void;
  onUpdateSchema: (schema: ProtocolSchema) => void;
  onUpdateFieldValue: (fieldName: string, value: FieldValue) => void;
  onRunRoundTrip: () => void;
  onAddField: () => void;
  onDuplicateField: (fieldId: string) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderField: (fieldId: string, direction: 'up' | 'down') => void;
  onUpdateFieldConfig: (updated: ProtocolField) => void;
}

export const PacketBuilderView: React.FC<PacketBuilderViewProps> = ({
  schema,
  fieldValues,
  encodedPacket,
  roundTripResult,
  selectedFieldId,
  selectedByteOffset,
  onSelectField,
  onSelectByte,
  onUpdateSchema,
  onUpdateFieldValue,
  onRunRoundTrip,
  onAddField,
  onDuplicateField,
  onRemoveField,
  onReorderField,
  onUpdateFieldConfig,
}) => {
  const [copiedHex, setCopiedHex] = useState(false);

  const selectedField = useMemo(
    () => schema.fields.find((f) => f.id === selectedFieldId) ?? schema.fields[0] ?? null,
    [schema.fields, selectedFieldId]
  );

  // Live endianness comparison computed using the real engine (never hardcoded)
  const alternateEndianPreview = useMemo(() => {
    const altEndian: Endianness = schema.endianness === 'big' ? 'little' : 'big';
    const altSchema: ProtocolSchema = { ...schema, endianness: altEndian };
    return {
      endianness: altEndian,
      packet: encodePacket(altSchema, fieldValues),
    };
  }, [schema, fieldValues]);

  const fieldByteMap = useMemo(() => {
    const map = new Map<string, { start: number; end: number; len: number; hex: string }>();
    for (const m of encodedPacket.fieldMappings) {
      map.set(m.fieldId, {
        start: m.startOffset,
        end: m.endOffset,
        len: m.byteLength,
        hex: m.rawHex,
      });
    }
    for (const br of encodedPacket.bitRanges) {
      const parent = encodedPacket.fieldMappings.find(
        (m) => m.startOffset === br.byteOffset && m.fieldType === 'bitfield'
      );
      if (parent) {
        map.set(br.fieldId, {
          start: br.byteOffset,
          end: br.byteOffset + br.storageBytes,
          len: br.storageBytes,
          hex: parent.rawHex,
        });
      }
    }
    return map;
  }, [encodedPacket]);

  const errorByFieldId = useMemo(() => {
    const map = new Map<string, string>();
    for (const err of encodedPacket.errors) {
      if (err.fieldId) {
        map.set(err.fieldId, err.message);
      }
    }
    return map;
  }, [encodedPacket.errors]);

  const handleCopyHex = async () => {
    if (!encodedPacket.hexString) return;
    const ok = await copyToClipboard(encodedPacket.hexString);
    if (ok) {
      setCopiedHex(true);
      setTimeout(() => setCopiedHex(false), 1500);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-5 space-y-4">
      {/* Top configuration strip: Global Endianness + Packet Checksum + Round-Trip Action */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Packet Builder & Schema Editor
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Define binary fields, configure endianness and bit packing, edit live values, and verify round-trip integrity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Global Endianness Segmented Switch */}
            <div className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => onUpdateSchema({ ...schema, endianness: 'big' })}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  schema.endianness === 'big'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Big-Endian
              </button>
              <button
                type="button"
                onClick={() => onUpdateSchema({ ...schema, endianness: 'little' })}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  schema.endianness === 'little'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Little-Endian
              </button>
            </div>

            <button
              type="button"
              onClick={onAddField}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Field</span>
            </button>

            <button
              type="button"
              onClick={onRunRoundTrip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Round-Trip Test</span>
            </button>
          </div>
        </div>

        {/* Packet Checksum Configuration Row */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={Boolean(schema.checksum?.enabled)}
              onChange={(e) =>
                onUpdateSchema({
                  ...schema,
                  checksum: {
                    enabled: e.target.checked,
                    algorithm: schema.checksum?.algorithm ?? 'crc16_ccitt_false',
                    startOffset: schema.checksum?.startOffset ?? 0,
                    endOffset: schema.checksum?.endOffset,
                    endianness: schema.checksum?.endianness,
                    fieldName: schema.checksum?.fieldName ?? 'checksum',
                  },
                })
              }
              className="rounded accent-cyan-500"
            />
            <span>Append Packet Checksum</span>
          </label>

          {schema.checksum?.enabled && (
            <>
              <select
                aria-label="Packet checksum algorithm"
                value={schema.checksum.algorithm}
                onChange={(e) =>
                  onUpdateSchema({
                    ...schema,
                    checksum: {
                      ...schema.checksum!,
                      algorithm: e.target.value as ChecksumAlgorithm,
                    },
                  })
                }
                className="h-7 px-2 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                {Object.values(CHECKSUM_SPECS).map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.name} ({spec.byteLength}B)
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span>Start Byte:</span>
                <input
                  type="number"
                  min={0}
                  value={schema.checksum.startOffset}
                  onChange={(e) =>
                    onUpdateSchema({
                      ...schema,
                      checksum: {
                        ...schema.checksum!,
                        startOffset: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                      },
                    })
                  }
                  className="w-16 h-7 px-2 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span>End Byte:</span>
                <input
                  type="number"
                  min={0}
                  placeholder="auto"
                  value={schema.checksum.endOffset ?? ''}
                  onChange={(e) =>
                    onUpdateSchema({
                      ...schema,
                      checksum: {
                        ...schema.checksum!,
                        endOffset:
                          e.target.value === ''
                            ? undefined
                            : Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                      },
                    })
                  }
                  className="w-20 h-7 px-2 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </label>

              {encodedPacket.checksum && (
                <span className="font-mono tabular-nums text-cyan-700 dark:text-cyan-400">
                  Computed: 0x{encodedPacket.checksum.hex} ({encodedPacket.checksum.processedBytes}B)
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Split: Field Table + Live Values (Left 7 cols) | Selected Field Config (Right 5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Fields & Live Values
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {schema.fields.length} fields · Total {formatByteSize(encodedPacket.byteLength)}
            </span>
          </div>

          {schema.fields.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This protocol schema has no fields yet. Add a field or load a template to start encoding binary frames.
              </p>
              <button
                type="button"
                onClick={onAddField}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Field</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 pl-3 pr-2 font-medium">Field</th>
                    <th className="py-2 px-2 font-medium">Type</th>
                    <th className="py-2 px-2 font-medium">Offset / Size</th>
                    <th className="py-2 px-2 font-medium">Live Value</th>
                    <th className="py-2 pl-2 pr-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                  {schema.fields.map((field, index) => {
                    const isSelected = selectedField?.id === field.id;
                    const mapping = fieldByteMap.get(field.id);
                    const fieldError = errorByFieldId.get(field.id);
                    const isVar = isVariableLengthFieldType(field);
                    const val =
                      fieldValues[field.name] !== undefined
                        ? fieldValues[field.name]
                        : field.defaultValue;

                    return (
                      <tr
                        key={field.id}
                        onClick={() => {
                          onSelectField(field.id);
                          if (mapping) onSelectByte(mapping.start);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-500/8 dark:bg-cyan-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 pl-3 pr-2 align-top">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: field.color ?? '#06B6D4' }}
                              aria-hidden="true"
                            />
                            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                              {field.name || '(unnamed)'}
                            </span>
                          </div>
                          {field.type === 'bitfield' && (
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 pl-4 mt-0.5">
                              {field.bitGroup ? `${field.bitGroup} · ` : ''}
                              {field.bitWidth ?? 1}b @{field.bitOffset ?? 0} ({field.bitOrder ?? 'msb-first'})
                            </div>
                          )}
                          {fieldError && (
                            <div className="text-[11px] text-red-600 dark:text-red-400 pl-4 mt-1">
                              {fieldError}
                            </div>
                          )}
                        </td>

                        <td className="py-2 px-2 align-top font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          <div>{getFieldTypeShortLabel(field.type)}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            {isVar ? 'variable' : 'fixed'}
                            {field.endianness ? ` · ${field.endianness.toUpperCase()}` : ''}
                          </div>
                        </td>

                        <td className="py-2 px-2 align-top font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {mapping ? (
                            <>
                              <div>
                                {mapping.start}..{Math.max(mapping.start, mapping.end - 1)}
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                {mapping.len}B
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td
                          className="py-2 px-2 align-top min-w-[140px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {field.type === 'boolean' ? (
                            <button
                              type="button"
                              onClick={() => onUpdateFieldValue(field.name, !Boolean(val))}
                              className={`px-2.5 py-1 rounded font-mono text-xs border transition-colors ${
                                Boolean(val)
                                  ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {Boolean(val) ? 'true (0x01)' : 'false (0x00)'}
                            </button>
                          ) : (
                            <input
                              type="text"
                              value={val instanceof Uint8Array ? Array.from(val).map((b) => b.toString(16).padStart(2, '0')).join(' ') : String(val ?? '')}
                              onChange={(e) => onUpdateFieldValue(field.name, e.target.value)}
                              aria-label={`Value for ${field.name}`}
                              className={`w-full h-7 px-2 font-mono text-xs rounded bg-slate-50 dark:bg-slate-950 border focus:outline-none ${
                                fieldError
                                  ? 'border-red-500 text-red-700 dark:text-red-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-cyan-500'
                              }`}
                            />
                          )}
                        </td>

                        <td
                          className="py-2 pl-2 pr-3 align-top text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => onReorderField(field.id, 'up')}
                              title="Move field up"
                              aria-label={`Move ${field.name} up`}
                              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === schema.fields.length - 1}
                              onClick={() => onReorderField(field.id, 'down')}
                              title="Move field down"
                              aria-label={`Move ${field.name} down`}
                              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDuplicateField(field.id)}
                              title="Duplicate field"
                              aria-label={`Duplicate ${field.name}`}
                              className="p-1 rounded text-slate-500 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveField(field.id)}
                              title="Remove field"
                              aria-label={`Remove ${field.name}`}
                              className="p-1 rounded text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Field Configuration Inspector */}
        <div className="xl:col-span-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Field Configuration
            </span>
            {selectedField && (
              <span className="font-mono text-cyan-700 dark:text-cyan-400">
                {selectedField.name}
              </span>
            )}
          </div>
          <div className="p-4">
            {selectedField ? (
              <FieldEditorPanel
                field={selectedField}
                allFields={schema.fields}
                globalEndianness={schema.endianness}
                onChange={onUpdateFieldConfig}
              />
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                Select a field from the table to edit its type, byte order, length, or bit-packing parameters.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Live Encoded Output + Byte Layout Map + Endianness Diff */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Encoded Packet Preview
            </span>
            <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
              {encodedPacket.byteLength} bytes
            </span>
            <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {schema.endianness === 'big' ? 'Big-Endian' : 'Little-Endian'}
            </span>
          </div>

          <button
            type="button"
            disabled={!encodedPacket.hexString}
            onClick={handleCopyHex}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedHex ? 'Copied Hex' : 'Copy Hex'}</span>
          </button>
        </div>

        {encodedPacket.errors.length > 0 && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/40 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>Encoding Failed ({encodedPacket.errors.length} issue{encodedPacket.errors.length > 1 ? 's' : ''})</span>
            </div>
            {encodedPacket.errors.map((err, i) => (
              <div key={i} className="text-xs font-mono text-red-700 dark:text-red-300/90 pl-5">
                {err.fieldName ? `[${err.fieldName}] ` : ''}
                {err.message}
                {err.expected ? ` (Expected: ${err.expected}; Received: ${err.received})` : ''}
              </div>
            ))}
          </div>
        )}

        {encodedPacket.warnings.length > 0 && (
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/40 space-y-1">
            {encodedPacket.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        <ByteVisualizerSvg
          bytes={encodedPacket.bytes}
          fieldMappings={encodedPacket.fieldMappings}
          selectedByteOffset={selectedByteOffset}
          selectedFieldId={selectedFieldId}
          onSelectByte={onSelectByte}
          onSelectField={onSelectField}
        />

        {encodedPacket.success && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Active Output ({schema.endianness === 'big' ? 'Big-Endian' : 'Little-Endian'})
              </div>
              <div className="font-mono text-xs break-all text-cyan-700 dark:text-cyan-300 leading-relaxed">
                {encodedPacket.hexString || '(0 bytes)'}
              </div>
            </div>

            <div className="p-3 rounded bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>
                  Endianness Comparison ({alternateEndianPreview.endianness === 'big' ? 'Big-Endian' : 'Little-Endian'})
                </span>
                <span className="font-mono text-[10px]">
                  {alternateEndianPreview.packet.hexString === encodedPacket.hexString
                    ? 'Identical bytes'
                    : 'Byte order differs'}
                </span>
              </div>
              <div className="font-mono text-xs break-all text-slate-600 dark:text-slate-400 leading-relaxed">
                {alternateEndianPreview.packet.success
                  ? alternateEndianPreview.packet.hexString || '(0 bytes)'
                  : 'N/A'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Round-Trip Integrity Verification Section */}
      {roundTripResult && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              {roundTripResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              )}
              <span
                className={`font-semibold ${
                  roundTripResult.success
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                Round-Trip Validation: {roundTripResult.success ? 'PASSED' : 'FAILED'}
              </span>
              <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-600 dark:text-slate-300">{roundTripResult.summary}</span>
            </div>

            <button
              type="button"
              onClick={onRunRoundTrip}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Re-run</span>
            </button>
          </div>

          {roundTripResult.comparisons.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 pl-4 pr-2 font-medium">Field</th>
                    <th className="py-2 px-2 font-medium">Offset</th>
                    <th className="py-2 px-2 font-medium">Original Input</th>
                    <th className="py-2 px-2 font-medium">Decoded Output</th>
                    <th className="py-2 pl-2 pr-4 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono">
                  {roundTripResult.comparisons.map((cmp) => (
                    <tr key={cmp.fieldId}>
                      <td className="py-2 pl-4 pr-2 text-slate-900 dark:text-slate-100">
                        {cmp.fieldName}
                      </td>
                      <td className="py-2 px-2 tabular-nums text-slate-500 dark:text-slate-400">
                        +{cmp.byteOffset} ({cmp.byteLength}B)
                      </td>
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300">
                        {cmp.originalFormatted}
                      </td>
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300">
                        {cmp.decodedFormatted}
                      </td>
                      <td className="py-2 pl-2 pr-4">
                        <span
                          className={
                            cmp.matched
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-red-600 dark:text-red-400 font-semibold'
                          }
                        >
                          {cmp.matched ? 'Match' : 'Mismatch'}
                        </span>
                        {cmp.diffDetail && (
                          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {cmp.diffDetail}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
