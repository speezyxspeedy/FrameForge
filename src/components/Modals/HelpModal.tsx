import React from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="FrameForge Quick Reference"
        className="w-full max-w-xl rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            FrameForge Quick Reference
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help modal"
            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-h-[75vh] overflow-y-auto">
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              End-to-End Binary Workflow
            </h3>
            <p>
              1. Define fields in <strong>Packet Builder</strong> or load a preset from{' '}
              <strong>Protocol Templates</strong>. Every edit immediately computes exact byte offsets
              and encodes real bytes using native <code className="font-mono">DataView</code> and{' '}
              <code className="font-mono">TextEncoder</code>.
            </p>
            <p>
              2. Inspect bytes in <strong>Hex Inspector</strong>. Click any byte to inspect its
              decimal, binary, and ASCII state, or unlock Bit Edit to toggle individual bits and see
              decoded fields and CRC validation update live.
            </p>
            <p>
              3. Paste external hex dumps in <strong>Decoder</strong>, test check vectors in{' '}
              <strong>Checksum Lab</strong>, and run <strong>Round-Trip Validation</strong> to verify
              lossless encoding/decoding.
            </p>
          </section>

          <section className="space-y-1.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Bit-Field Ordering vs. Byte Endianness
            </h3>
            <p>
              <strong>Byte Endianness</strong> (Big-Endian vs. Little-Endian) determines the order of
              bytes for multi-byte types (uint16, int32, float32, float64, multi-byte bitfield storage
              units).
            </p>
            <p>
              <strong>Bit Order</strong> (MSB-first vs. LSB-first) determines whether bit offset 0
              begins at the Most Significant Bit or Least Significant Bit within a bitfield storage
              unit. Consecutive bitfields sharing the same <code className="font-mono">bitGroup</code>{' '}
              pack into one storage unit with overlap validation.
            </p>
          </section>

          <section className="space-y-1.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Verified Checksum Test Vectors (ASCII "123456789")
            </h3>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px] bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-800">
              <div>XOR-8: <span className="text-cyan-600 dark:text-cyan-400">0x31</span></div>
              <div>CRC-8/ATM: <span className="text-cyan-600 dark:text-cyan-400">0xF4</span></div>
              <div>CRC-16/CCITT-FALSE: <span className="text-cyan-600 dark:text-cyan-400">0x29B1</span></div>
              <div>CRC-32/ISO-HDLC: <span className="text-cyan-600 dark:text-cyan-400">0xCBF43926</span></div>
            </div>
          </section>

          <section className="space-y-1 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            All encoding, decoding, bit inspection, checksum verification, and file import/export
            execute locally in your browser with zero external requests.
          </section>
        </div>
      </div>
    </div>
  );
};
