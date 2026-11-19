import type {
  BitRange,
  ByteRange,
  ChecksumCalculation,
  EncodedPacket,
  EncodingError,
  Endianness,
  FieldValuesMap,
  ProtocolField,
  ProtocolSchema,
  ValidationIssue,
} from '../types/protocol';
import { calculateChecksum } from './checksumEngine';
import {
  encodeBitfieldGroup,
  encodeField,
  INTEGER_BOUNDS,
  MAX_SAFE_FIELD_BYTES,
} from './fieldEncoder';
import { validateSchema } from './packetValidator';

const FIELD_PALETTE = [
  '#06B6D4', // cyan-500
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#14B8A6', // teal-500
  '#F97316', // orange-500
];

export function getFieldColor(field: ProtocolField, index: number): string {
  return field.color ?? FIELD_PALETTE[index % FIELD_PALETTE.length];
}

export function bytesToHexString(bytes: Uint8Array, separator = ' '): string {
  const parts: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    parts[i] = bytes[i].toString(16).toUpperCase().padStart(2, '0');
  }
  return parts.join(separator);
}

export function bytesToBinaryString(bytes: Uint8Array, separator = ' '): string {
  const parts: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    parts[i] = bytes[i].toString(2).padStart(8, '0');
  }
  return parts.join(separator);
}

/**
 * Low-level dynamically growing BinaryWriter backed by ArrayBuffer/Uint8Array/DataView.
 */
export class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private offset = 0;

  get byteOffset(): number {
    return this.offset;
  }

  writeBytes(data: Uint8Array): number {
    if (this.offset + data.length > MAX_SAFE_FIELD_BYTES * 4) {
      throw new RangeError('BinaryWriter exceeded maximum safe packet size.');
    }
    const start = this.offset;
    const copy = new Uint8Array(data.length);
    copy.set(data);
    this.chunks.push(copy);
    this.offset += copy.length;
    return start;
  }

  writeUint8(value: number): number {
    const b = INTEGER_BOUNDS.uint8;
    if (!Number.isInteger(value) || value < b.min || value > b.max) {
      throw new RangeError(`uint8 out of range: ${value}`);
    }
    return this.writeBytes(new Uint8Array([value]));
  }

  writeUint16(value: number, endianness: Endianness = 'big'): number {
    const b = INTEGER_BOUNDS.uint16;
    if (!Number.isInteger(value) || value < b.min || value > b.max) {
      throw new RangeError(`uint16 out of range: ${value}`);
    }
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, value, endianness === 'little');
    return this.writeBytes(new Uint8Array(buf));
  }

  writeUint32(value: number, endianness: Endianness = 'big'): number {
    const b = INTEGER_BOUNDS.uint32;
    if (!Number.isInteger(value) || value < b.min || value > b.max) {
      throw new RangeError(`uint32 out of range: ${value}`);
    }
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, endianness === 'little');
    return this.writeBytes(new Uint8Array(buf));
  }

  writeInt8(value: number): number {
    const b = INTEGER_BOUNDS.int8;
    if (!Number.isInteger(value) || value < b.min || value > b.max) {
      throw new RangeError(`int8 out of range: ${value}`);
    }
    const buf = new ArrayBuffer(1);
    new DataView(buf).setInt8(0, value);
    return this.writeBytes(new Uint8Array(buf));
  }

  writeInt16(value: number, endianness: Endianness = 'big'): number {
    const b = INTEGER_BOUNDS.int16;
    if (!Number.isInteger(value) || value < b.min || value > b.max) {
      throw new RangeError(`int16 out of range: ${value}`);
    }
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, value, endianness === 'little');
    return this.writeBytes(new Uint8Array(buf));
  }

  writeInt32(value: number, endianness: Endianness = 'big'): number {
    const b = INTEGER_BOUNDS.int32;
    if (!Number.isInteger(value) || value < b.min || value > b.max) {
      throw new RangeError(`int32 out of range: ${value}`);
    }
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, endianness === 'little');
    return this.writeBytes(new Uint8Array(buf));
  }

  writeFloat32(value: number, endianness: Endianness = 'big'): number {
    if (!Number.isFinite(value)) {
      throw new RangeError(`float32 requires finite value, got ${value}`);
    }
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, endianness === 'little');
    return this.writeBytes(new Uint8Array(buf));
  }

  writeFloat64(value: number, endianness: Endianness = 'big'): number {
    if (!Number.isFinite(value)) {
      throw new RangeError(`float64 requires finite value, got ${value}`);
    }
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, endianness === 'little');
    return this.writeBytes(new Uint8Array(buf));
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.offset);
    let cursor = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, cursor);
      cursor += chunk.length;
    }
    return result;
  }
}

export interface FieldSegment {
  kind: 'single' | 'bitfield_group';
  fields: ProtocolField[];
  startIndex: number;
}

/**
 * Groups consecutive bitfield definitions that share a non-empty `bitGroup` name
 * into a single storage unit segment. Standalone bitfields become 1-element bitfield groups.
 */
export function partitionFieldsIntoSegments(fields: ProtocolField[]): FieldSegment[] {
  const segments: FieldSegment[] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.type === 'bitfield') {
      const groupName = f.bitGroup?.trim();
      const groupFields: ProtocolField[] = [f];
      const startIndex = i;
      if (groupName) {
        let j = i + 1;
        while (
          j < fields.length &&
          fields[j].type === 'bitfield' &&
          fields[j].bitGroup?.trim() === groupName
        ) {
          groupFields.push(fields[j]);
          j++;
        }
        i = j;
      } else {
        i++;
      }
      segments.push({ kind: 'bitfield_group', fields: groupFields, startIndex });
    } else {
      segments.push({ kind: 'single', fields: [f], startIndex: i });
      i++;
    }
  }
  return segments;
}

export function encodePacket(
  schema: ProtocolSchema,
  values: FieldValuesMap
): EncodedPacket {
  const errors: EncodingError[] = [];
  const warnings: ValidationIssue[] = [];
  const fieldMappings: ByteRange[] = [];
  const bitRanges: BitRange[] = [];
  const resolvedValues: FieldValuesMap = {};

  // Validate schema integrity first
  const schemaCheck = validateSchema(schema);
  warnings.push(...schemaCheck.warnings);
  if (!schemaCheck.valid) {
    for (const err of schemaCheck.errors) {
      errors.push({
        code: err.code,
        fieldId: err.fieldId,
        fieldName: err.fieldName,
        byteOffset: err.byteOffset,
        expected: err.expected,
        received: err.received,
        message: err.message,
      });
    }
    return {
      success: false,
      bytes: new Uint8Array(0),
      hexString: '',
      binaryString: '',
      byteLength: 0,
      fieldMappings: [],
      bitRanges: [],
      fieldValues: resolvedValues,
      errors,
      warnings,
    };
  }

  const writer = new BinaryWriter();
  const encodedNumericValues: Record<string, number> = {};
  const segments = partitionFieldsIntoSegments(schema.fields);

  for (const segment of segments) {
    const startOffset = writer.byteOffset;

    if (segment.kind === 'bitfield_group') {
      const groupValues: Record<string, FieldValuesMap[string] | undefined> = {};
      for (const bf of segment.fields) {
        const val = values[bf.name] !== undefined ? values[bf.name] : bf.defaultValue;
        groupValues[bf.name] = val;
        if (val !== undefined) {
          resolvedValues[bf.name] = val;
        }
      }

      const pack = encodeBitfieldGroup(
        segment.fields,
        groupValues,
        schema.endianness,
        startOffset
      );

      if (!pack.result.ok) {
        errors.push(pack.result.error);
        continue;
      }

      writer.writeBytes(pack.result.bytes);
      const endOffset = writer.byteOffset;
      const rawHex = bytesToHexString(pack.result.bytes);
      const groupEndianness = segment.fields[0]?.endianness ?? schema.endianness;
      const primaryColor = getFieldColor(segment.fields[0], segment.startIndex);

      const groupLabel =
        segment.fields.length === 1
          ? segment.fields[0].name
          : segment.fields[0].bitGroup ?? segment.fields.map((f) => f.name).join(' + ');

      fieldMappings.push({
        fieldId: segment.fields[0].id,
        fieldName: groupLabel,
        fieldType: 'bitfield',
        startOffset,
        endOffset,
        byteLength: pack.result.bytes.length,
        isVariableLength: false,
        endianness: groupEndianness,
        color: primaryColor,
        rawHex,
        description:
          segment.fields.length > 1
            ? `Packed bitfield (${segment.fields.map((f) => `${f.name}:${f.bitWidth ?? 1}b`).join(', ')})`
            : segment.fields[0].description,
      });

      pack.bitEntries.forEach((entry, idx) => {
        bitRanges.push({
          fieldId: entry.field.id,
          fieldName: entry.field.name,
          byteOffset: startOffset,
          storageBytes: entry.storageBytes,
          bitOffset: entry.bitOffset,
          bitWidth: entry.bitWidth,
          bitOrder: entry.bitOrder,
          lsbStart: entry.lsbStart,
          lsbEnd: entry.lsbEnd,
          value: entry.value,
          color: getFieldColor(entry.field, segment.startIndex + idx),
          bitGroup: entry.field.bitGroup,
        });
      });
    } else {
      const field = segment.fields[0];
      const rawVal = values[field.name] !== undefined ? values[field.name] : field.defaultValue;
      const encoded = encodeField(
        field,
        rawVal,
        schema.endianness,
        startOffset,
        encodedNumericValues
      );

      if (!encoded.ok) {
        errors.push(encoded.error);
        continue;
      }

      if (rawVal !== undefined) {
        resolvedValues[field.name] = rawVal;
      }

      if (
        field.type === 'uint8' ||
        field.type === 'uint16' ||
        field.type === 'uint32' ||
        field.type === 'int8' ||
        field.type === 'int16' ||
        field.type === 'int32'
      ) {
        encodedNumericValues[field.name] = Number(rawVal);
      }

      writer.writeBytes(encoded.bytes);
      const endOffset = writer.byteOffset;
      fieldMappings.push({
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.type,
        startOffset,
        endOffset,
        byteLength: encoded.bytes.length,
        isVariableLength: encoded.isVariableLength,
        endianness: field.endianness ?? schema.endianness,
        color: getFieldColor(field, segment.startIndex),
        rawHex: bytesToHexString(encoded.bytes),
        description: field.description,
      });
    }
  }

  let checksumResult: ChecksumCalculation | undefined;

  if (errors.length === 0 && schema.checksum?.enabled) {
    const payloadBytes = writer.toUint8Array();
    const csConfig = schema.checksum;
    const start = csConfig.startOffset ?? 0;
    const end = csConfig.endOffset !== undefined ? csConfig.endOffset : payloadBytes.length;

    if (start < 0 || start > payloadBytes.length || end < start || end > payloadBytes.length) {
      errors.push({
        code: 'INVALID_CHECKSUM_RANGE',
        fieldName: csConfig.fieldName ?? 'checksum',
        byteOffset: payloadBytes.length,
        expected: `0 <= startOffset <= endOffset <= ${payloadBytes.length}`,
        received: `[${start}, ${end})`,
        message: `Checksum byte range [${start}, ${end}) is out of bounds for payload size ${payloadBytes.length}.`,
      });
    } else {
      checksumResult = calculateChecksum(csConfig.algorithm, payloadBytes, start, end);
      const csEndianness = csConfig.endianness ?? schema.endianness;
      const csStart = writer.byteOffset;

      if (checksumResult.byteLength === 1) {
        writer.writeUint8(checksumResult.value);
      } else if (checksumResult.byteLength === 2) {
        writer.writeUint16(checksumResult.value, csEndianness);
      } else {
        writer.writeUint32(checksumResult.value, csEndianness);
      }

      const csBytes = writer.toUint8Array().subarray(csStart);
      fieldMappings.push({
        fieldId: '__checksum__',
        fieldName: csConfig.fieldName ?? 'checksum',
        fieldType: 'checksum',
        startOffset: csStart,
        endOffset: writer.byteOffset,
        byteLength: checksumResult.byteLength,
        isVariableLength: false,
        endianness: csEndianness,
        color: '#22D3EE',
        rawHex: bytesToHexString(csBytes),
        description: `${csConfig.algorithm} over bytes [${start}..${end})`,
      });
    }
  }

  const finalBytes = errors.length === 0 ? writer.toUint8Array() : new Uint8Array(0);

  return {
    success: errors.length === 0,
    bytes: finalBytes,
    hexString: bytesToHexString(finalBytes),
    binaryString: bytesToBinaryString(finalBytes),
    byteLength: finalBytes.length,
    fieldMappings: errors.length === 0 ? fieldMappings : [],
    bitRanges: errors.length === 0 ? bitRanges : [],
    fieldValues: resolvedValues,
    checksum: checksumResult,
    errors,
    warnings,
  };
}
