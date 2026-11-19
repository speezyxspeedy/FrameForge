import { describe, expect, it } from 'vitest';
import { BinaryReader, decodePacket, parseHexString } from '../engine/binaryReader';
import type { ProtocolSchema } from '../types/protocol';

function makeSchema(fields: ProtocolSchema['fields'], endianness: 'big' | 'little' = 'big'): ProtocolSchema {
  return {
    id: 'decode-test',
    version: 1,
    name: 'Decode Test',
    description: '',
    endianness,
    fields,
  };
}

describe('BinaryReader & decodePacket', () => {
  it('parses hex input with spaces, newlines, commas, and 0x prefixes, and rejects invalid hex', () => {
    const ok = parseHexString('0xA1, 10\n00 0x2E fb 40');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(Array.from(ok.bytes)).toEqual([0xa1, 0x10, 0x00, 0x2e, 0xfb, 0x40]);
    }

    const badChar = parseHexString('A1 ZZ 00');
    expect(badChar.ok).toBe(false);

    const oddNibbles = parseHexString('A1 F');
    expect(oddNibbles.ok).toBe(false);
  });

  it('decodes unsigned integers, signed integers, floats, and UTF-8 strings', () => {
    const schema = makeSchema([
      { id: '1', name: 'magic', type: 'uint8', defaultValue: 0, required: true },
      { id: '2', name: 'delta', type: 'int16', defaultValue: 0, required: true },
      { id: '3', name: 'temp', type: 'float32', defaultValue: 0, required: true },
      {
        id: '4',
        name: 'label',
        type: 'utf8_length_prefixed',
        defaultValue: '',
        required: true,
        lengthPrefixType: 'uint8',
      },
    ]);

    // magic=0xA1 (161), delta=-42 (0xFFD6), temp=22.5 (41 B4 00 00), label="Hello" (05 48 65 6C 6C 6F)
    const hex = 'A1 FF D6 41 B4 00 00 05 48 65 6C 6C 6F';
    const res = decodePacket(schema, hex, { strictMode: true });

    expect(res.success).toBe(true);
    expect(res.values.magic).toBe(161);
    expect(res.values.delta).toBe(-42);
    expect(res.values.temp).toBeCloseTo(22.5, 5);
    expect(res.values.label).toBe('Hello');
    expect(res.fields[0].startOffset).toBe(0);
    expect(res.fields[3].startOffset).toBe(7);
    expect(res.fields[3].byteLength).toBe(6);
  });

  it('detects incomplete packets and returns structured offset error', () => {
    const schema = makeSchema([
      { id: '1', name: 'header', type: 'uint16', defaultValue: 0, required: true },
      { id: '2', name: 'value', type: 'uint32', defaultValue: 0, required: true },
    ]);

    const res = decodePacket(schema, '12 34 00 01');
    expect(res.success).toBe(false);
    expect(res.errors[0].code).toBe('INSUFFICIENT_BYTES');
    expect(res.errors[0].fieldName).toBe('value');
    expect(res.errors[0].byteOffset).toBe(2);
  });

  it('detects unexpected trailing bytes in strict mode and warns in non-strict mode', () => {
    const schema = makeSchema([
      { id: '1', name: 'id', type: 'uint8', defaultValue: 0, required: true },
    ]);

    const strict = decodePacket(schema, '01 DE AD', { strictMode: true });
    expect(strict.success).toBe(false);
    expect(strict.errors[0].code).toBe('UNEXPECTED_TRAILING_BYTES');
    expect(strict.trailingBytes.length).toBe(2);

    const lenient = decodePacket(schema, '01 DE AD', { strictMode: false });
    expect(lenient.success).toBe(true);
    expect(lenient.warnings.some((w) => w.code === 'TRAILING_BYTES_IGNORED')).toBe(true);
    expect(lenient.trailingBytes.length).toBe(2);
  });

  it('decodes configured bitfields cleanly', () => {
    const schema = makeSchema([
      {
        id: '1',
        name: 'ready',
        type: 'bitfield',
        defaultValue: 0,
        required: true,
        bitWidth: 1,
        bitOffset: 0,
        bitStorageBytes: 1,
        bitOrder: 'msb-first',
        bitGroup: 'status',
      },
      {
        id: '2',
        name: 'mode',
        type: 'bitfield',
        defaultValue: 0,
        required: true,
        bitWidth: 3,
        bitOffset: 2,
        bitStorageBytes: 1,
        bitOrder: 'msb-first',
        bitGroup: 'status',
      },
      {
        id: '3',
        name: 'err',
        type: 'bitfield',
        defaultValue: 0,
        required: true,
        bitWidth: 3,
        bitOffset: 5,
        bitStorageBytes: 1,
        bitOrder: 'msb-first',
        bitGroup: 'status',
      },
    ]);

    // 0x9A = 10011010 -> ready=1, (bit6=0), mode=011 (3), err=010 (2)
    const res = decodePacket(schema, '9A', { strictMode: true });
    expect(res.success).toBe(true);
    expect(res.values.ready).toBe(1);
    expect(res.values.mode).toBe(3);
    expect(res.values.err).toBe(2);
  });

  it('low-level BinaryReader throws on out-of-bounds reads', () => {
    const reader = new BinaryReader(new Uint8Array([0x12, 0x34]));
    expect(reader.readUint16('big')).toBe(0x1234);
    expect(() => reader.readUint8()).toThrow(RangeError);
  });
});
