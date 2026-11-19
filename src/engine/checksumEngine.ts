import type { ChecksumAlgorithm, ChecksumCalculation } from '../types/protocol';

export interface ChecksumAlgorithmSpec {
  id: ChecksumAlgorithm;
  name: string;
  shortName: string;
  widthBits: 8 | 16 | 32;
  byteLength: 1 | 2 | 4;
  polynomial: string;
  initialValue: string;
  refIn: boolean;
  refOut: boolean;
  xorOut: string;
  checkVector123456789: string;
  description: string;
}

export const CHECKSUM_SPECS: Record<ChecksumAlgorithm, ChecksumAlgorithmSpec> = {
  xor8: {
    id: 'xor8',
    name: 'XOR-8',
    shortName: 'XOR-8',
    widthBits: 8,
    byteLength: 1,
    polynomial: 'N/A (Bitwise XOR)',
    initialValue: '0x00',
    refIn: false,
    refOut: false,
    xorOut: '0x00',
    checkVector123456789: '31',
    description:
      'Computes the bitwise exclusive-OR across all selected bytes. Fast and common in NMEA 0183 and simple serial frames.',
  },
  crc8_atm: {
    id: 'crc8_atm',
    name: 'CRC-8/ATM',
    shortName: 'CRC-8',
    widthBits: 8,
    byteLength: 1,
    polynomial: '0x07',
    initialValue: '0x00',
    refIn: false,
    refOut: false,
    xorOut: '0x00',
    checkVector123456789: 'F4',
    description:
      'Standard 8-bit CRC (x^8 + x^2 + x + 1) used in ATM HEC headers, SMBus/I2C sensors, and compact telemetry frames.',
  },
  crc16_ccitt_false: {
    id: 'crc16_ccitt_false',
    name: 'CRC-16/CCITT-FALSE',
    shortName: 'CRC-16',
    widthBits: 16,
    byteLength: 2,
    polynomial: '0x1021',
    initialValue: '0xFFFF',
    refIn: false,
    refOut: false,
    xorOut: '0x0000',
    checkVector123456789: '29B1',
    description:
      'Non-reflected 16-bit CCITT CRC with 0xFFFF seed. Widely used in embedded device commands, telemetry, and AUTOSAR.',
  },
  crc32_iso_hdlc: {
    id: 'crc32_iso_hdlc',
    name: 'CRC-32/ISO-HDLC',
    shortName: 'CRC-32',
    widthBits: 32,
    byteLength: 4,
    polynomial: '0x04C11DB7 (reflected: 0xEDB88320)',
    initialValue: '0xFFFFFFFF',
    refIn: true,
    refOut: true,
    xorOut: '0xFFFFFFFF',
    checkVector123456789: 'CBF43926',
    description:
      'Standard IEEE 802.3 / Ethernet / PNG / ZIP 32-bit CRC using reflected polynomial 0xEDB88320 and final inversion.',
  },
};

// Precomputed lookup table for CRC-32/ISO-HDLC (reflected polynomial 0xEDB88320)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

// Precomputed lookup table for CRC-16/CCITT-FALSE (poly 0x1021, non-reflected)
const CRC16_CCITT_FALSE_TABLE = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i << 8;
  for (let k = 0; k < 8; k++) {
    crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  CRC16_CCITT_FALSE_TABLE[i] = crc;
}

// Precomputed lookup table for CRC-8/ATM (poly 0x07, non-reflected)
const CRC8_ATM_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let k = 0; k < 8; k++) {
    crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  CRC8_ATM_TABLE[i] = crc;
}

export function computeXor8(bytes: Uint8Array): number {
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc ^= bytes[i];
  }
  return acc & 0xff;
}

export function computeCrc8Atm(bytes: Uint8Array): number {
  let crc = 0x00;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC8_ATM_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return crc & 0xff;
}

export function computeCrc16CcittFalse(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    const idx = ((crc >>> 8) ^ bytes[i]) & 0xff;
    crc = ((crc << 8) ^ CRC16_CCITT_FALSE_TABLE[idx]) & 0xffff;
  }
  return crc & 0xffff;
}

export function computeCrc32IsoHdlc(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function getChecksumByteLength(algorithm: ChecksumAlgorithm): 1 | 2 | 4 {
  return CHECKSUM_SPECS[algorithm].byteLength;
}

export function formatChecksumHex(value: number, algorithm: ChecksumAlgorithm): string {
  const hexWidth = CHECKSUM_SPECS[algorithm].byteLength * 2;
  return (value >>> 0).toString(16).toUpperCase().padStart(hexWidth, '0');
}

export function calculateChecksum(
  algorithm: ChecksumAlgorithm,
  data: Uint8Array,
  startOffset = 0,
  endOffset = data.length
): ChecksumCalculation {
  if (!Number.isInteger(startOffset) || startOffset < 0 || startOffset > data.length) {
    throw new RangeError(
      `Checksum startOffset (${startOffset}) is out of bounds for buffer length ${data.length}.`
    );
  }
  if (!Number.isInteger(endOffset) || endOffset < startOffset || endOffset > data.length) {
    throw new RangeError(
      `Checksum endOffset (${endOffset}) must be between startOffset (${startOffset}) and buffer length (${data.length}).`
    );
  }

  const slice = data.subarray(startOffset, endOffset);
  let value: number;

  switch (algorithm) {
    case 'xor8':
      value = computeXor8(slice);
      break;
    case 'crc8_atm':
      value = computeCrc8Atm(slice);
      break;
    case 'crc16_ccitt_false':
      value = computeCrc16CcittFalse(slice);
      break;
    case 'crc32_iso_hdlc':
      value = computeCrc32IsoHdlc(slice);
      break;
    default: {
      const exhaustive: never = algorithm;
      throw new Error(`Unsupported checksum algorithm: ${String(exhaustive)}`);
    }
  }

  return {
    algorithm,
    value,
    hex: formatChecksumHex(value, algorithm),
    byteLength: CHECKSUM_SPECS[algorithm].byteLength,
    startOffset,
    endOffset,
    processedBytes: slice.length,
  };
}
