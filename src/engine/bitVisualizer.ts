import type { BitRange, ByteRange } from '../types/protocol';

export interface BitCellInfo {
  /** Bit index from LSB: 7 (MSB) down to 0 (LSB) */
  bitIndex: number;
  /** Value: 0 or 1 */
  value: 0 | 1;
  /** Positional weight: 2^bitIndex (128, 64, 32, 16, 8, 4, 2, 1) */
  weight: number;
  /** Numeric contribution to the byte: value * weight */
  contribution: number;
  /** Whether this is bit 7 (MSB) */
  isMsb: boolean;
  /** Whether this is bit 0 (LSB) */
  isLsb: boolean;
  /** Associated bitfield if this byte belongs to a bitfield storage unit */
  bitFieldName?: string;
  bitFieldColor?: string;
  bitFieldId?: string;
}

export interface ByteInspectionDetail {
  offset: number;
  hex: string;
  decimalUnsigned: number;
  decimalSigned: number;
  binary: string;
  ascii: string;
  isPrintableAscii: boolean;
  mappedField?: ByteRange;
  bits: BitCellInfo[];
}

export function isPrintableAsciiByte(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

export function byteToAsciiChar(byte: number): string {
  return isPrintableAsciiByte(byte) ? String.fromCharCode(byte) : '.';
}

export function findFieldAtOffset(
  offset: number,
  fieldMappings: ByteRange[]
): ByteRange | undefined {
  return fieldMappings.find((m) => offset >= m.startOffset && offset < m.endOffset);
}

/**
 * Maps an individual bit (bitIndex 7..0) of a specific byte offset to any configured BitRange.
 */
function findBitRangeForByteBit(
  byteOffset: number,
  bitIndexInByte: number,
  bitRanges: BitRange[],
  fieldMapping?: ByteRange
): BitRange | undefined {
  for (const br of bitRanges) {
    if (byteOffset < br.byteOffset || byteOffset >= br.byteOffset + br.storageBytes) {
      continue;
    }
    const relByte = byteOffset - br.byteOffset;
    const endianness = fieldMapping?.endianness ?? 'big';
    // Convert (relByte, bitIndexInByte) into absolute LSB bit position within the storage unit
    const unitBitIndex =
      endianness === 'little'
        ? relByte * 8 + bitIndexInByte
        : (br.storageBytes - 1 - relByte) * 8 + bitIndexInByte;

    if (unitBitIndex >= br.lsbStart && unitBitIndex <= br.lsbEnd) {
      return br;
    }
  }
  return undefined;
}

export function inspectByteAtOffset(
  bytes: Uint8Array,
  offset: number,
  fieldMappings: ByteRange[],
  bitRanges: BitRange[]
): ByteInspectionDetail | null {
  if (offset < 0 || offset >= bytes.length) {
    return null;
  }

  const byte = bytes[offset];
  const mappedField = findFieldAtOffset(offset, fieldMappings);
  const bits: BitCellInfo[] = [];

  for (let bitIndex = 7; bitIndex >= 0; bitIndex--) {
    const val = ((byte >>> bitIndex) & 1) as 0 | 1;
    const weight = 1 << bitIndex;
    const matchedBitRange = findBitRangeForByteBit(offset, bitIndex, bitRanges, mappedField);

    bits.push({
      bitIndex,
      value: val,
      weight,
      contribution: val * weight,
      isMsb: bitIndex === 7,
      isLsb: bitIndex === 0,
      bitFieldName: matchedBitRange?.fieldName,
      bitFieldColor: matchedBitRange?.color,
      bitFieldId: matchedBitRange?.fieldId,
    });
  }

  const decimalSigned = byte > 127 ? byte - 256 : byte;

  return {
    offset,
    hex: byte.toString(16).toUpperCase().padStart(2, '0'),
    decimalUnsigned: byte,
    decimalSigned,
    binary: byte.toString(2).padStart(8, '0'),
    ascii: byteToAsciiChar(byte),
    isPrintableAscii: isPrintableAsciiByte(byte),
    mappedField,
    bits,
  };
}

/**
 * Returns a new Uint8Array with the specified bit toggled at byteOffset.
 * Pure & deterministic — does not mutate input array.
 */
export function toggleBitInBytes(
  bytes: Uint8Array,
  byteOffset: number,
  bitIndex: number
): Uint8Array {
  if (byteOffset < 0 || byteOffset >= bytes.length) {
    throw new RangeError(`Byte offset ${byteOffset} out of bounds for length ${bytes.length}.`);
  }
  if (!Number.isInteger(bitIndex) || bitIndex < 0 || bitIndex > 7) {
    throw new RangeError(`Bit index ${bitIndex} must be between 0 and 7.`);
  }
  const copy = new Uint8Array(bytes);
  copy[byteOffset] = copy[byteOffset] ^ (1 << bitIndex);
  return copy;
}

/**
 * Returns a new Uint8Array with byteOffset replaced by newValue (0..255).
 */
export function setByteInBytes(
  bytes: Uint8Array,
  byteOffset: number,
  newValue: number
): Uint8Array {
  if (byteOffset < 0 || byteOffset >= bytes.length) {
    throw new RangeError(`Byte offset ${byteOffset} out of bounds for length ${bytes.length}.`);
  }
  if (!Number.isInteger(newValue) || newValue < 0 || newValue > 255) {
    throw new RangeError(`Byte value ${newValue} must be an integer in [0, 255].`);
  }
  const copy = new Uint8Array(bytes);
  copy[byteOffset] = newValue;
  return copy;
}
