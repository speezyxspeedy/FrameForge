import React, { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { BitRange, ByteRange } from '../../types/protocol';
import { inspectByteAtOffset } from '../../engine/bitVisualizer';

interface BitVisualizerPanelProps {
  bytes: Uint8Array;
  selectedOffset: number;
  fieldMappings: ByteRange[];
  bitRanges: BitRange[];
  manualEditEnabled: boolean;
  onToggleManualEdit: () => void;
  onToggleBit: (byteOffset: number, bitIndex: number) => void;
  compact?: boolean;
}

export const BitVisualizerPanel: React.FC<BitVisualizerPanelProps> = ({
  bytes,
  selectedOffset,
  fieldMappings,
  bitRanges,
  manualEditEnabled,
  onToggleManualEdit,
  onToggleBit,
  compact = false,
}) => {
  const [selectedBitIndex, setSelectedBitIndex] = useState<number>(7);
  const detail = inspectByteAtOffset(bytes, selectedOffset, fieldMappings, bitRanges);

  if (!detail) {
    return (
      <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
        Select a byte to inspect its 8-bit decomposition.
      </div>
    );
  }

  const activeBit = detail.bits.find((b) => b.bitIndex === selectedBitIndex) ?? detail.bits[0];

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Bit Visualizer
          </span>
          <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums text-cyan-700 dark:text-cyan-400">
            Offset 0x{detail.offset.toString(16).toUpperCase().padStart(4, '0')} (0x{detail.hex})
          </span>
          {detail.mappedField && (
            <>
              <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {detail.mappedField.fieldName}
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleManualEdit}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
            manualEditEnabled
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300'
              : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          {manualEditEnabled ? (
            <>
              <Unlock className="w-3.5 h-3.5" />
              <span>Bit Edit: Unlocked</span>
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5" />
              <span>Enable Bit Toggle</span>
            </>
          )}
        </button>
      </div>

      {/* 8-Bit Interactive Grid: Bit 7 (MSB) -> Bit 0 (LSB) */}
      <div className="grid grid-cols-8 gap-1.5">
        {detail.bits.map((bit) => {
          const isSelected = bit.bitIndex === selectedBitIndex;
          return (
            <button
              key={bit.bitIndex}
              type="button"
              onClick={() => {
                setSelectedBitIndex(bit.bitIndex);
                if (manualEditEnabled) {
                  onToggleBit(detail.offset, bit.bitIndex);
                }
              }}
              title={
                manualEditEnabled
                  ? `Click to toggle Bit ${bit.bitIndex} (weight ${bit.weight})`
                  : `Select Bit ${bit.bitIndex} (weight ${bit.weight})`
              }
              className={`flex flex-col items-center justify-center rounded-md border py-2 px-1 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                isSelected
                  ? 'border-cyan-500 bg-cyan-500/12 dark:bg-cyan-500/15'
                  : bit.value === 1
                    ? 'border-blue-500/40 bg-blue-500/10 dark:bg-blue-500/12 hover:border-blue-400'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
              style={
                bit.bitFieldColor && !isSelected
                  ? { borderColor: `${bit.bitFieldColor}88` }
                  : undefined
              }
            >
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 leading-none">
                b{bit.bitIndex}
              </span>
              <span
                className={`mt-1 text-base font-mono font-bold tabular-nums leading-none ${
                  bit.value === 1
                    ? 'text-cyan-700 dark:text-cyan-300'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {bit.value}
              </span>
              <span className="mt-1 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 leading-none">
                {bit.weight}
              </span>
              {bit.bitFieldName && !compact && (
                <span
                  className="mt-1 text-[9px] font-mono truncate max-w-full px-0.5 text-slate-700 dark:text-slate-300"
                  style={{ color: bit.bitFieldColor }}
                >
                  {bit.bitFieldName}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Bit Details + MSB/LSB Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-slate-100/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
          <span>
            Bit {activeBit.bitIndex}{' '}
            {activeBit.isMsb ? '(MSB)' : activeBit.isLsb ? '(LSB)' : ''}
          </span>
          <span className="text-slate-400 dark:text-slate-600">·</span>
          <span>State: {activeBit.value}</span>
          <span className="text-slate-400 dark:text-slate-600">·</span>
          <span>
            Contribution: {activeBit.value} × 2^{activeBit.bitIndex} ={' '}
            <strong className="text-cyan-700 dark:text-cyan-400">
              {activeBit.contribution}
            </strong>
          </span>
          {activeBit.bitFieldName && (
            <>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span>
                Bitfield:{' '}
                <strong style={{ color: activeBit.bitFieldColor }}>
                  {activeBit.bitFieldName}
                </strong>
              </span>
            </>
          )}
        </div>

        <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          Sum = {detail.decimalUnsigned} (0x{detail.hex})
        </div>
      </div>

      {!compact && (
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          <strong className="text-slate-700 dark:text-slate-300 font-medium">
            MSB vs. LSB:
          </strong>{' '}
          Bit 7 (leftmost, weight 128) is the Most Significant Bit (MSB); Bit 0
          (rightmost, weight 1) is the Least Significant Bit (LSB). Toggling a bit
          in edit mode mutates this byte immediately and re-decodes the packet
          against the active schema.
        </p>
      )}
    </div>
  );
};
