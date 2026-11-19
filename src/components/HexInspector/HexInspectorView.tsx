import React, { useMemo, useState } from 'react';
import { Check, Copy, RotateCcw, Search } from 'lucide-react';
import type { BitRange, ByteRange, DecodedPacket } from '../../types/protocol';
import {
  byteToAsciiChar,
  findFieldAtOffset,
  inspectByteAtOffset,
} from '../../engine/bitVisualizer';
import { parseHexString } from '../../engine/binaryReader';
import {
  copyToClipboard,
  formatByteHex,
  formatHexOffset,
} from '../../utilities/formatters';
import { searchBytesAsync } from '../../workers/binaryWorker';
import { BitVisualizerPanel } from './BitVisualizerPanel';
import { ByteVisualizerSvg } from './ByteVisualizerSvg';

interface HexInspectorViewProps {
  bytes: Uint8Array;
  hasManualEdits: boolean;
  fieldMappings: ByteRange[];
  bitRanges: BitRange[];
  decodedPacket: DecodedPacket;
  selectedByteOffset: number | null;
  onSelectByte: (offset: number) => void;
  onEditByte: (offset: number, newValue: number) => void;
  onToggleBit: (offset: number, bitIndex: number) => void;
  onResetManualEdits: () => void;
}

export const HexInspectorView: React.FC<HexInspectorViewProps> = ({
  bytes,
  hasManualEdits,
  fieldMappings,
  bitRanges,
  decodedPacket,
  selectedByteOffset,
  onSelectByte,
  onEditByte,
  onToggleBit,
  onResetManualEdits,
}) => {
  const [bytesPerRow, setBytesPerRow] = useState<8 | 16 | 32>(16);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [searchMode, setSearchMode] = useState<'hex' | 'ascii'>('hex');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNeedleLen, setSearchNeedleLen] = useState(0);
  const [manualBitEdit, setManualBitEdit] = useState(true);
  const [editingByteOffset, setEditingByteOffset] = useState<number | null>(null);
  const [editDraftHex, setEditDraftHex] = useState('');
  const [copiedSelection, setCopiedSelection] = useState(false);

  const activeOffset =
    selectedByteOffset !== null && selectedByteOffset < bytes.length
      ? selectedByteOffset
      : bytes.length > 0
        ? 0
        : null;

  const selectionBounds = useMemo(() => {
    if (rangeAnchor !== null && rangeEnd !== null) {
      return {
        start: Math.min(rangeAnchor, rangeEnd),
        end: Math.max(rangeAnchor, rangeEnd),
      };
    }
    if (activeOffset !== null) {
      return { start: activeOffset, end: activeOffset };
    }
    return null;
  }, [rangeAnchor, rangeEnd, activeOffset]);

  const byteDetail = useMemo(
    () =>
      activeOffset !== null
        ? inspectByteAtOffset(bytes, activeOffset, fieldMappings, bitRanges)
        : null,
    [bytes, activeOffset, fieldMappings, bitRanges]
  );

  const searchHighlightSet = useMemo(() => {
    const set = new Set<number>();
    for (const start of searchMatches) {
      for (let i = 0; i < searchNeedleLen; i++) {
        set.add(start + i);
      }
    }
    return set;
  }, [searchMatches, searchNeedleLen]);

  const handleRunSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchMatches([]);
      setSearchNeedleLen(0);
      return;
    }

    let needle: Uint8Array;
    if (searchMode === 'hex') {
      const parsed = parseHexString(trimmed);
      if (!parsed.ok) {
        setSearchError(parsed.error.message);
        setSearchMatches([]);
        return;
      }
      needle = parsed.bytes;
    } else {
      needle = new TextEncoder().encode(trimmed);
    }

    if (needle.length === 0) {
      setSearchMatches([]);
      setSearchNeedleLen(0);
      return;
    }

    const matches = await searchBytesAsync(bytes, needle);
    setSearchMatches(matches);
    setSearchNeedleLen(needle.length);
    if (matches.length > 0) {
      onSelectByte(matches[0]);
      setRangeAnchor(matches[0]);
      setRangeEnd(matches[0] + needle.length - 1);
    }
  };

  const handleByteClick = (offset: number, shiftKey: boolean) => {
    if (shiftKey && activeOffset !== null) {
      setRangeAnchor(activeOffset);
      setRangeEnd(offset);
    } else {
      onSelectByte(offset);
      setRangeAnchor(offset);
      setRangeEnd(offset);
    }
  };

  const startByteEdit = (offset: number) => {
    setEditingByteOffset(offset);
    setEditDraftHex(formatByteHex(bytes[offset]));
  };

  const commitByteEdit = () => {
    if (editingByteOffset === null) return;
    const clean = editDraftHex.trim().replace(/^0x/i, '');
    if (/^[0-9a-fA-F]{1,2}$/.test(clean)) {
      const val = Number.parseInt(clean, 16);
      onEditByte(editingByteOffset, val);
    }
    setEditingByteOffset(null);
  };

  const handleCopySelected = async () => {
    if (!selectionBounds || bytes.length === 0) return;
    const slice = bytes.subarray(selectionBounds.start, selectionBounds.end + 1);
    const hex = Array.from(slice)
      .map((b) => formatByteHex(b))
      .join(' ');
    const ok = await copyToClipboard(hex);
    if (ok) {
      setCopiedSelection(true);
      setTimeout(() => setCopiedSelection(false), 1500);
    }
  };

  const rowCount = Math.ceil(bytes.length / bytesPerRow);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-5 space-y-4">
      {/* Control Bar */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Hex Inspector
          </h1>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {bytes.length} bytes
          </span>

          {/* Bytes per row */}
          <div className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-800 text-xs">
            {([8, 16, 32] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBytesPerRow(n)}
                className={`px-2 py-0.5 font-mono rounded transition-colors ${
                  bytesPerRow === n
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {n}B/row
              </button>
            ))}
          </div>

          {hasManualEdits && (
            <button
              type="button"
              onClick={onResetManualEdits}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-amber-500/12 border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Revert Manual Edits</span>
            </button>
          )}
        </div>

        {/* Search & Copy Selection */}
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleRunSearch} className="flex items-center gap-1.5">
            <select
              aria-label="Search mode"
              value={searchMode}
              onChange={(e) => setSearchMode(e.target.value as 'hex' | 'ascii')}
              className="h-7 px-2 text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            >
              <option value="hex">Hex</option>
              <option value="ascii">ASCII</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchMode === 'hex' ? 'e.g. 12 34' : 'e.g. Hello'}
              className="h-7 w-36 px-2 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="h-7 px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white"
            >
              <Search className="w-3 h-3" />
              <span>Find</span>
            </button>
          </form>

          <button
            type="button"
            disabled={!selectionBounds}
            onClick={handleCopySelected}
            className="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 disabled:opacity-40"
          >
            {copiedSelection ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>
              Copy{' '}
              {selectionBounds
                ? `${selectionBounds.end - selectionBounds.start + 1}B`
                : 'Selection'}
            </span>
          </button>
        </div>
      </div>

      {(searchError || (searchQuery.trim() && searchMatches.length >= 0 && searchNeedleLen > 0)) && (
        <div className="text-xs px-1 flex items-center gap-3">
          {searchError ? (
            <span className="text-red-600 dark:text-red-400">{searchError}</span>
          ) : (
            <span className="text-slate-600 dark:text-slate-400 font-mono">
              Search matches: {searchMatches.length}
              {searchMatches.length > 0 &&
                ` (offsets: ${searchMatches
                  .slice(0, 8)
                  .map((m) => `0x${m.toString(16).toUpperCase()}`)
                  .join(', ')})`}
            </span>
          )}
        </div>
      )}

      {/* Field Byte Map Strip */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
        <ByteVisualizerSvg
          bytes={bytes}
          fieldMappings={fieldMappings}
          selectedByteOffset={activeOffset}
          selectedFieldId={byteDetail?.mappedField?.fieldId ?? null}
          onSelectByte={(off) => {
            onSelectByte(off);
            setRangeAnchor(off);
            setRangeEnd(off);
          }}
        />
      </div>

      {/* Main Split: Synchronized 3-Column Hex Editor (Left 7) | Byte Inspector & Bit Visualizer (Right 5) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* 3-Column Hex Grid */}
        <div className="xl:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Click to select · Shift+Click for range · Double-click any hex byte to edit</span>
            <span className="font-mono">Offset · Hex · ASCII</span>
          </div>

          {bytes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No packet bytes loaded. Encode a packet in Packet Builder or import a `.bin` / `.hex` file.
            </div>
          ) : (
            <div className="overflow-x-auto p-3 font-mono text-xs leading-6">
              {/* Column header indices */}
              <div className="flex items-center gap-4 pb-1.5 mb-1.5 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 select-none">
                <div className="w-20 shrink-0">OFFSET</div>
                <div
                  className="grid gap-1 shrink-0"
                  style={{
                    gridTemplateColumns: `repeat(${bytesPerRow}, minmax(24px, 24px))`,
                  }}
                >
                  {Array.from({ length: bytesPerRow }, (_, col) => (
                    <div key={col} className="text-center">
                      {col.toString(16).toUpperCase().padStart(2, '0')}
                    </div>
                  ))}
                </div>
                <div className="pl-2 border-l border-slate-200 dark:border-slate-800">
                  ASCII
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
                {Array.from({ length: rowCount }, (_, rowIdx) => {
                  const rowStart = rowIdx * bytesPerRow;
                  const rowLen = Math.min(bytesPerRow, bytes.length - rowStart);

                  return (
                    <div key={rowStart} className="flex items-center gap-4">
                      {/* Col 1: Hex Offset */}
                      <div className="w-20 shrink-0 text-slate-400 dark:text-slate-500 tabular-nums select-none">
                        {formatHexOffset(rowStart)}
                      </div>

                      {/* Col 2: Hex Bytes */}
                      <div
                        className="grid gap-1 shrink-0"
                        style={{
                          gridTemplateColumns: `repeat(${bytesPerRow}, minmax(24px, 24px))`,
                        }}
                      >
                        {Array.from({ length: bytesPerRow }, (_, colIdx) => {
                          if (colIdx >= rowLen) {
                            return <div key={colIdx} />;
                          }
                          const offset = rowStart + colIdx;
                          const byteVal = bytes[offset];
                          const fm = findFieldAtOffset(offset, fieldMappings);
                          const isPrimary = activeOffset === offset;
                          const inRange =
                            selectionBounds !== null &&
                            offset >= selectionBounds.start &&
                            offset <= selectionBounds.end;
                          const isSearchHit = searchHighlightSet.has(offset);

                          if (editingByteOffset === offset) {
                            return (
                              <input
                                key={colIdx}
                                type="text"
                                maxLength={2}
                                value={editDraftHex}
                                onChange={(e) => setEditDraftHex(e.target.value.toUpperCase())}
                                onBlur={commitByteEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitByteEdit();
                                  if (e.key === 'Escape') setEditingByteOffset(null);
                                }}
                                autoFocus
                                className="w-6 h-6 text-center font-mono text-xs bg-cyan-500/20 border border-cyan-500 rounded text-slate-900 dark:text-white focus:outline-none"
                              />
                            );
                          }

                          return (
                            <button
                              key={colIdx}
                              type="button"
                              onClick={(e) => handleByteClick(offset, e.shiftKey)}
                              onDoubleClick={() => startByteEdit(offset)}
                              title={`Offset 0x${offset.toString(16).toUpperCase()} (${offset}) · 0x${formatByteHex(byteVal)} (${byteVal})${fm ? ` · ${fm.fieldName}` : ''}`}
                              className={`h-6 w-6 rounded text-center tabular-nums transition-colors ${
                                isPrimary
                                  ? 'bg-cyan-600 text-white font-semibold'
                                  : isSearchHit
                                    ? 'bg-amber-500/30 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500'
                                    : inRange
                                      ? 'bg-blue-500/25 text-blue-900 dark:text-blue-200'
                                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                              style={
                                !isPrimary && !isSearchHit && !inRange && fm
                                  ? {
                                      backgroundColor: `${fm.color}1C`,
                                      borderBottom: `1.5px solid ${fm.color}88`,
                                    }
                                  : undefined
                              }
                            >
                              {formatByteHex(byteVal)}
                            </button>
                          );
                        })}
                      </div>

                      {/* Col 3: Synchronized ASCII */}
                      <div className="pl-2 border-l border-slate-200 dark:border-slate-800 flex items-center shrink-0">
                        {Array.from({ length: rowLen }, (_, colIdx) => {
                          const offset = rowStart + colIdx;
                          const byteVal = bytes[offset];
                          const isPrimary = activeOffset === offset;
                          const inRange =
                            selectionBounds !== null &&
                            offset >= selectionBounds.start &&
                            offset <= selectionBounds.end;
                          const isPrintable = byteVal >= 0x20 && byteVal <= 0x7e;

                          return (
                            <button
                              key={colIdx}
                              type="button"
                              onClick={(e) => handleByteClick(offset, e.shiftKey)}
                              className={`w-[11px] text-center leading-6 rounded-[2px] ${
                                isPrimary
                                  ? 'bg-cyan-600 text-white font-bold'
                                  : inRange
                                    ? 'bg-blue-500/25 text-blue-900 dark:text-blue-200'
                                    : isPrintable
                                      ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                      : 'text-slate-400 dark:text-slate-600'
                              }`}
                            >
                              {byteToAsciiChar(byteVal)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Byte Inspector + Interactive 8-Bit Visualizer + Live Decoded Feedback */}
        <div className="xl:col-span-5 space-y-4">
          {/* Byte Inspector */}
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Selected Byte Inspector
              </h2>
              {byteDetail && (
                <button
                  type="button"
                  onClick={() => startByteEdit(byteDetail.offset)}
                  className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  Edit Byte Hex
                </button>
              )}
            </div>

            {byteDetail ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono tabular-nums">
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                    Offset
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    0x{byteDetail.offset.toString(16).toUpperCase().padStart(4, '0')} ({byteDetail.offset})
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                    Hexadecimal
                  </div>
                  <div className="mt-0.5 font-semibold text-cyan-700 dark:text-cyan-400">
                    0x{byteDetail.hex}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                    Decimal (u8 / i8)
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {byteDetail.decimalUnsigned} / {byteDetail.decimalSigned}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 col-span-2">
                  <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                    Binary (8-bit)
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100 tracking-wider">
                    {byteDetail.binary.slice(0, 4)} {byteDetail.binary.slice(4)}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                    ASCII
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {byteDetail.isPrintableAscii ? `'${byteDetail.ascii}'` : 'Non-printable'}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-3">
                  <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                    Mapped Schema Field
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {byteDetail.mappedField
                      ? `${byteDetail.mappedField.fieldName} (${byteDetail.mappedField.fieldType}, bytes ${byteDetail.mappedField.startOffset}..${byteDetail.mappedField.endOffset - 1})`
                      : 'Unmapped / Trailing byte'}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a byte in the hex grid to inspect its values.
              </p>
            )}
          </div>

          {/* Interactive Bit Visualizer */}
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            {activeOffset !== null ? (
              <BitVisualizerPanel
                bytes={bytes}
                selectedOffset={activeOffset}
                fieldMappings={fieldMappings}
                bitRanges={bitRanges}
                manualEditEnabled={manualBitEdit}
                onToggleManualEdit={() => setManualBitEdit((v) => !v)}
                onToggleBit={onToggleBit}
              />
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No bytes available for bit-level inspection.
              </p>
            )}
          </div>

          {/* Live Re-decode Status after Bit/Byte Edits */}
          {bytes.length > 0 && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Live Schema Interpretation
                </span>
                <span
                  className={`font-mono font-medium ${
                    decodedPacket.success
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {decodedPacket.success ? 'Valid Frame' : `${decodedPacket.errors.length} Error(s)`}
                </span>
              </div>

              {decodedPacket.checksum && (
                <div
                  className={`text-xs font-mono px-2.5 py-1.5 rounded border ${
                    decodedPacket.checksum.valid
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300'
                  }`}
                >
                  {decodedPacket.checksum.algorithm}: stored 0x{decodedPacket.checksum.actualHex} ·
                  computed 0x{decodedPacket.checksum.expectedHex} (
                  {decodedPacket.checksum.valid ? 'VALID' : 'MISMATCH'})
                </div>
              )}

              {decodedPacket.fields.length > 0 && (
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800/70 text-xs font-mono">
                  {decodedPacket.fields.map((f) => (
                    <div
                      key={`${f.fieldId}-${f.startOffset}`}
                      className="py-1.5 flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-500 dark:text-slate-400 truncate">
                        {f.fieldName}
                      </span>
                      <span className="text-slate-900 dark:text-slate-100 truncate">
                        {f.formattedValue}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
