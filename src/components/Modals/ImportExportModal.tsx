import React, { useRef, useState } from 'react';
import { Check, Copy, Download, FileCode2, FileText, Upload, X } from 'lucide-react';
import type { DecodedPacket, EncodedPacket, FieldValuesMap, ProtocolSchema } from '../../types/protocol';
import { parseHexString } from '../../engine/binaryReader';
import { validateImportedSchemaJson } from '../../engine/packetValidator';
import {
  copyToClipboard,
  exportBinaryFile,
  exportHexFile,
  exportSchemaJsonFile,
} from '../../utilities/formatters';

interface ImportExportModalProps {
  mode: 'import' | 'export' | null;
  onClose: () => void;
  schema: ProtocolSchema;
  fieldValues: FieldValuesMap;
  encodedPacket: EncodedPacket;
  activeBytes: Uint8Array;
  decodedPacket: DecodedPacket;
  onImportSchema: (schema: ProtocolSchema, sampleValues?: FieldValuesMap) => void;
  onImportBinary: (bytes: Uint8Array, sourceName: string) => void;
  onLog: (level: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}

const MAX_IMPORT_FILE_BYTES = 1024 * 1024; // 1 MiB safety limit

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  mode,
  onClose,
  schema,
  fieldValues,
  encodedPacket,
  activeBytes,
  decodedPacket,
  onImportSchema,
  onImportBinary,
  onLog,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const binInputRef = useRef<HTMLInputElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const schemaInputRef = useRef<HTMLInputElement>(null);

  if (!mode) return null;

  const handleCopy = async (key: string, text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setStatusMessage(`Copied ${label} to clipboard.`);
      onLog('info', `Copied ${label} to clipboard.`);
      setTimeout(() => setCopiedKey(null), 1600);
    } else {
      setError(`Unable to copy ${label} to clipboard.`);
    }
  };

  const handleBinaryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size === 0) {
      setError(`Binary file "${file.name}" is empty (0 bytes).`);
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(`File "${file.name}" (${file.size} bytes) exceeds 1 MiB safe limit.`);
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      onImportBinary(bytes, file.name);
      onLog('success', `Imported binary file "${file.name}" (${bytes.length} bytes).`);
      onClose();
    } catch {
      setError(`Failed to read binary file "${file.name}".`);
    }
  };

  const handleHexFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size === 0) {
      setError(`Hex file "${file.name}" is empty.`);
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES * 3) {
      setError(`Hex text file "${file.name}" is too large to parse safely.`);
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseHexString(text);
      if (!parsed.ok) {
        setError(`Malformed hex file "${file.name}": ${parsed.error.message}`);
        return;
      }
      if (parsed.bytes.length === 0) {
        setError(`Hex file "${file.name}" contained no byte values.`);
        return;
      }
      onImportBinary(parsed.bytes, file.name);
      onLog('success', `Imported hex text "${file.name}" (${parsed.bytes.length} bytes).`);
      onClose();
    } catch {
      setError(`Failed to read hex file "${file.name}".`);
    }
  };

  const handleSchemaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size === 0) {
      setError(`Schema file "${file.name}" is empty.`);
      return;
    }
    try {
      const text = await file.text();
      const result = validateImportedSchemaJson(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onImportSchema(result.data.schema, result.data.sampleValues);
      onLog('success', `Imported protocol schema "${result.data.schema.name}" from "${file.name}".`);
      onClose();
    } catch {
      setError(`Failed to read schema file "${file.name}".`);
    }
  };

  const serializableDecoded = () => {
    const out: Record<string, unknown> = {};
    for (const entry of decodedPacket.fields) {
      out[entry.fieldName] =
        entry.value instanceof Uint8Array
          ? Array.from(entry.value)
              .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
              .join(' ')
          : entry.value;
    }
    return JSON.stringify(
      {
        schema: schema.name,
        byteLength: decodedPacket.byteLength,
        valid: decodedPacket.success,
        checksum: decodedPacket.checksum ?? null,
        fields: out,
      },
      null,
      2
    );
  };

  const hexText = Array.from(activeBytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  const binText = Array.from(activeBytes)
    .map((b) => b.toString(2).padStart(8, '0'))
    .join(' ');

  const slug =
    schema.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'frameforge-packet';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'import' ? 'Import Binary or Schema' : 'Export Packet or Schema'}
        className="w-full max-w-lg rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'import' ? 'Import Files (Local Browser Processing)' : 'Export & Copy Data'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/40 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {statusMessage && (
            <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/40 text-xs text-emerald-700 dark:text-emerald-300">
              {statusMessage}
            </div>
          )}

          {mode === 'import' ? (
            <div className="space-y-3">
              <input
                ref={schemaInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleSchemaFileChange}
                className="hidden"
              />
              <input
                ref={binInputRef}
                type="file"
                accept=".bin,application/octet-stream"
                onChange={handleBinaryFileChange}
                className="hidden"
              />
              <input
                ref={hexInputRef}
                type="file"
                accept=".txt,.hex,text/plain"
                onChange={handleHexFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => schemaInputRef.current?.click()}
                className="w-full flex items-center justify-between p-3.5 rounded-md border border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 bg-slate-50 dark:bg-slate-900/60 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileCode2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Import Protocol Schema (.json)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Validates schema version, field types, bit ranges, and loads fields into builder.
                    </div>
                  </div>
                </div>
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => binInputRef.current?.click()}
                className="w-full flex items-center justify-between p-3.5 rounded-md border border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 bg-slate-50 dark:bg-slate-900/60 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Import Raw Binary Packet (.bin)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Loads raw bytes directly into Hex Inspector & Decoder (max 1 MiB).
                    </div>
                  </div>
                </div>
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => hexInputRef.current?.click()}
                className="w-full flex items-center justify-between p-3.5 rounded-md border border-slate-200 dark:border-slate-800 hover:border-cyan-500/60 bg-slate-50 dark:bg-slate-900/60 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Import Hexadecimal Text (.hex / .txt)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Parses space/newline-separated hex bytes and optional 0x prefixes.
                    </div>
                  </div>
                </div>
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Download Files ({activeBytes.length} active bytes)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={activeBytes.length === 0}
                    onClick={() => {
                      exportBinaryFile(activeBytes, `${slug}.bin`);
                      onLog('success', `Exported ${activeBytes.length} bytes to ${slug}.bin.`);
                    }}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-cyan-500 disabled:opacity-40 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Binary (.bin)</span>
                  </button>

                  <button
                    type="button"
                    disabled={activeBytes.length === 0}
                    onClick={() => {
                      exportHexFile(hexText, `${slug}.hex`, 'hex');
                      onLog('success', `Exported hex dump to ${slug}.hex.`);
                    }}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-cyan-500 disabled:opacity-40 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-500" />
                    <span>Hex Dump (.hex)</span>
                  </button>

                  <button
                    type="button"
                    disabled={activeBytes.length === 0}
                    onClick={() => {
                      exportHexFile(hexText, `${slug}.txt`, 'txt');
                      onLog('success', `Exported hex text to ${slug}.txt.`);
                    }}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-cyan-500 disabled:opacity-40 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Hex Text (.txt)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      exportSchemaJsonFile(schema, fieldValues, slug);
                      onLog('success', `Exported protocol schema "${schema.name}" as JSON.`);
                    }}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:border-cyan-500 transition-colors"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Protocol Schema (.json)</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Copy to Clipboard
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!hexText}
                    onClick={() => handleCopy('hex', hexText, 'Hexadecimal bytes')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-40 transition-colors"
                  >
                    {copiedKey === 'hex' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Copy Hex</span>
                  </button>

                  <button
                    type="button"
                    disabled={!binText}
                    onClick={() => handleCopy('bin', binText, 'Binary bit string')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-40 transition-colors"
                  >
                    {copiedKey === 'bin' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Copy Binary</span>
                  </button>

                  <button
                    type="button"
                    disabled={!encodedPacket.success && decodedPacket.fields.length === 0}
                    onClick={() => handleCopy('json', serializableDecoded(), 'Decoded JSON')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-40 transition-colors"
                  >
                    {copiedKey === 'json' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Copy JSON</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
