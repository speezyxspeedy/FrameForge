import { describe, expect, it } from 'vitest';
import {
  calculateChecksum,
  computeCrc16CcittFalse,
  computeCrc32IsoHdlc,
  computeCrc8Atm,
  computeXor8,
} from '../engine/checksumEngine';

const ASCII_123456789 = new TextEncoder().encode('123456789');

describe('checksumEngine — standard test vectors', () => {
  it('computes CRC-8/ATM for "123456789" === 0xF4', () => {
    const val = computeCrc8Atm(ASCII_123456789);
    expect(val).toBe(0xf4);
    const calc = calculateChecksum('crc8_atm', ASCII_123456789);
    expect(calc.hex).toBe('F4');
    expect(calc.byteLength).toBe(1);
  });

  it('computes CRC-16/CCITT-FALSE for "123456789" === 0x29B1', () => {
    const val = computeCrc16CcittFalse(ASCII_123456789);
    expect(val).toBe(0x29b1);
    const calc = calculateChecksum('crc16_ccitt_false', ASCII_123456789);
    expect(calc.hex).toBe('29B1');
    expect(calc.byteLength).toBe(2);
  });

  it('computes CRC-32/ISO-HDLC for "123456789" === 0xCBF43926', () => {
    const val = computeCrc32IsoHdlc(ASCII_123456789);
    expect(val).toBe(0xcbf43926);
    const calc = calculateChecksum('crc32_iso_hdlc', ASCII_123456789);
    expect(calc.hex).toBe('CBF43926');
    expect(calc.byteLength).toBe(4);
  });

  it('computes XOR-8 against manually verified vectors', () => {
    // 0x10 ^ 0x25 ^ 0xFF = 0xCA
    const sample = new Uint8Array([0x10, 0x25, 0xff]);
    expect(computeXor8(sample)).toBe(0xca);
    const calc = calculateChecksum('xor8', sample);
    expect(calc.hex).toBe('CA');

    // "123456789" -> 0x31^0x32^0x33^0x34^0x35^0x36^0x37^0x38^0x39 = 0x31
    expect(calculateChecksum('xor8', ASCII_123456789).hex).toBe('31');
  });

  it('supports sub-range calculation and rejects out-of-bounds ranges', () => {
    const buf = new Uint8Array([0xaa, ...ASCII_123456789, 0xbb]);
    const calc = calculateChecksum('crc16_ccitt_false', buf, 1, 10);
    expect(calc.hex).toBe('29B1');
    expect(calc.processedBytes).toBe(9);

    expect(() => calculateChecksum('xor8', buf, 5, 3)).toThrow(RangeError);
    expect(() => calculateChecksum('xor8', buf, 0, 99)).toThrow(RangeError);
  });
});
