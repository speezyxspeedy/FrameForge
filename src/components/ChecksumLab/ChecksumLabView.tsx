import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Copy, ShieldCheck, XCircle } from 'lucide-react';
import type { ChecksumAlgorithm, ChecksumCalculation } from '../../types/protocol';
import { CHECKSUM_SPECS, calculateChecksum } from '../../engine/checksumEngine';
import { parseHexString } from '../../engine/binaryReader';
import { bytesToHexString } from '../../engine/binaryWriter';
import { copyToClipboard } from '../../utilities/formatters';
import { runChecksumAsync } from '../../workers/binaryWorker';

interface ChecksumLabViewProps {
  activeBytes: Uint8Array;
  onLog: (level: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}

const ASCII_VECTOR_HEX = '31 32 33 34 35 36 37 38 39'; // "123456789"

export const ChecksumLabView: React.FC<ChecksumLabViewProps> = ({
  activeBytes,
  onLog,
}) => {
  const [algorithm, setAlgorithm] = useState<ChecksumAlgorithm>('crc16_ccitt_false');
  const [hexInput, setHexInput] = useState<string>(ASCII_VECTOR_HEX);
  const [startOffset, setStartOffset] = useState<number>(0);
  const [endOffset, setEndOffset] = useState<string>('');
  const [expectedHex, setExpectedHex] = useState<string>('29B1');
  const [copied, setCopied] = useState(false);
  const [calcResult, setCalcResult] = useState<ChecksumCalculation | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const parsedInput = useMemo(() => parseHexString(hexInput), [hexInput]);
  const bytes = parsedInput.ok ? parsedInput.bytes : new Uint8Array(0);
  const effectiveEnd =
    endOffset.trim() === ''
      ? bytes.length
      : Math.min(bytes.length, Math.max(0, Number.parseInt(endOffset, 10) || 0));
  const effectiveStart = Math.min(bytes.length, Math.max(0, startOffset));

  useEffect(() => {
    if (!parsedInput.ok) {
      setCalcResult(null);
      setCalcError(parsedInput.error.message);
      return;
    }
    if (effectiveStart > effectiveEnd) {
      setCalcResult(null);
      setCalcError(
        `Start offset (${effectiveStart}) cannot exceed end offset (${effectiveEnd}).`
      );
      return;
    }

    let cancelled = false;
    setCalcError(null);

    runChecksumAsync(algorithm, bytes, effectiveStart, effectiveEnd)
      .then((res) => {
        if (!cancelled) {
          setCalcResult(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCalcResult(null);
          setCalcError(err instanceof Error ? err.message : 'Checksum calculation failed.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [algorithm, bytes, effectiveStart, effectiveEnd, parsedInput]);

  // All-algorithm comparison matrix for the current slice (for buffers <= 64KB)
  const allResults = useMemo(() => {
    if (!parsedInput.ok || effectiveStart > effectiveEnd || bytes.length > 65536) {
      return null;
    }
    return (Object.keys(CHECKSUM_SPECS) as ChecksumAlgorithm[]).map((alg) => ({
      spec: CHECKSUM_SPECS[alg],
      result: calculateChecksum(alg, bytes, effectiveStart, effectiveEnd),
    }));
  }, [parsedInput, bytes, effectiveStart, effectiveEnd]);

  const spec = CHECKSUM_SPECS[algorithm];

  const comparisonStatus = useMemo(() => {
    const clean = expectedHex.trim().replace(/^0x/i, '').toUpperCase();
    if (!clean || !calcResult) return null;
    if (!/^[0-9A-F]+$/.test(clean)) {
      return { valid: false, error: 'Expected checksum contains non-hex characters.' };
    }
    const normalizedExpected = clean.padStart(calcResult.byteLength * 2, '0');
    const matched = normalizedExpected === calcResult.hex;
    return {
      valid: matched,
      normalizedExpected,
      error: null,
    };
  }, [expectedHex, calcResult]);

  const handleLoadActivePacket = () => {
    if (activeBytes.length === 0) return;
    setHexInput(bytesToHexString(activeBytes));
    setStartOffset(0);
    setEndOffset('');
    setExpectedHex('');
    onLog('info', `Loaded ${activeBytes.length} active packet bytes into Checksum Lab.`);
  };

  const handleLoadVector = () => {
    setHexInput(ASCII_VECTOR_HEX);
    setStartOffset(0);
    setEndOffset('');
    setExpectedHex(spec.checkVector123456789);
    onLog('info', `Loaded standard ASCII "123456789" test vector for ${spec.name}.`);
  };

  const handleCopyChecksum = async () => {
    if (!calcResult) return;
    const ok = await copyToClipboard(`0x${calcResult.hex}`);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-5 space-y-4">
      {/* Algorithm Selector & Header */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Checksum Lab
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Compute and verify XOR-8, CRC-8/ATM, CRC-16/CCITT-FALSE, and CRC-32/ISO-HDLC over arbitrary hex ranges.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLoadVector}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              Load Vector "123456789"
            </button>
            <button
              type="button"
              onClick={handleLoadActivePacket}
              disabled={activeBytes.length === 0}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 whitespace-nowrap"
            >
              Use Active Packet ({activeBytes.length}B)
            </button>
          </div>
        </div>

        {/* Algorithm Segmented Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(Object.keys(CHECKSUM_SPECS) as ChecksumAlgorithm[]).map((algId) => {
            const s = CHECKSUM_SPECS[algId];
            const active = algorithm === algId;
            return (
              <button
                key={algId}
                type="button"
                onClick={() => {
                  setAlgorithm(algId);
                  if (hexInput.trim() === ASCII_VECTOR_HEX) {
                    setExpectedHex(s.checkVector123456789);
                  }
                }}
                className={`p-3 rounded-md border text-left transition-colors ${
                  active
                    ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/15'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold font-mono text-slate-900 dark:text-slate-100">
                    {s.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {s.widthBits}-bit
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1 truncate">
                  Poly: {s.polynomial.split(' ')[0]} · Init: {s.initialValue}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split: Input & Range (Left 7) | Result & Comparison (Right 5) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="checksum-hex-input" className="font-semibold text-slate-900 dark:text-slate-100">
                Hexadecimal Input Bytes
              </label>
              <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {bytes.length} total bytes parsed
              </span>
            </div>
            <textarea
              id="checksum-hex-input"
              rows={5}
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              placeholder="31 32 33 34 35 36 37 38 39"
              className="w-full p-3 font-mono text-xs rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Start Byte Offset (inclusive)
              </span>
              <input
                type="number"
                min={0}
                max={bytes.length}
                value={startOffset}
                onChange={(e) =>
                  setStartOffset(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
                }
                className="w-full h-8 px-2.5 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                End Byte Offset (exclusive)
              </span>
              <input
                type="number"
                min={0}
                max={bytes.length}
                placeholder={`${bytes.length} (end)`}
                value={endOffset}
                onChange={(e) => setEndOffset(e.target.value)}
                className="w-full h-8 px-2.5 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Expected Checksum (Hex)
              </span>
              <input
                type="text"
                value={expectedHex}
                onChange={(e) => setExpectedHex(e.target.value)}
                placeholder={`e.g. ${spec.checkVector123456789}`}
                className="w-full h-8 px-2.5 font-mono text-xs rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </label>
          </div>

          {/* Algorithm Technical Specification */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Algorithm Parameters — {spec.name}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {spec.description}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px] pt-1">
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 block">Polynomial</span>
                <span className="text-slate-900 dark:text-slate-100">{spec.polynomial}</span>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 block">Initial Value</span>
                <span className="text-slate-900 dark:text-slate-100">{spec.initialValue}</span>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 block">RefIn / RefOut</span>
                <span className="text-slate-900 dark:text-slate-100">
                  {String(spec.refIn)} / {String(spec.refOut)}
                </span>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 block">XorOut</span>
                <span className="text-slate-900 dark:text-slate-100">{spec.xorOut}</span>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 col-span-2">
                <span className="text-slate-500 dark:text-slate-400 block">
                  Standard Check ("123456789")
                </span>
                <span className="text-cyan-700 dark:text-cyan-400 font-semibold">
                  0x{spec.checkVector123456789}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Result & Verification Card */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <ShieldCheck className="w-4 h-4 text-cyan-500" />
                <span>Calculated Output</span>
              </div>
              <button
                type="button"
                disabled={!calcResult}
                onClick={handleCopyChecksum}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 hover:border-cyan-500 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Hex'}</span>
              </button>
            </div>

            {calcError ? (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/40 text-xs text-red-700 dark:text-red-300">
                {calcError}
              </div>
            ) : calcResult ? (
              <div className="space-y-3">
                <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {spec.name} · Range [{calcResult.startOffset}..{calcResult.endOffset}) ·{' '}
                    {calcResult.processedBytes} bytes
                  </div>
                  <div className="mt-1.5 text-2xl font-mono font-bold tracking-wider text-cyan-700 dark:text-cyan-300 tabular-nums">
                    0x{calcResult.hex}
                  </div>
                  <div className="mt-1 text-xs font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                    Decimal: {calcResult.value} · Width: {calcResult.byteLength} byte
                    {calcResult.byteLength > 1 ? 's' : ''}
                  </div>
                </div>

                {comparisonStatus && (
                  <div
                    className={`p-3 rounded-md border flex items-center gap-2 text-xs ${
                      comparisonStatus.error
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-300'
                        : comparisonStatus.valid
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                          : 'bg-red-500/10 border-red-500/40 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {comparisonStatus.valid ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0" />
                    )}
                    <div className="font-mono">
                      {comparisonStatus.error
                        ? comparisonStatus.error
                        : comparisonStatus.valid
                          ? `MATCH — Calculated 0x${calcResult.hex} equals expected 0x${comparisonStatus.normalizedExpected}`
                          : `MISMATCH — Calculated 0x${calcResult.hex} ≠ expected 0x${comparisonStatus.normalizedExpected}`}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* All-4 Algorithms Summary */}
          {allResults && (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100">
                All Supported Algorithms (Same Range)
              </div>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70 text-xs font-mono tabular-nums">
                {allResults.map(({ spec: s, result: r }) => (
                  <div
                    key={s.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-600 dark:text-slate-300">{s.name}</span>
                    <div className="text-right">
                      <span className="text-cyan-700 dark:text-cyan-400 font-semibold">
                        0x{r.hex}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 ml-2 text-[11px]">
                        ({r.value})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
