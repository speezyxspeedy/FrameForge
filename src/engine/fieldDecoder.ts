import type {
  BitOrder,
  DecodingError,
  Endianness,
  FieldValue,
  LengthPrefixType,
  ProtocolField,
} from '../types/protocol';
import { INTEGER_BOUNDS, MAX_SAFE_FIELD_BYTES, resolveBitStorageBytes } from './fieldEncoder';

const textDecoder = new TextDecoder('utf-8', { fatal: false });

export interface FieldDecodeOutcome {
  ok: true;
  value: FieldValue;
  bytesRead: number;
  isVariableLength: boolean;
}

export interface FieldDecodeFailure {
  ok: false;
  error: DecodingError;
}

export type FieldDecodeResult = FieldDecodeOutcome | FieldDecodeFailure;

function readUnsignedPrefix(
  view: DataView,
  offset: number,
  prefixType: LengthPrefixType,
  endianness: Endianness,
  availableBytes: number,
  field: ProtocolField
): { ok: true; value: number; prefixBytes: number } | { ok: false; error: DecodingError } {
  const prefixBytes = INTEGER_BOUNDS[prefixType].bytes;
  if (availableBytes < prefixBytes) {
    return {
      ok: false,
      error: {
        code: 'INSUFFICIENT_BYTES',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset: offset,
        expected: `${prefixBytes} bytes for ${prefixType} length prefix`,
        received: `${availableBytes} bytes remaining`,
        message: `Insufficient bytes at offset 0x${offset.toString(16).toUpperCase()} for "${field.name}" length prefix (${prefixType} needs ${prefixBytes}B, only ${availableBytes}B available).`,
      },
    };
  }

  const little = endianness === 'little';
  let value: number;
  if (prefixType === 'uint8') {
    value = view.getUint8(offset);
  } else if (prefixType === 'uint16') {
    value = view.getUint16(offset, little);
  } else {
    value = view.getUint32(offset, little);
  }

  if (value > MAX_SAFE_FIELD_BYTES) {
    return {
      ok: false,
      error: {
        code: 'UNSAFE_LENGTH_PREFIX',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset: offset,
        expected: `Length prefix <= ${MAX_SAFE_FIELD_BYTES} bytes`,
        received: `${value} bytes`,
        message: `Length prefix for "${field.name}" (${value} bytes) exceeds safe buffer limit (${MAX_SAFE_FIELD_BYTES}).`,
      },
    };
  }

  return { ok: true, value, prefixBytes };
}

export function decodeField(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  maxReadableEnd: number,
  field: ProtocolField,
  globalEndianness: Endianness,
  decodedNumericValues: Record<string, number>
): FieldDecodeResult {
  const endianness = field.endianness ?? globalEndianness;
  const remaining = maxReadableEnd - offset;

  if (endianness !== 'big' && endianness !== 'little') {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_ENDIANNESS',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset: offset,
        expected: '"big" or "little"',
        received: String(endianness),
        message: `Field "${field.name}" has unsupported byte order "${String(endianness)}".`,
      },
    };
  }

  const little = endianness === 'little';

  switch (field.type) {
    case 'uint8':
    case 'int8':
    case 'boolean': {
      if (remaining < 1) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_BYTES',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset,
            expected: '1 byte',
            received: `${remaining} bytes remaining`,
            message: `Insufficient data at offset ${offset} for "${field.name}" (${field.type} requires 1 byte, ${remaining} available).`,
          },
        };
      }
      const val =
        field.type === 'uint8'
          ? view.getUint8(offset)
          : field.type === 'int8'
            ? view.getInt8(offset)
            : view.getUint8(offset) !== 0;
      return { ok: true, value: val, bytesRead: 1, isVariableLength: false };
    }

    case 'uint16':
    case 'int16': {
      if (remaining < 2) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_BYTES',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset,
            expected: '2 bytes',
            received: `${remaining} bytes remaining`,
            message: `Insufficient data at offset ${offset} for "${field.name}" (${field.type} requires 2 bytes, ${remaining} available).`,
          },
        };
      }
      const val =
        field.type === 'uint16' ? view.getUint16(offset, little) : view.getInt16(offset, little);
      return { ok: true, value: val, bytesRead: 2, isVariableLength: false };
    }

    case 'uint32':
    case 'int32':
    case 'float32': {
      if (remaining < 4) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_BYTES',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset,
            expected: '4 bytes',
            received: `${remaining} bytes remaining`,
            message: `Insufficient data at offset ${offset} for "${field.name}" (${field.type} requires 4 bytes, ${remaining} available).`,
          },
        };
      }
      const val =
        field.type === 'uint32'
          ? view.getUint32(offset, little)
          : field.type === 'int32'
            ? view.getInt32(offset, little)
            : view.getFloat32(offset, little);
      return { ok: true, value: val, bytesRead: 4, isVariableLength: false };
    }

    case 'float64': {
      if (remaining < 8) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_BYTES',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset,
            expected: '8 bytes',
            received: `${remaining} bytes remaining`,
            message: `Insufficient data at offset ${offset} for "${field.name}" (float64 requires 8 bytes, ${remaining} available).`,
          },
        };
      }
      return {
        ok: true,
        value: view.getFloat64(offset, little),
        bytesRead: 8,
        isVariableLength: false,
      };
    }

    case 'utf8_fixed': {
      const len = field.length;
      if (!Number.isInteger(len) || (len ?? 0) <= 0 || (len ?? 0) > MAX_SAFE_FIELD_BYTES) {
        return {
          ok: false,
          error: {
            code: 'INVALID_FIELD_LENGTH',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset,
            expected: `Integer length in [1, ${MAX_SAFE_FIELD_BYTES}]`,
            received: String(len),
            message: `Fixed-length string "${field.name}" has invalid length ${String(len)}.`,
          },
        };
      }
      const targetLen = len as number;
      if (remaining < targetLen) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_BYTES',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset,
            expected: `${targetLen} bytes`,
            received: `${remaining} bytes remaining`,
            message: `Insufficient data at offset ${offset} for fixed string "${field.name}" (requires ${targetLen} bytes, ${remaining} available).`,
          },
        };
      }
      const padByte = field.paddingByte ?? 0x00;
      const rawSlice = bytes.subarray(offset, offset + targetLen);
      let trimEnd = rawSlice.length;
      while (trimEnd > 0 && rawSlice[trimEnd - 1] === padByte) {
        trimEnd--;
      }
      const decodedStr = textDecoder.decode(rawSlice.subarray(0, trimEnd));
      return { ok: true, value: decodedStr, bytesRead: targetLen, isVariableLength: false };
    }

    case 'utf8_null': {
      const termByte = field.terminatorByte ?? 0x00;
      let termIndex = -1;
      for (let i = offset; i < maxReadableEnd; i++) {
        if (bytes[i] === termByte) {
          termIndex = i;
          break;
        }
      }
      if (termIndex === -1) {
        return {
          ok: false,
          error: {
            code: 'MISSING_NULL_TERMINATOR',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset,
            expected: `Terminator byte 0x${termByte.toString(16).toUpperCase().padStart(2, '0')} before end of packet`,
            received: `${remaining} bytes without terminator`,
            message: `Null-terminated string "${field.name}" at offset ${offset} is missing terminator byte 0x${termByte.toString(16).toUpperCase().padStart(2, '0')}.`,
          },
        };
      }
      const strBytes = bytes.subarray(offset, termIndex);
      const decodedStr = textDecoder.decode(strBytes);
      return {
        ok: true,
        value: decodedStr,
        bytesRead: termIndex - offset + 1,
        isVariableLength: true,
      };
    }

    case 'utf8_length_prefixed': {
      const prefixType = field.lengthPrefixType ?? 'uint16';
      const prefix = readUnsignedPrefix(view, offset, prefixType, endianness, remaining, field);
      if (!prefix.ok) {
        return prefix;
      }
      const payloadAvailable = remaining - prefix.prefixBytes;
      if (payloadAvailable < prefix.value) {
        return {
          ok: false,
          error: {
            code: 'INSUFFICIENT_BYTES',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset: offset + prefix.prefixBytes,
            expected: `${prefix.value} UTF-8 bytes (declared by ${prefixType} prefix)`,
            received: `${payloadAvailable} bytes remaining`,
            message: `Length-prefixed string "${field.name}" declares ${prefix.value} bytes, but only ${payloadAvailable} bytes remain.`,
          },
        };
      }
      const strSlice = bytes.subarray(
        offset + prefix.prefixBytes,
        offset + prefix.prefixBytes + prefix.value
      );
      return {
        ok: true,
        value: textDecoder.decode(strSlice),
        bytesRead: prefix.prefixBytes + prefix.value,
        isVariableLength: true,
      };
    }

    case 'bytes': {
      const mode = field.bytesLengthMode ?? (field.length !== undefined ? 'fixed' : 'remaining');
      if (mode === 'fixed') {
        const len = field.length;
        if (!Number.isInteger(len) || (len ?? 0) < 0 || (len ?? 0) > MAX_SAFE_FIELD_BYTES) {
          return {
            ok: false,
            error: {
              code: 'INVALID_FIELD_LENGTH',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset: offset,
              expected: `Integer length in [0, ${MAX_SAFE_FIELD_BYTES}]`,
              received: String(len),
              message: `Fixed byte array "${field.name}" has invalid length ${String(len)}.`,
            },
          };
        }
        const targetLen = len as number;
        if (remaining < targetLen) {
          return {
            ok: false,
            error: {
              code: 'INSUFFICIENT_BYTES',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset: offset,
              expected: `${targetLen} bytes`,
              received: `${remaining} bytes remaining`,
              message: `Insufficient bytes at offset ${offset} for byte array "${field.name}" (requires ${targetLen}B, ${remaining}B available).`,
            },
          };
        }
        return {
          ok: true,
          value: bytes.slice(offset, offset + targetLen),
          bytesRead: targetLen,
          isVariableLength: false,
        };
      }

      if (mode === 'length_prefixed') {
        const prefixType = field.lengthPrefixType ?? 'uint16';
        const prefix = readUnsignedPrefix(view, offset, prefixType, endianness, remaining, field);
        if (!prefix.ok) {
          return prefix;
        }
        const payloadAvailable = remaining - prefix.prefixBytes;
        if (payloadAvailable < prefix.value) {
          return {
            ok: false,
            error: {
              code: 'INSUFFICIENT_BYTES',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset: offset + prefix.prefixBytes,
              expected: `${prefix.value} bytes (declared by ${prefixType} prefix)`,
              received: `${payloadAvailable} bytes remaining`,
              message: `Length-prefixed byte array "${field.name}" declares ${prefix.value} bytes, but only ${payloadAvailable} bytes remain.`,
            },
          };
        }
        return {
          ok: true,
          value: bytes.slice(
            offset + prefix.prefixBytes,
            offset + prefix.prefixBytes + prefix.value
          ),
          bytesRead: prefix.prefixBytes + prefix.value,
          isVariableLength: true,
        };
      }

      if (mode === 'field_ref') {
        const refName = field.lengthFieldName;
        if (!refName) {
          return {
            ok: false,
            error: {
              code: 'MISSING_LENGTH_FIELD_REF',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset: offset,
              expected: 'Configured lengthFieldName',
              received: 'undefined',
              message: `Byte array "${field.name}" uses field_ref mode without a lengthFieldName.`,
            },
          };
        }
        const expectedLen = decodedNumericValues[refName];
        if (expectedLen === undefined || !Number.isInteger(expectedLen) || expectedLen < 0) {
          return {
            ok: false,
            error: {
              code: 'INVALID_LENGTH_FIELD_REF',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset: offset,
              expected: `Non-negative integer from earlier field "${refName}"`,
              received: String(expectedLen),
              message: `Byte array "${field.name}" cannot read length from earlier field "${refName}" (value: ${String(expectedLen)}).`,
            },
          };
        }
        if (expectedLen > MAX_SAFE_FIELD_BYTES) {
          return {
            ok: false,
            error: {
              code: 'UNSAFE_LENGTH_PREFIX',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset: offset,
              expected: `<= ${MAX_SAFE_FIELD_BYTES} bytes`,
              received: `${expectedLen} bytes`,
              message: `Referenced length (${expectedLen} bytes) for "${field.name}" exceeds safe buffer limit.`,
            },
          };
        }
        if (remaining < expectedLen) {
          return {
            ok: false,
            error: {
              code: 'INSUFFICIENT_BYTES',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset: offset,
              expected: `${expectedLen} bytes (declared by "${refName}")`,
              received: `${remaining} bytes remaining`,
              message: `Byte array "${field.name}" expects ${expectedLen} bytes (from "${refName}"), but only ${remaining} bytes remain.`,
            },
          };
        }
        return {
          ok: true,
          value: bytes.slice(offset, offset + expectedLen),
          bytesRead: expectedLen,
          isVariableLength: true,
        };
      }

      // remaining
      const slice = bytes.slice(offset, maxReadableEnd);
      return { ok: true, value: slice, bytesRead: slice.length, isVariableLength: true };
    }

    default:
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_FIELD_TYPE',
          fieldId: field.id,
          fieldName: field.name,
          byteOffset: offset,
          expected: 'Supported FieldType',
          received: String(field.type),
          message: `Unsupported field type "${String(field.type)}".`,
        },
      };
  }
}

export interface DecodedBitfieldEntry {
  field: ProtocolField;
  value: number;
  bitOffset: number;
  bitWidth: number;
  bitOrder: BitOrder;
  storageBytes: 1 | 2 | 4;
  lsbStart: number;
  lsbEnd: number;
}

export function decodeBitfieldGroup(
  view: DataView,
  offset: number,
  maxReadableEnd: number,
  fields: ProtocolField[],
  globalEndianness: Endianness
):
  | { ok: true; entries: DecodedBitfieldEntry[]; bytesRead: number; endianness: Endianness }
  | { ok: false; error: DecodingError } {
  const storageBytes = resolveBitStorageBytes(fields);
  const storageBits = storageBytes * 8;
  const endianness = fields[0]?.endianness ?? globalEndianness;
  const remaining = maxReadableEnd - offset;

  if (remaining < storageBytes) {
    return {
      ok: false,
      error: {
        code: 'INSUFFICIENT_BYTES',
        fieldId: fields[0]?.id,
        fieldName: fields[0]?.name,
        byteOffset: offset,
        expected: `${storageBytes} bytes for bitfield storage unit`,
        received: `${remaining} bytes remaining`,
        message: `Insufficient bytes at offset ${offset} for bitfield "${fields[0]?.name ?? 'group'}" (requires ${storageBytes}B, ${remaining}B available).`,
      },
    };
  }

  const little = endianness === 'little';
  let rawUnit: number;
  if (storageBytes === 1) {
    rawUnit = view.getUint8(offset);
  } else if (storageBytes === 2) {
    rawUnit = view.getUint16(offset, little);
  } else {
    rawUnit = view.getUint32(offset, little);
  }

  const entries: DecodedBitfieldEntry[] = [];
  for (const field of fields) {
    const bitWidth = field.bitWidth ?? 1;
    const bitOffset = field.bitOffset ?? 0;
    const bitOrder: BitOrder = field.bitOrder ?? 'msb-first';

    if (!Number.isInteger(bitWidth) || bitWidth < 1 || bitWidth > 32 || bitOffset + bitWidth > storageBits) {
      return {
        ok: false,
        error: {
          code: 'INVALID_BITFIELD_CONFIG',
          fieldId: field.id,
          fieldName: field.name,
          byteOffset: offset,
          expected: `bitWidth in [1, 32] and bitOffset + bitWidth <= ${storageBits}`,
          received: `offset ${bitOffset}, width ${bitWidth}`,
          message: `Bit field "${field.name}" configuration exceeds ${storageBits}-bit storage unit.`,
        },
      };
    }

    const lsbStart = bitOrder === 'lsb-first' ? bitOffset : storageBits - bitOffset - bitWidth;
    const lsbEnd = lsbStart + bitWidth - 1;
    const mask = bitWidth === 32 ? 0xffffffff : (1 << bitWidth) - 1;
    const value = ((rawUnit >>> lsbStart) & mask) >>> 0;

    entries.push({
      field,
      value,
      bitOffset,
      bitWidth,
      bitOrder,
      storageBytes,
      lsbStart,
      lsbEnd,
    });
  }

  return { ok: true, entries, bytesRead: storageBytes, endianness };
}
