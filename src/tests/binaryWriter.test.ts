import { describe, expect, it } from 'vitest';
import { BinaryWriter, bytesToHexString, encodePacket } from '../engine/binaryWriter';
import type { ProtocolSchema } from '../types/protocol';

function makeSchema(fields: ProtocolSchema['fields'], endianness: 'big' | 'little' = 'big'): ProtocolSchema {
  return {
    id: 'test-schema',
    version: 1,
    name: 'Test Schema',
    description: '',
    endianness,
    fields,
  };
}

describe('BinaryWriter & encodePacket', () => {
  it('encodes uint8, uint16, and uint32 boundary values accurately', () => {
    const schema = makeSchema([
      { id: '1', name: 'u8min', type: 'uint8', defaultValue: 0, required: true },
      { id: '2', name: 'u8max', type: 'uint8', defaultValue: 255, required: true },
      { id: '3', name: 'u16min', type: 'uint16', defaultValue: 0, required: true },
      { id: '4', name: 'u16max', type: 'uint16', defaultValue: 65535, required: true },
      { id: '5', name: 'u32min', type: 'uint32', defaultValue: 0, required: true },
      { id: '6', name: 'u32max', type: 'uint32', defaultValue: 4294967295, required: true },
    ]);

    const res = encodePacket(schema, {
      u8min: 0,
      u8max: 255,
      u16min: 0,
      u16max: 65535,
      u32min: 0,
      u32max: 4294967295,
    });

    expect(res.success).toBe(true);
    expect(res.byteLength).toBe(14);
    expect(res.hexString).toBe('00 FF 00 00 FF FF 00 00 00 00 FF FF FF FF');
  });

  it('encodes signed int8, int16, and int32 boundary values using two’s complement', () => {
    const schema = makeSchema([
      { id: '1', name: 'i8min', type: 'int8', defaultValue: -128, required: true },
      { id: '2', name: 'i8max', type: 'int8', defaultValue: 127, required: true },
      { id: '3', name: 'i16min', type: 'int16', defaultValue: -32768, required: true },
      { id: '4', name: 'i16max', type: 'int16', defaultValue: 32767, required: true },
      { id: '5', name: 'i32min', type: 'int32', defaultValue: -2147483648, required: true },
      { id: '6', name: 'i32max', type: 'int32', defaultValue: 2147483647, required: true },
    ]);

    const res = encodePacket(schema, {
      i8min: -128,
      i8max: 127,
      i16min: -32768,
      i16max: 32767,
      i32min: -2147483648,
      i32max: 2147483647,
    });

    expect(res.success).toBe(true);
    expect(res.hexString).toBe('80 7F 80 00 7F FF 80 00 00 00 7F FF FF FF');
  });

  it('produces different bytes for big-endian vs little-endian (0x1234 = 4660)', () => {
    const bigSchema = makeSchema(
      [{ id: '1', name: 'val', type: 'uint16', defaultValue: 4660, required: true }],
      'big'
    );
    const littleSchema = makeSchema(
      [{ id: '1', name: 'val', type: 'uint16', defaultValue: 4660, required: true }],
      'little'
    );

    const bigRes = encodePacket(bigSchema, { val: 4660 });
    const littleRes = encodePacket(littleSchema, { val: 4660 });

    expect(bigRes.hexString).toBe('12 34');
    expect(littleRes.hexString).toBe('34 12');
  });

  it('supports per-field endianness overrides', () => {
    const schema = makeSchema(
      [
        { id: '1', name: 'beField', type: 'uint16', defaultValue: 0x1234, required: true },
        {
          id: '2',
          name: 'leField',
          type: 'uint16',
          defaultValue: 0x1234,
          required: true,
          endianness: 'little',
        },
      ],
      'big'
    );
    const res = encodePacket(schema, { beField: 0x1234, leField: 0x1234 });
    expect(res.success).toBe(true);
    expect(res.hexString).toBe('12 34 34 12');
  });

  it('encodes IEEE 754 float32 and float64 values accurately', () => {
    const schema = makeSchema([
      { id: '1', name: 'f32', type: 'float32', defaultValue: 22.5, required: true },
      { id: '2', name: 'f64', type: 'float64', defaultValue: -122.5, required: true },
    ]);

    const res = encodePacket(schema, { f32: 22.5, f64: -122.5 });
    expect(res.success).toBe(true);
    expect(res.byteLength).toBe(12);
    // 22.5 in float32 BE = 41 B4 00 00; -122.5 in float64 BE = C0 5E A0 00 00 00 00 00
    expect(res.hexString).toBe('41 B4 00 00 C0 5E A0 00 00 00 00 00');
  });

  it('encodes fixed-length UTF-8 strings with padding, rejects overflow, and safely truncates UTF-8 when enabled', () => {
    const fixedStrict = makeSchema([
      {
        id: '1',
        name: 'label',
        type: 'utf8_fixed',
        defaultValue: 'Hi',
        required: true,
        length: 5,
        paddingByte: 0x20,
        truncate: false,
      },
    ]);

    const ok = encodePacket(fixedStrict, { label: 'Hi' });
    expect(ok.success).toBe(true);
    expect(ok.hexString).toBe('48 69 20 20 20');

    const overflow = encodePacket(fixedStrict, { label: 'Hello!' });
    expect(overflow.success).toBe(false);
    expect(overflow.errors[0].code).toBe('STRING_EXCEEDS_FIXED_LENGTH');

    // Multi-byte UTF-8 safe truncation: "A°" is 1 + 2 = 3 bytes; max 2 bytes must keep "A" + pad 0x00, never split "°"
    const fixedTruncate = makeSchema([
      {
        id: '1',
        name: 'label',
        type: 'utf8_fixed',
        defaultValue: 'A°',
        required: true,
        length: 2,
        paddingByte: 0x00,
        truncate: true,
      },
    ]);
    const truncRes = encodePacket(fixedTruncate, { label: 'A°' });
    expect(truncRes.success).toBe(true);
    expect(truncRes.hexString).toBe('41 00');
  });

  it('encodes length-prefixed UTF-8 strings using actual UTF-8 byte length', () => {
    const schema = makeSchema([
      {
        id: '1',
        name: 'msg',
        type: 'utf8_length_prefixed',
        defaultValue: '22°C',
        required: true,
        lengthPrefixType: 'uint16',
      },
    ]);
    // "22°C" -> 32 32 C2 B0 43 (5 UTF-8 bytes, even though JS length is 4)
    const res = encodePacket(schema, { msg: '22°C' });
    expect(res.success).toBe(true);
    expect(res.hexString).toBe('00 05 32 32 C2 B0 43');
  });

  it('encodes null-terminated UTF-8 strings and rejects embedded terminators', () => {
    const schema = makeSchema([
      { id: '1', name: 'cstr', type: 'utf8_null', defaultValue: 'OK', required: true },
    ]);

    const ok = encodePacket(schema, { cstr: 'OK' });
    expect(ok.success).toBe(true);
    expect(ok.hexString).toBe('4F 4B 00');

    const bad = encodePacket(schema, { cstr: 'O\0K' });
    expect(bad.success).toBe(false);
    expect(bad.errors[0].code).toBe('EMBEDDED_TERMINATOR');
  });

  it('encodes raw byte arrays in fixed and field_ref modes', () => {
    const schema = makeSchema([
      { id: '1', name: 'len', type: 'uint8', defaultValue: 3, required: true },
      {
        id: '2',
        name: 'payload',
        type: 'bytes',
        defaultValue: 'AA BB CC',
        required: true,
        bytesLengthMode: 'field_ref',
        lengthFieldName: 'len',
      },
    ]);

    const ok = encodePacket(schema, { len: 3, payload: '0xAA 0xBB 0xCC' });
    expect(ok.success).toBe(true);
    expect(ok.hexString).toBe('03 AA BB CC');

    const mismatch = encodePacket(schema, { len: 4, payload: 'AA BB CC' });
    expect(mismatch.success).toBe(false);
    expect(mismatch.errors[0].code).toBe('LENGTH_FIELD_MISMATCH');
  });

  it('packs bitfields accurately in MSB-first and LSB-first modes and prevents overlaps', () => {
    const msbSchema = makeSchema([
      {
        id: 'b1',
        name: 'ready',
        type: 'bitfield',
        defaultValue: 1,
        required: true,
        bitWidth: 1,
        bitOffset: 0,
        bitStorageBytes: 1,
        bitOrder: 'msb-first',
        bitGroup: 'flags',
      },
      {
        id: 'b2',
        name: 'mode',
        type: 'bitfield',
        defaultValue: 3,
        required: true,
        bitWidth: 3,
        bitOffset: 2,
        bitStorageBytes: 1,
        bitOrder: 'msb-first',
        bitGroup: 'flags',
      },
      {
        id: 'b3',
        name: 'err',
        type: 'bitfield',
        defaultValue: 2,
        required: true,
        bitWidth: 3,
        bitOffset: 5,
        bitStorageBytes: 1,
        bitOrder: 'msb-first',
        bitGroup: 'flags',
      },
    ]);

    const res = encodePacket(msbSchema, { ready: 1, mode: 3, err: 2 });
    expect(res.success).toBe(true);
    // 1 0 011 010 = 0x9A
    expect(res.hexString).toBe('9A');

    // Overlap rejection
    const overlapSchema = makeSchema([
      {
        id: 'b1',
        name: 'a',
        type: 'bitfield',
        defaultValue: 1,
        required: true,
        bitWidth: 4,
        bitOffset: 0,
        bitStorageBytes: 1,
        bitOrder: 'lsb-first',
        bitGroup: 'g',
      },
      {
        id: 'b2',
        name: 'b',
        type: 'bitfield',
        defaultValue: 1,
        required: true,
        bitWidth: 4,
        bitOffset: 2,
        bitStorageBytes: 1,
        bitOrder: 'lsb-first',
        bitGroup: 'g',
      },
    ]);
    const overlapRes = encodePacket(overlapSchema, { a: 1, b: 1 });
    expect(overlapRes.success).toBe(false);
    expect(overlapRes.errors.some((e) => e.code === 'BITFIELD_OVERLAP')).toBe(true);
  });

  it('rejects out-of-range and non-integer values strictly without silent truncation', () => {
    const schema = makeSchema([
      { id: '1', name: 'u8', type: 'uint8', defaultValue: 0, required: true },
      { id: '2', name: 'i8', type: 'int8', defaultValue: 0, required: true },
    ]);

    const overflow = encodePacket(schema, { u8: 256, i8: 0 });
    expect(overflow.success).toBe(false);
    expect(overflow.errors[0].code).toBe('INTEGER_OUT_OF_RANGE');

    const underflow = encodePacket(schema, { u8: 0, i8: -129 });
    expect(underflow.success).toBe(false);
    expect(underflow.errors[0].code).toBe('INTEGER_OUT_OF_RANGE');

    const fractional = encodePacket(schema, { u8: 12.5, i8: 0 });
    expect(fractional.success).toBe(false);
    expect(fractional.errors[0].code).toBe('NON_INTEGER_VALUE');
  });

  it('low-level BinaryWriter class tracks byteOffset accurately', () => {
    const writer = new BinaryWriter();
    writer.writeUint8(0xaa);
    writer.writeUint16(0x1234, 'little');
    expect(writer.byteOffset).toBe(3);
    expect(bytesToHexString(writer.toUint8Array())).toBe('AA 34 12');
  });
});
