import React from 'react';
import type {
  BitOrder,
  BytesLengthMode,
  Endianness,
  FieldType,
  LengthPrefixType,
  ProtocolField,
} from '../../types/protocol';

interface FieldEditorPanelProps {
  field: ProtocolField;
  allFields: ProtocolField[];
  globalEndianness: Endianness;
  onChange: (updated: ProtocolField) => void;
}

const FIELD_TYPES: Array<{ value: FieldType; label: string; group: string }> = [
  { value: 'uint8', label: 'uint8 (0..255)', group: 'Unsigned Integers' },
  { value: 'uint16', label: 'uint16 (0..65535)', group: 'Unsigned Integers' },
  { value: 'uint32', label: 'uint32 (0..4294967295)', group: 'Unsigned Integers' },
  { value: 'int8', label: 'int8 (-128..127)', group: 'Signed Integers' },
  { value: 'int16', label: 'int16 (-32768..32767)', group: 'Signed Integers' },
  { value: 'int32', label: 'int32 (-2147483648..2147483647)', group: 'Signed Integers' },
  { value: 'float32', label: 'float32 (IEEE 754, 4B)', group: 'Floating Point' },
  { value: 'float64', label: 'float64 (IEEE 754, 8B)', group: 'Floating Point' },
  { value: 'boolean', label: 'boolean (1B: 0x00 / 0x01)', group: 'Other Types' },
  { value: 'utf8_fixed', label: 'UTF-8 Fixed-Length String', group: 'Strings' },
  { value: 'utf8_null', label: 'UTF-8 Null-Terminated String', group: 'Strings' },
  { value: 'utf8_length_prefixed', label: 'UTF-8 Length-Prefixed String', group: 'Strings' },
  { value: 'bytes', label: 'Raw Byte Array (byte[])', group: 'Binary' },
  { value: 'bitfield', label: 'Bit Field (1–32 bits)', group: 'Binary' },
];

const COLOR_SWATCHES = [
  '#06B6D4',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

function defaultValueForType(type: FieldType): ProtocolField['defaultValue'] {
  switch (type) {
    case 'boolean':
      return true;
    case 'utf8_fixed':
    case 'utf8_null':
    case 'utf8_length_prefixed':
      return 'Hello';
    case 'bytes':
      return 'DE AD BE EF';
    case 'float32':
    case 'float64':
      return 22.5;
    case 'bitfield':
      return 1;
    default:
      return 0;
  }
}

export const FieldEditorPanel: React.FC<FieldEditorPanelProps> = ({
  field,
  allFields,
  globalEndianness,
  onChange,
}) => {
  const fieldIndex = allFields.findIndex((f) => f.id === field.id);
  const earlierIntFields = allFields
    .slice(0, Math.max(0, fieldIndex))
    .filter((f) =>
      ['uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32'].includes(f.type)
    );

  const supportsEndianness =
    field.type === 'uint16' ||
    field.type === 'uint32' ||
    field.type === 'int16' ||
    field.type === 'int32' ||
    field.type === 'float32' ||
    field.type === 'float64' ||
    field.type === 'utf8_length_prefixed' ||
    (field.type === 'bytes' && field.bytesLengthMode === 'length_prefixed') ||
    (field.type === 'bitfield' && (field.bitStorageBytes ?? 1) > 1);

  const handleTypeChange = (nextType: FieldType) => {
    const updated: ProtocolField = {
      ...field,
      type: nextType,
      defaultValue: defaultValueForType(nextType),
    };
    if (nextType === 'utf8_fixed') {
      updated.length = updated.length ?? 8;
      updated.paddingByte = updated.paddingByte ?? 0x00;
      updated.truncate = updated.truncate ?? false;
    } else if (nextType === 'utf8_null') {
      updated.terminatorByte = updated.terminatorByte ?? 0x00;
      updated.allowEmbeddedTerminator = updated.allowEmbeddedTerminator ?? false;
    } else if (nextType === 'utf8_length_prefixed') {
      updated.lengthPrefixType = updated.lengthPrefixType ?? 'uint16';
    } else if (nextType === 'bytes') {
      updated.bytesLengthMode = updated.bytesLengthMode ?? 'fixed';
      updated.length = updated.length ?? 4;
    } else if (nextType === 'bitfield') {
      updated.bitWidth = updated.bitWidth ?? 4;
      updated.bitOffset = updated.bitOffset ?? 0;
      updated.bitStorageBytes = updated.bitStorageBytes ?? 1;
      updated.bitOrder = updated.bitOrder ?? 'msb-first';
    }
    onChange(updated);
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Field Name
          </span>
          <input
            type="text"
            value={field.name}
            onChange={(e) => onChange({ ...field, name: e.target.value })}
            placeholder="e.g. deviceId"
            className="w-full h-8 px-2.5 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
            Field Type
          </span>
          <select
            value={field.type}
            onChange={(e) => handleTypeChange(e.target.value as FieldType)}
            className="w-full h-8 px-2 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
          Description
        </span>
        <input
          type="text"
          value={field.description ?? ''}
          onChange={(e) => onChange({ ...field, description: e.target.value })}
          placeholder="Document units, scaling, or wire semantics"
          className="w-full h-8 px-2.5 text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
        {supportsEndianness ? (
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Byte Order Override
            </span>
            <select
              value={field.endianness ?? 'inherit'}
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...field,
                  endianness: v === 'inherit' ? undefined : (v as Endianness),
                });
              }}
              className="w-full h-8 px-2 text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <option value="inherit">
                Inherit Global ({globalEndianness === 'big' ? 'Big-Endian' : 'Little-Endian'})
              </option>
              <option value="big">Big-Endian (Network)</option>
              <option value="little">Little-Endian (x86/ARM)</option>
            </select>
          </label>
        ) : (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2">
            Single-byte / byte-stream type (endianness N/A)
          </div>
        )}

        <label className="inline-flex items-center gap-2 pt-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="rounded border-slate-300 dark:border-slate-700 accent-cyan-500"
          />
          <span className="text-xs text-slate-700 dark:text-slate-300">Required field</span>
        </label>
      </div>

      {/* Type-specific controls */}
      {field.type === 'utf8_fixed' && (
        <div className="p-3 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Fixed Byte Length
              </span>
              <input
                type="number"
                min={1}
                max={65536}
                value={field.length ?? 8}
                onChange={(e) =>
                  onChange({ ...field, length: Number.parseInt(e.target.value, 10) || 1 })
                }
                className="w-full h-8 px-2.5 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Padding Byte (0–255)
              </span>
              <input
                type="number"
                min={0}
                max={255}
                value={field.paddingByte ?? 0}
                onChange={(e) =>
                  onChange({ ...field, paddingByte: Number.parseInt(e.target.value, 10) || 0 })
                }
                className="w-full h-8 px-2.5 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(field.truncate)}
              onChange={(e) => onChange({ ...field, truncate: e.target.checked })}
              className="rounded accent-cyan-500"
            />
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              Enable safe UTF-8 code-point truncation if value exceeds fixed length
            </span>
          </label>
        </div>
      )}

      {field.type === 'utf8_null' && (
        <div className="p-3 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Terminator Byte (default 0 = 0x00)
            </span>
            <input
              type="number"
              min={0}
              max={255}
              value={field.terminatorByte ?? 0}
              onChange={(e) =>
                onChange({ ...field, terminatorByte: Number.parseInt(e.target.value, 10) || 0 })
              }
              className="w-full h-8 px-2.5 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(field.allowEmbeddedTerminator)}
              onChange={(e) =>
                onChange({ ...field, allowEmbeddedTerminator: e.target.checked })
              }
              className="rounded accent-cyan-500"
            />
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              Permit embedded terminator bytes inside string
            </span>
          </label>
        </div>
      )}

      {field.type === 'utf8_length_prefixed' && (
        <div className="p-3 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              UTF-8 Byte-Length Prefix Width
            </span>
            <select
              value={field.lengthPrefixType ?? 'uint16'}
              onChange={(e) =>
                onChange({ ...field, lengthPrefixType: e.target.value as LengthPrefixType })
              }
              className="w-full h-8 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="uint8">uint8 (1 byte, max 255B)</option>
              <option value="uint16">uint16 (2 bytes, max 65,535B)</option>
              <option value="uint32">uint32 (4 bytes)</option>
            </select>
          </label>
        </div>
      )}

      {field.type === 'bytes' && (
        <div className="p-3 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Byte Array Length Mode
            </span>
            <select
              value={field.bytesLengthMode ?? 'fixed'}
              onChange={(e) =>
                onChange({ ...field, bytesLengthMode: e.target.value as BytesLengthMode })
              }
              className="w-full h-8 px-2 text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="fixed">Fixed byte count</option>
              <option value="length_prefixed">Built-in length prefix</option>
              <option value="field_ref">Reference earlier integer field</option>
              <option value="remaining">Remaining payload bytes</option>
            </select>
          </label>

          {(field.bytesLengthMode ?? 'fixed') === 'fixed' && (
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Exact Byte Length
              </span>
              <input
                type="number"
                min={0}
                max={65536}
                value={field.length ?? 4}
                onChange={(e) =>
                  onChange({ ...field, length: Number.parseInt(e.target.value, 10) || 0 })
                }
                className="w-full h-8 px-2.5 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
          )}

          {field.bytesLengthMode === 'length_prefixed' && (
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Length Prefix Type
              </span>
              <select
                value={field.lengthPrefixType ?? 'uint16'}
                onChange={(e) =>
                  onChange({ ...field, lengthPrefixType: e.target.value as LengthPrefixType })
                }
                className="w-full h-8 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="uint8">uint8</option>
                <option value="uint16">uint16</option>
                <option value="uint32">uint32</option>
              </select>
            </label>
          )}

          {field.bytesLengthMode === 'field_ref' && (
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Length Field Reference
              </span>
              <select
                value={field.lengthFieldName ?? ''}
                onChange={(e) => onChange({ ...field, lengthFieldName: e.target.value })}
                className="w-full h-8 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="">Select earlier integer field...</option>
                {earlierIntFields.map((ef) => (
                  <option key={ef.id} value={ef.name}>
                    {ef.name} ({ef.type})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {field.type === 'bitfield' && (
        <div className="p-3 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Bit Width
              </span>
              <input
                type="number"
                min={1}
                max={32}
                value={field.bitWidth ?? 1}
                onChange={(e) =>
                  onChange({ ...field, bitWidth: Number.parseInt(e.target.value, 10) || 1 })
                }
                className="w-full h-8 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Bit Offset
              </span>
              <input
                type="number"
                min={0}
                max={31}
                value={field.bitOffset ?? 0}
                onChange={(e) =>
                  onChange({ ...field, bitOffset: Number.parseInt(e.target.value, 10) || 0 })
                }
                className="w-full h-8 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Unit Bytes
              </span>
              <select
                value={field.bitStorageBytes ?? 1}
                onChange={(e) =>
                  onChange({
                    ...field,
                    bitStorageBytes: Number(e.target.value) as 1 | 2 | 4,
                  })
                }
                className="w-full h-8 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value={1}>1B (8b)</option>
                <option value={2}>2B (16b)</option>
                <option value={4}>4B (32b)</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Bit Numbering Order
              </span>
              <select
                value={field.bitOrder ?? 'msb-first'}
                onChange={(e) => onChange({ ...field, bitOrder: e.target.value as BitOrder })}
                className="w-full h-8 px-2 text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="msb-first">MSB-first (Bit 0 = MSB)</option>
                <option value="lsb-first">LSB-first (Bit 0 = LSB)</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Bit Group (Pack Shared)
              </span>
              <input
                type="text"
                value={field.bitGroup ?? ''}
                onChange={(e) =>
                  onChange({ ...field, bitGroup: e.target.value || undefined })
                }
                placeholder="e.g. statusFlags"
                className="w-full h-8 px-2 font-mono text-xs rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Consecutive bitfields sharing the same Bit Group pack into a single storage unit. Bit
            order defines bit numbering inside the unit and is separate from multi-byte endianness.
          </p>
        </div>
      )}

      {/* Visual color swatch */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
          Inspector Highlight
        </span>
        <div className="flex items-center gap-1.5">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange({ ...field, color: swatch })}
              aria-label={`Select color ${swatch}`}
              className={`w-4 h-4 rounded-sm transition-transform ${
                field.color === swatch ? 'ring-2 ring-offset-1 ring-cyan-500 dark:ring-offset-slate-900 scale-110' : 'opacity-75 hover:opacity-100'
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
