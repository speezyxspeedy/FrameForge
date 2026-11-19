import type {
  BitRange,
  ByteRange,
  ChecksumVerification,
  DecodedFieldEntry,
  DecodedPacket,
  DecodingError,
  Endianness,
  FieldValue,
  FieldValuesMap,
  ProtocolSchema,
  ValidationIssue,
} from '../types/protocol';
import {
  calculateChecksum,
  formatChecksumHex,
  getChecksumByteLength,
} from './checksumEngine';
import { bytesToHexString, getFieldColor, partitionFieldsIntoSegments } from './binaryWriter';
import { decodeBitfieldGroup, decodeField } from './fieldDecoder';
import { parseHexInputToBytes } from './fieldEncoder';
import { validateSchema } from './packetValidator';

/**
 * Low-level bounds-checked BinaryReader backed by Uint8Array + DataView.
 */
export class BinaryReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.bytes = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get byteOffset(): number {
    return this.offset;
  }

  get byteLength(): number {
    return this.bytes.byteLength;
  }

  get remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  private ensureAvailable(count: number): void {
    if (this.remaining < count) {
      throw new RangeError(
        `Insufficient bytes at offset ${this.offset}: required ${count}, remaining ${this.remaining}.`
      );
    }
  }

  readUint8(): number {
    this.ensureAvailable(1);
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readUint16(endianness: Endianness = 'big'): number {
    this.ensureAvailable(2);
    const val = this.view.getUint16(this.offset, endianness === 'little');
    this.offset += 2;
    return val;
  }

  readUint32(endianness: Endianness = 'big'): number {
    this.ensureAvailable(4);
    const val = this.view.getUint32(this.offset, endianness === 'little');
    this.offset += 4;
    return val;
  }

  readInt8(): number {
    this.ensureAvailable(1);
    const val = this.view.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt16(endianness: Endianness = 'big'): number {
    this.ensureAvailable(2);
    const val = this.view.getInt16(this.offset, endianness === 'little');
    this.offset += 2;
    return val;
  }

  readInt32(endianness: Endianness = 'big'): number {
    this.ensureAvailable(4);
    const val = this.view.getInt32(this.offset, endianness === 'little');
    this.offset += 4;
    return val;
  }

  readFloat32(endianness: Endianness = 'big'): number {
    this.ensureAvailable(4);
    const val = this.view.getFloat32(this.offset, endianness === 'little');
    this.offset += 4;
    return val;
  }

  readFloat64(endianness: Endianness = 'big'): number {
    this.ensureAvailable(8);
    const val = this.view.getFloat64(this.offset, endianness === 'little');
    this.offset += 8;
    return val;
  }

  readBytes(length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(`Invalid readBytes length: ${length}`);
    }
    this.ensureAvailable(length);
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

export function parseHexString(
  hexInput: string
): { ok: true; bytes: Uint8Array } | { ok: false; error: DecodingError } {
  const res = parseHexInputToBytes(hexInput);
  if (!res.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_HEX_INPUT',
        expected: 'Pairs of hexadecimal digits (0-9, A-F), optional spaces/0x prefixes',
        received: hexInput.slice(0, 64),
        message: res.error,
      },
    };
  }
  return { ok: true, bytes: res.bytes };
}

export function formatDecodedFieldValue(value: FieldValue, type: string): string {
  if (value instanceof Uint8Array) {
    return value.length === 0 ? '(empty)' : bytesToHexString(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true (0x01)' : 'false (0x00)';
  }
  if (typeof value === 'number') {
    if (type === 'float32') {
      return Number.isFinite(value) ? Number(value.toPrecision(7)).toString() : String(value);
    }
    if (type === 'float64') {
      return Number.isFinite(value) ? Number(value.toPrecision(15)).toString() : String(value);
    }
    return String(value);
  }
  return String(value);
}

export interface DecodeOptions {
  strictMode?: boolean;
}

export function decodePacket(
  schema: ProtocolSchema,
  input: Uint8Array | string,
  options: DecodeOptions = {}
): DecodedPacket {
  const strictMode = options.strictMode ?? schema.strictDecoding ?? false;
  const errors: DecodingError[] = [];
  const warnings: ValidationIssue[] = [];
  const values: FieldValuesMap = {};
  const decodedEntries: DecodedFieldEntry[] = [];
  const fieldMappings: ByteRange[] = [];
  const bitRanges: BitRange[] = [];

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
      byteLength: 0,
      values,
      fields: decodedEntries,
      fieldMappings,
      bitRanges,
      trailingBytes: new Uint8Array(0),
      errors,
      warnings,
    };
  }

  let bytes: Uint8Array;
  if (typeof input === 'string') {
    const parsed = parseHexString(input);
    if (!parsed.ok) {
      return {
        success: false,
        bytes: new Uint8Array(0),
        byteLength: 0,
        values,
        fields: decodedEntries,
        fieldMappings,
        bitRanges,
        trailingBytes: new Uint8Array(0),
        errors: [parsed.error],
        warnings,
      };
    }
    bytes = parsed.bytes;
  } else {
    bytes = input;
  }

  const csConfig = schema.checksum?.enabled ? schema.checksum : undefined;
  const csByteLength = csConfig ? getChecksumByteLength(csConfig.algorithm) : 0;

  // Reserve trailing checksum bytes so 'remaining' byte arrays do not swallow the checksum
  const maxPayloadEnd = csConfig ? bytes.length - csByteLength : bytes.length;
  if (csConfig && maxPayloadEnd < 0) {
    errors.push({
      code: 'INSUFFICIENT_BYTES_FOR_CHECKSUM',
      fieldName: csConfig.fieldName ?? 'checksum',
      byteOffset: 0,
      expected: `At least ${csByteLength} bytes for ${csConfig.algorithm} checksum`,
      received: `${bytes.length} bytes`,
      message: `Packet is too short (${bytes.length}B) to contain a ${csByteLength}-byte ${csConfig.algorithm} checksum.`,
    });
    return {
      success: false,
      bytes,
      byteLength: bytes.length,
      values,
      fields: decodedEntries,
      fieldMappings,
      bitRanges,
      trailingBytes: new Uint8Array(0),
      errors,
      warnings,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decodedNumericValues: Record<string, number> = {};
  const segments = partitionFieldsIntoSegments(schema.fields);
  let cursor = 0;

  for (const segment of segments) {
    if (segment.kind === 'bitfield_group') {
      const startOffset = cursor;
      const decodedGroup = decodeBitfieldGroup(
        view,
        cursor,
        maxPayloadEnd,
        segment.fields,
        schema.endianness
      );

      if (!decodedGroup.ok) {
        errors.push(decodedGroup.error);
        break;
      }

      cursor += decodedGroup.bytesRead;
      const rawSlice = bytes.subarray(startOffset, cursor);
      const rawHex = bytesToHexString(rawSlice);
      const groupColor = getFieldColor(segment.fields[0], segment.startIndex);
      const groupLabel =
        segment.fields.length === 1
          ? segment.fields[0].name
          : segment.fields[0].bitGroup ?? segment.fields.map((f) => f.name).join(' + ');

      fieldMappings.push({
        fieldId: segment.fields[0].id,
        fieldName: groupLabel,
        fieldType: 'bitfield',
        startOffset,
        endOffset: cursor,
        byteLength: decodedGroup.bytesRead,
        isVariableLength: false,
        endianness: decodedGroup.endianness,
        color: groupColor,
        rawHex,
      });

      decodedGroup.entries.forEach((entry, idx) => {
        values[entry.field.name] = entry.value;
        decodedNumericValues[entry.field.name] = entry.value;

        const bitRange: BitRange = {
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
        };
        bitRanges.push(bitRange);

        decodedEntries.push({
          fieldId: entry.field.id,
          fieldName: entry.field.name,
          fieldType: 'bitfield',
          value: entry.value,
          formattedValue: `${entry.value} (0b${entry.value.toString(2).padStart(entry.bitWidth, '0')})`,
          startOffset,
          endOffset: cursor,
          byteLength: decodedGroup.bytesRead,
          rawHex,
          endianness: decodedGroup.endianness,
          isBitfield: true,
          bitRange,
        });
      });
    } else {
      const field = segment.fields[0];
      const startOffset = cursor;
      const decoded = decodeField(
        bytes,
        view,
        cursor,
        maxPayloadEnd,
        field,
        schema.endianness,
        decodedNumericValues
      );

      if (!decoded.ok) {
        errors.push(decoded.error);
        break;
      }

      cursor += decoded.bytesRead;
      const rawSlice = bytes.subarray(startOffset, cursor);
      const rawHex = bytesToHexString(rawSlice);
      const endianness = field.endianness ?? schema.endianness;

      values[field.name] = decoded.value;
      if (typeof decoded.value === 'number') {
        decodedNumericValues[field.name] = decoded.value;
      }

      fieldMappings.push({
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.type,
        startOffset,
        endOffset: cursor,
        byteLength: decoded.bytesRead,
        isVariableLength: decoded.isVariableLength,
        endianness,
        color: getFieldColor(field, segment.startIndex),
        rawHex,
        description: field.description,
      });

      decodedEntries.push({
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.type,
        value: decoded.value,
        formattedValue: formatDecodedFieldValue(decoded.value, field.type),
        startOffset,
        endOffset: cursor,
        byteLength: decoded.bytesRead,
        rawHex,
        endianness,
      });
    }
  }

  let checksumVerification: ChecksumVerification | undefined;

  if (errors.length === 0 && csConfig) {
    const csOffset = cursor;
    const csEndianness = csConfig.endianness ?? schema.endianness;

    if (bytes.length - csOffset < csByteLength) {
      errors.push({
        code: 'INSUFFICIENT_BYTES_FOR_CHECKSUM',
        fieldName: csConfig.fieldName ?? 'checksum',
        byteOffset: csOffset,
        expected: `${csByteLength} bytes for ${csConfig.algorithm}`,
        received: `${bytes.length - csOffset} bytes remaining`,
        message: `Insufficient bytes at offset ${csOffset} for ${csConfig.algorithm} checksum (expected ${csByteLength}B, got ${bytes.length - csOffset}B).`,
      });
    } else {
      const little = csEndianness === 'little';
      let storedValue: number;
      if (csByteLength === 1) {
        storedValue = view.getUint8(csOffset);
      } else if (csByteLength === 2) {
        storedValue = view.getUint16(csOffset, little);
      } else {
        storedValue = view.getUint32(csOffset, little);
      }

      const startRange = csConfig.startOffset ?? 0;
      const endRange = csConfig.endOffset !== undefined ? csConfig.endOffset : csOffset;

      if (startRange < 0 || endRange < startRange || endRange > csOffset) {
        errors.push({
          code: 'INVALID_CHECKSUM_RANGE',
          fieldName: csConfig.fieldName ?? 'checksum',
          byteOffset: csOffset,
          expected: `0 <= startOffset <= endOffset <= ${csOffset}`,
          received: `[${startRange}, ${endRange})`,
          message: `Configured checksum range [${startRange}, ${endRange}) is invalid for payload ending at byte ${csOffset}.`,
        });
      } else {
        const computed = calculateChecksum(csConfig.algorithm, bytes, startRange, endRange);
        const valid = computed.value === storedValue;

        checksumVerification = {
          algorithm: csConfig.algorithm,
          expected: computed.value,
          expectedHex: computed.hex,
          actual: storedValue,
          actualHex: formatChecksumHex(storedValue, csConfig.algorithm),
          valid,
          startOffset: startRange,
          endOffset: endRange,
          checksumOffset: csOffset,
          checksumLength: csByteLength,
        };

        const csRawHex = bytesToHexString(bytes.subarray(csOffset, csOffset + csByteLength));
        cursor += csByteLength;

        fieldMappings.push({
          fieldId: '__checksum__',
          fieldName: csConfig.fieldName ?? 'checksum',
          fieldType: 'checksum',
          startOffset: csOffset,
          endOffset: cursor,
          byteLength: csByteLength,
          isVariableLength: false,
          endianness: csEndianness,
          color: '#22D3EE',
          rawHex: csRawHex,
        });

        decodedEntries.push({
          fieldId: '__checksum__',
          fieldName: csConfig.fieldName ?? 'checksum',
          fieldType: 'checksum',
          value: storedValue,
          formattedValue: `0x${checksumVerification.actualHex} (${valid ? 'VALID' : `MISMATCH — expected 0x${checksumVerification.expectedHex}`})`,
          startOffset: csOffset,
          endOffset: cursor,
          byteLength: csByteLength,
          rawHex: csRawHex,
          endianness: csEndianness,
        });

        if (!valid) {
          errors.push({
            code: 'CHECKSUM_MISMATCH',
            fieldName: csConfig.fieldName ?? 'checksum',
            byteOffset: csOffset,
            expected: `0x${checksumVerification.expectedHex}`,
            received: `0x${checksumVerification.actualHex}`,
            message: `${csConfig.algorithm} checksum mismatch at offset ${csOffset}: packet has 0x${checksumVerification.actualHex}, calculated 0x${checksumVerification.expectedHex}.`,
          });
        }
      }
    }
  }

  const trailingBytes =
    cursor < bytes.length ? bytes.slice(cursor, bytes.length) : new Uint8Array(0);

  if (trailingBytes.length > 0 && errors.length === 0) {
    if (strictMode) {
      errors.push({
        code: 'UNEXPECTED_TRAILING_BYTES',
        byteOffset: cursor,
        expected: `Packet end at byte ${cursor}`,
        received: `${trailingBytes.length} trailing byte(s): ${bytesToHexString(trailingBytes.subarray(0, 16))}`,
        message: `Strict mode rejected ${trailingBytes.length} unexpected trailing byte(s) starting at offset ${cursor}.`,
      });
    } else {
      warnings.push({
        severity: 'warning',
        code: 'TRAILING_BYTES_IGNORED',
        byteOffset: cursor,
        expected: `${cursor} bytes`,
        received: `${bytes.length} bytes (${trailingBytes.length} trailing)`,
        message: `${trailingBytes.length} unmapped trailing byte(s) detected after offset ${cursor}.`,
      });
    }
  }

  return {
    success: errors.length === 0,
    bytes,
    byteLength: bytes.length,
    values,
    fields: decodedEntries,
    fieldMappings,
    bitRanges,
    checksum: checksumVerification,
    trailingBytes,
    errors,
    warnings,
  };
}
