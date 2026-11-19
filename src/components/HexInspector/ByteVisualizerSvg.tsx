import React, { useMemo } from 'react';
import type { ByteRange } from '../../types/protocol';
import { formatByteHex } from '../../utilities/formatters';

interface ByteVisualizerSvgProps {
  bytes: Uint8Array;
  fieldMappings: ByteRange[];
  selectedByteOffset: number | null;
  selectedFieldId: string | null;
  onSelectByte: (offset: number) => void;
  onSelectField?: (fieldId: string) => void;
  maxDisplayBytes?: number;
}

export const ByteVisualizerSvg: React.FC<ByteVisualizerSvgProps> = ({
  bytes,
  fieldMappings,
  selectedByteOffset,
  selectedFieldId,
  onSelectByte,
  onSelectField,
  maxDisplayBytes = 128,
}) => {
  const displayCount = Math.min(bytes.length, maxDisplayBytes);
  const cellWidth = 34;
  const cellHeight = 42;
  const fieldBarHeight = 20;
  const topPad = 24;
  const svgWidth = Math.max(360, displayCount * cellWidth + 16);
  const svgHeight = topPad + fieldBarHeight + cellHeight + 24;

  const byteToField = useMemo(() => {
    const map = new Map<number, ByteRange>();
    for (const fm of fieldMappings) {
      for (let i = fm.startOffset; i < fm.endOffset && i < displayCount; i++) {
        map.set(i, fm);
      }
    }
    return map;
  }, [fieldMappings, displayCount]);

  if (bytes.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-md">
        No encoded bytes to visualize yet. Add fields or fix validation errors to inspect the byte layout.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto pb-1">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        role="img"
        aria-label={`Binary packet byte map showing ${bytes.length} bytes`}
        className="block font-mono"
      >
        {/* Field bracket spans across top */}
        {fieldMappings.map((fm) => {
          if (fm.startOffset >= displayCount || fm.byteLength === 0) return null;
          const visibleEnd = Math.min(fm.endOffset, displayCount);
          const x = 8 + fm.startOffset * cellWidth;
          const w = Math.max(cellWidth - 2, (visibleEnd - fm.startOffset) * cellWidth - 2);
          const isSelected = selectedFieldId === fm.fieldId;

          return (
            <g
              key={`${fm.fieldId}-${fm.startOffset}`}
              onClick={() => {
                onSelectByte(fm.startOffset);
                onSelectField?.(fm.fieldId);
              }}
              className="cursor-pointer"
            >
              <rect
                x={x}
                y={6}
                width={w}
                height={fieldBarHeight + 10}
                rx={3}
                fill={fm.color}
                fillOpacity={isSelected ? 0.34 : 0.18}
                stroke={fm.color}
                strokeWidth={isSelected ? 1.5 : 1}
                strokeOpacity={isSelected ? 1 : 0.65}
              />
              <text
                x={x + w / 2}
                y={22}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                className="fill-slate-800 dark:fill-slate-100 pointer-events-none select-none"
              >
                {w < 44
                  ? fm.fieldName.slice(0, 4)
                  : w < 72
                    ? fm.fieldName.slice(0, 8)
                    : fm.fieldName.slice(0, Math.floor(w / 7.5))}
              </text>
            </g>
          );
        })}

        {/* Individual byte cells */}
        {Array.from({ length: displayCount }, (_, idx) => {
          const byte = bytes[idx];
          const fm = byteToField.get(idx);
          const x = 8 + idx * cellWidth;
          const y = topPad + fieldBarHeight;
          const isByteSelected = selectedByteOffset === idx;
          const isFieldHighlighted = fm && selectedFieldId === fm.fieldId;
          const strokeColor = isByteSelected
            ? '#06B6D4'
            : fm?.color ?? '#475569';

          return (
            <g
              key={idx}
              onClick={() => {
                onSelectByte(idx);
                if (fm) onSelectField?.(fm.fieldId);
              }}
              className="cursor-pointer"
            >
              <rect
                x={x}
                y={y}
                width={cellWidth - 2}
                height={cellHeight}
                rx={3}
                fill={isByteSelected ? '#06B6D4' : fm?.color ?? '#334155'}
                fillOpacity={isByteSelected ? 0.28 : isFieldHighlighted ? 0.16 : 0.08}
                stroke={strokeColor}
                strokeWidth={isByteSelected ? 2 : 1}
                strokeOpacity={isByteSelected ? 1 : 0.45}
              />
              <text
                x={x + (cellWidth - 2) / 2}
                y={y + 18}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                className="fill-slate-900 dark:fill-slate-100 pointer-events-none select-none"
              >
                {formatByteHex(byte)}
              </text>
              <text
                x={x + (cellWidth - 2) / 2}
                y={y + 33}
                textAnchor="middle"
                fontSize="9"
                className="fill-slate-500 dark:fill-slate-400 pointer-events-none select-none"
              >
                +{idx}
              </text>
            </g>
          );
        })}
      </svg>

      {bytes.length > maxDisplayBytes && (
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 px-2">
          Showing first {maxDisplayBytes} of {bytes.length} bytes in visual map. Use Hex Inspector for the full buffer.
        </div>
      )}
    </div>
  );
};
