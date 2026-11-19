import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import type { EncodedPacket, ProtocolSchema } from '../../types/protocol';
import { decodePacket } from '../../engine/binaryReader';
import { toggleBitInBytes } from '../../engine/bitVisualizer';
import { bytesToHexString } from '../../engine/binaryWriter';
import { copyToClipboard, formatByteSize } from '../../utilities/formatters';

interface DecoderViewProps {
  schema: ProtocolSchema;
  encodedPacket: EncodedPacket;
  hexInput: string;
  onChangeHexInput: (hex: string) => void;
  onSendBytesToInspector: (bytes: Uint8Array) => void;
}

export const DecoderView: React.FC<DecoderViewProps> = ({
  schema,
  encodedPacket,
  hexInput,
  onChangeHexInput,
  onSendBytesToInspector,
}) => {
  const [strictMode, setStrictMode] = useState<boolean>(Boolean(schema.strictDecoding ?? true));
  const [copiedJson, setCopiedJson] = useState(false);

  const decoded = useMemo(
    () => decodePacket(schema, hexInput, { strictMode }),
    [schema, hexInput, strictMode]
  );

  const handleLoadActive = () => {
    if (encodedPacket.hexString) {
      onChangeHexInput(encodedPacket.hexString);
    }
  };

  const handleCorruptBit = () => {
    if (decoded.bytes.length === 0) return;
    const targetByte = Math.min(1, decoded.bytes.length - 1);
    const mutated = toggleBitInBytes(decoded.bytes, targetByte, 0);
    onChangeHexInput(bytesToHexString(mutated));
  };

  const handleCopyDecodedJson = async () => {
    const out: Record<string, unknown> = {};
    for (const f of decoded.fields) {
      out[f.fieldName] =
        f.value instanceof Uint8Array ? bytesToHexString(f.value) : f.value;
    }
    const ok = await copyToClipboard(JSON.stringify(out, null, 2));
    if (ok) {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1500);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-5 space-y-4">
      {/* Header + Hex Input Card */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Binary Packet Decoder
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Decode raw hexadecimal frames using active schema <strong className="font-mono text-slate-700 dark:text-slate-200">{schema.name}</strong> ({schema.endianness}-endian).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none px-2">
              <input
                type="checkbox"
                checked={strictMode}
                onChange={(e) => setStrictMode(e.target.checked)}
                className="rounded accent-cyan-500"
              />
              <span>Strict Trailing-Byte Check</span>
            </label>

            <button
              type="button"
              onClick={handleLoadActive}
              disabled={!encodedPacket.hexString}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 disabled:opacity-40 whitespace-nowrap"
            >
              Load Builder Output
            </button>

            <button
              type="button"
              onClick={handleCorruptBit}
              disabled={decoded.bytes.length === 0}
              title="Flip 1 bit to test error and checksum detection"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 disabled:opacity-40 whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Flip 1 Bit</span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Hexadecimal Input (supports spaces, line breaks, commas, and 0x prefixes)</span>
            <span className="font-mono tabular-nums">
              {decoded.byteLength} parsed bytes
            </span>
          </div>
          <textarea
            rows={4}
            value={hexInput}
            onChange={(e) => onChangeHexInput(e.target.value)}
            placeholder="Paste hex bytes, e.g. A1 02 12 34 41 BE 00 00..."
            className="w-full p-3 font-mono text-xs rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500 leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 text-xs">
            {decoded.success ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Decoded {decoded.fields.length} field(s) cleanly</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                <XCircle className="w-4 h-4" />
                <span>Decoding failed ({decoded.errors.length} error{decoded.errors.length > 1 ? 's' : ''})</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={decoded.fields.length === 0}
              onClick={handleCopyDecodedJson}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 disabled:opacity-40"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedJson ? 'Copied JSON' : 'Copy JSON'}</span>
            </button>

            <button
              type="button"
              disabled={decoded.bytes.length === 0}
              onClick={() => onSendBytesToInspector(decoded.bytes)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40"
            >
              <span>Inspect in Hex View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Errors & Warnings */}
      {decoded.errors.length > 0 && (
        <div className="bg-red-500/8 dark:bg-red-500/10 border border-red-500/40 rounded-lg p-4 space-y-2">
          <div className="text-xs font-semibold text-red-700 dark:text-red-300">
            Decoding Diagnostics
          </div>
          {decoded.errors.map((err, idx) => (
            <div
              key={idx}
              className="text-xs font-mono text-red-700 dark:text-red-300 space-y-0.5 pb-2 last:pb-0 border-b last:border-b-0 border-red-500/20"
            >
              <div className="font-semibold">
                {err.code}
                {err.fieldName ? ` · Field: ${err.fieldName}` : ''}
                {err.byteOffset !== undefined ? ` · Offset: 0x${err.byteOffset.toString(16).toUpperCase()} (${err.byteOffset})` : ''}
              </div>
              <div className="font-sans">{err.message}</div>
              {(err.expected || err.received) && (
                <div className="text-[11px] opacity-90">
                  Expected: {err.expected ?? '—'} · Received: {err.received ?? '—'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {decoded.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3.5 space-y-1">
          {decoded.warnings.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Checksum Verification Banner */}
      {decoded.checksum && (
        <div
          className={`rounded-lg p-3.5 border flex flex-wrap items-center justify-between gap-2 text-xs ${
            decoded.checksum.valid
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-500/10 border-red-500/40 text-red-800 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {decoded.checksum.valid ? (
              <ShieldCheck className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>
              Packet Checksum ({decoded.checksum.algorithm}):{' '}
              {decoded.checksum.valid ? 'VERIFIED' : 'MISMATCH DETECTED'}
            </span>
          </div>
          <div className="font-mono tabular-nums">
            Range [{decoded.checksum.startOffset}..{decoded.checksum.endOffset}) · Packet: 0x
            {decoded.checksum.actualHex} · Expected: 0x{decoded.checksum.expectedHex}
          </div>
        </div>
      )}

      {/* Decoded Output Table */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Decoded Fields
          </span>
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {decoded.fields.length} decoded · {decoded.trailingBytes.length} trailing bytes
          </span>
        </div>

        {decoded.fields.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No fields decoded yet. Paste valid hex bytes matching the active schema above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pl-4 pr-2 font-medium">Field</th>
                  <th className="py-2 px-2 font-medium">Type</th>
                  <th className="py-2 px-2 font-medium">Decoded Value</th>
                  <th className="py-2 px-2 font-medium">Offset</th>
                  <th className="py-2 px-2 font-medium">Size</th>
                  <th className="py-2 pl-2 pr-4 font-medium">Raw Bytes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono">
                {decoded.fields.map((entry) => (
                  <tr
                    key={`${entry.fieldId}-${entry.startOffset}`}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 pl-4 pr-2 font-medium text-slate-900 dark:text-slate-100">
                      {entry.fieldName}
                    </td>
                    <td className="py-2.5 px-2 text-slate-500 dark:text-slate-400">
                      {entry.fieldType}
                      {entry.bitRange
                        ? ` (${entry.bitRange.bitWidth}b @${entry.bitRange.bitOffset})`
                        : ''}
                    </td>
                    <td className="py-2.5 px-2 text-cyan-700 dark:text-cyan-300 font-semibold break-all">
                      {entry.formattedValue}
                    </td>
                    <td className="py-2.5 px-2 tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {entry.startOffset} (0x{entry.startOffset.toString(16).toUpperCase().padStart(2, '0')})
                    </td>
                    <td className="py-2.5 px-2 tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatByteSize(entry.byteLength)}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-slate-600 dark:text-slate-400 break-all">
                      {entry.rawHex}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
