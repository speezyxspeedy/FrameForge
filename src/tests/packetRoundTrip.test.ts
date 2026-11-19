import { describe, expect, it } from 'vitest';
import { PROTOCOL_TEMPLATES } from '../data/protocolTemplates';
import { decodePacket } from '../engine/binaryReader';
import { encodePacket } from '../engine/binaryWriter';
import { toggleBitInBytes } from '../engine/bitVisualizer';
import { runRoundTripValidation, validateImportedSchemaJson } from '../engine/packetValidator';
import type { ProtocolSchema } from '../types/protocol';

describe('Round-trip validation & protocol templates', () => {
  it('passes round-trip integrity for all 4 predefined protocol templates', () => {
    for (const template of PROTOCOL_TEMPLATES) {
      const rt = runRoundTripValidation(template.schema, template.sampleValues);
      expect(rt.success, `Template "${template.name}" failed: ${rt.summary}`).toBe(true);
      expect(rt.mismatchCount).toBe(0);
      if (template.schema.checksum?.enabled) {
        expect(rt.checksumValid).toBe(true);
      }
    }
  });

  it('detects single-bit corruption via packet checksum verification', () => {
    const cmdTemplate = PROTOCOL_TEMPLATES.find((t) => t.id === 'device-command')!;
    const encoded = encodePacket(cmdTemplate.schema, cmdTemplate.sampleValues);
    expect(encoded.success).toBe(true);

    // Flip bit 0 of byte 2 (sequenceNumber)
    const corrupted = toggleBitInBytes(encoded.bytes, 2, 0);
    const decoded = decodePacket(cmdTemplate.schema, corrupted, { strictMode: true });

    expect(decoded.success).toBe(false);
    expect(decoded.checksum?.valid).toBe(false);
    expect(decoded.errors.some((e) => e.code === 'CHECKSUM_MISMATCH')).toBe(true);
  });

  it('preserves mixed-type packet across both little-endian and big-endian settings', () => {
    const makeMixed = (endianness: 'big' | 'little'): ProtocolSchema => ({
      id: `mixed-${endianness}`,
      version: 1,
      name: 'Mixed Packet',
      description: '',
      endianness,
      checksum: {
        enabled: true,
        algorithm: 'crc32_iso_hdlc',
        startOffset: 0,
        fieldName: 'crc32',
      },
      fields: [
        { id: '1', name: 'u16', type: 'uint16', defaultValue: 0x1234, required: true },
        { id: '2', name: 'i32', type: 'int32', defaultValue: -987654, required: true },
        { id: '3', name: 'f32', type: 'float32', defaultValue: -12.345, required: true },
        { id: '4', name: 'f64', type: 'float64', defaultValue: 3.14159265358979, required: true },
        { id: '5', name: 'active', type: 'boolean', defaultValue: true, required: true },
        { id: '6', name: 'fixedStr', type: 'utf8_fixed', defaultValue: 'NODE', required: true, length: 6, paddingByte: 0 },
        { id: '7', name: 'nullStr', type: 'utf8_null', defaultValue: 'v1.2', required: true },
        { id: '8', name: 'lpStr', type: 'utf8_length_prefixed', defaultValue: 'Ω-test', required: true, lengthPrefixType: 'uint8' },
        { id: '9', name: 'raw', type: 'bytes', defaultValue: '01 23 45', required: true, bytesLengthMode: 'fixed', length: 3 },
      ],
    });

    const vals = {
      u16: 0x1234,
      i32: -987654,
      f32: -12.345,
      f64: 3.14159265358979,
      active: true,
      fixedStr: 'NODE',
      nullStr: 'v1.2',
      lpStr: 'Ω-test',
      raw: '01 23 45',
    };

    const bigRt = runRoundTripValidation(makeMixed('big'), vals);
    const littleRt = runRoundTripValidation(makeMixed('little'), vals);

    expect(bigRt.success).toBe(true);
    expect(littleRt.success).toBe(true);
    expect(bigRt.encodedPacket.hexString).not.toBe(littleRt.encodedPacket.hexString);
  });

  it('rejects malformed or unsupported imported schema JSON cleanly', () => {
    expect(validateImportedSchemaJson('').ok).toBe(false);
    expect(validateImportedSchemaJson('{not-json').ok).toBe(false);
    expect(
      validateImportedSchemaJson(JSON.stringify({ version: 99, name: 'Bad', endianness: 'big', fields: [] })).ok
    ).toBe(false);

    const validExport = JSON.stringify({
      schema: PROTOCOL_TEMPLATES[0].schema,
      sampleValues: PROTOCOL_TEMPLATES[0].sampleValues,
    });
    const parsed = validateImportedSchemaJson(validExport);
    expect(parsed.ok).toBe(true);
  });
});
