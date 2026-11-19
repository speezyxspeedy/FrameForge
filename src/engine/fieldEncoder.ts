import type {
  BitOrder,
  Endianness,
  EncodingError,
  FieldType,
  FieldValue,
  LengthPrefixType,
  ProtocolField,
} from '../types/protocol';

export const MAX_SAFE_FIELD_BYTES = 1024 * 1024; // 1 MiB per field guard

export const INTEGER_BOUNDS: Record<
  'uint8' | 'uint16' | 'uint32' | 'int8' | 'int16' | 'int32',
  { min: number; max: number; bytes: number }
> = {
  uint8: { min: 0, max: 255, bytes: 1 },
  uint16: { min: 0, max: 65535, bytes: 2 },
  uint32: { min: 0, max: 4294967295, bytes: 4 },
  int8: { min: -128, max: 127, bytes: 1 },
  int16: { min: -32768, max: 32767, bytes: 2 },
  int32: { min: -2147483648, max: 2147483647, bytes: 4 },
};

const textEncoder = new TextEncoder();

export interface FieldEncodeOutcome {
  ok: true;
  bytes: Uint8Array;
  isVariableLength: boolean;
}

export interface FieldEncodeFailure {
  ok: false;
  error: EncodingError;
}

export type FieldEncodeResult = FieldEncodeOutcome | FieldEncodeFailure;

export function parseStrictNumeric(raw: FieldValue): { ok: true; value: number } | { ok: false; received: string } {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { ok: false, received: String(raw) };
    }
    return { ok: true, value: raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return { ok: false, received: '(empty string)' };
    }
    let parsed: number;
    if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
      parsed = Number.parseInt(trimmed, 16);
    } else if (/^0b[01]+$/i.test(trimmed)) {
      parsed = Number.parseInt(trimmed.slice(2), 2);
    } else {
      parsed = Number(trimmed);
    }
    if (!Number.isFinite(parsed)) {
      return { ok: false, received: JSON.stringify(raw) };
    }
    return { ok: true, value: parsed };
  }
  return { ok: false, received: typeof raw };
}

export function parseHexInputToBytes(input: string): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, bytes: new Uint8Array(0) };
  }

  // Normalize tokens separated by whitespace, commas, colons, or hyphens; allow 0x prefixes
  const rawTokens = trimmed.split(/[\s,:-]+/).filter(Boolean);
  const hexPairs: string[] = [];

  for (const token of rawTokens) {
    const clean = token.startsWith('0x') || token.startsWith('0X') ? token.slice(2) : token;
    if (clean.length === 0) {
      return { ok: false, error: `Empty hex token "${token}".` };
    }
    if (!/^[0-9a-fA-F]+$/.test(clean)) {
      const badChar = clean.match(/[^0-9a-fA-F]/)?.[0] ?? '?';
      return {
        ok: false,
        error: `Invalid hexadecimal character '${badChar}' in token "${token}".`,
      };
    }
    if (clean.length % 2 !== 0) {
      return {
        ok: false,
        error: `Odd number of hex digits (${clean.length}) in token "${token}". Each byte requires 2 hex characters.`,
      };
    }
    for (let i = 0; i < clean.length; i += 2) {
      hexPairs.push(clean.slice(i, i + 2));
    }
  }

  if (hexPairs.length > MAX_SAFE_FIELD_BYTES) {
    return {
      ok: false,
      error: `Hex input exceeds maximum supported length of ${MAX_SAFE_FIELD_BYTES} bytes.`,
    };
  }

  const out = new Uint8Array(hexPairs.length);
  for (let i = 0; i < hexPairs.length; i++) {
    out[i] = Number.parseInt(hexPairs[i], 16);
  }
  return { ok: true, bytes: out };
}

export function coerceBytesValue(
  raw: FieldValue
): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  if (raw instanceof Uint8Array) {
    return { ok: true, bytes: raw };
  }
  if (Array.isArray(raw)) {
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const n = Number(raw[i]);
      if (!Number.isInteger(n) || n < 0 || n > 255) {
        return {
          ok: false,
          error: `Byte array element at index ${i} (${String(raw[i])}) must be an integer between 0 and 255.`,
        };
      }
      arr[i] = n;
    }
    return { ok: true, bytes: arr };
  }
  if (typeof raw === 'string') {
    return parseHexInputToBytes(raw);
  }
  return {
    ok: false,
    error: `Expected a Uint8Array or hex string for raw bytes field, received ${typeof raw}.`,
  };
}

export function writeUnsignedPrefix(
  length: number,
  prefixType: LengthPrefixType,
  endianness: Endianness
): { ok: true; bytes: Uint8Array } | { ok: false; max: number } {
  const bounds = INTEGER_BOUNDS[prefixType];
  if (!Number.isInteger(length) || length < 0 || length > bounds.max) {
    return { ok: false, max: bounds.max };
  }
  const buffer = new ArrayBuffer(bounds.bytes);
  const view = new DataView(buffer);
  const little = endianness === 'little';
  if (prefixType === 'uint8') {
    view.setUint8(0, length);
  } else if (prefixType === 'uint16') {
    view.setUint16(0, length, little);
  } else {
    view.setUint32(0, length, little);
  }
  return { ok: true, bytes: new Uint8Array(buffer) };
}

/**
 * Truncates a UTF-8 string safely at code-point boundaries so no multi-byte character is ever split.
 */
export function truncateUtf8Safely(text: string, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const ch of text) {
    const encoded = textEncoder.encode(ch);
    if (total + encoded.length > maxBytes) {
      break;
    }
    chunks.push(encoded);
    total += encoded.length;
  }
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}

export function encodeIntegerField(
  type: 'uint8' | 'uint16' | 'uint32' | 'int8' | 'int16' | 'int32',
  raw: FieldValue,
  endianness: Endianness,
  field: ProtocolField,
  byteOffset: number
): FieldEncodeResult {
  const parsed = parseStrictNumeric(raw);
  const bounds = INTEGER_BOUNDS[type];

  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_NUMERIC_INPUT',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset,
        expected: `Integer in [${bounds.min}, ${bounds.max}]`,
        received: parsed.received,
        message: `Field "${field.name}" (${type}) expects a valid integer, received ${parsed.received}.`,
      },
    };
  }

  const num = parsed.value;
  if (!Number.isInteger(num)) {
    return {
      ok: false,
      error: {
        code: 'NON_INTEGER_VALUE',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset,
        expected: `Whole integer in [${bounds.min}, ${bounds.max}]`,
        received: String(num),
        message: `Field "${field.name}" (${type}) does not accept fractional number ${num}.`,
      },
    };
  }

  if (num < bounds.min || num > bounds.max) {
    return {
      ok: false,
      error: {
        code: 'INTEGER_OUT_OF_RANGE',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset,
        expected: `[${bounds.min}, ${bounds.max}]`,
        received: String(num),
        message: `Field "${field.name}" (${type}) value ${num} is out of range [${bounds.min}, ${bounds.max}].`,
      },
    };
  }

  const buffer = new ArrayBuffer(bounds.bytes);
  const view = new DataView(buffer);
  const little = endianness === 'little';

  switch (type) {
    case 'uint8':
      view.setUint8(0, num);
      break;
    case 'uint16':
      view.setUint16(0, num, little);
      break;
    case 'uint32':
      view.setUint32(0, num, little);
      break;
    case 'int8':
      view.setInt8(0, num);
      break;
    case 'int16':
      view.setInt16(0, num, little);
      break;
    case 'int32':
      view.setInt32(0, num, little);
      break;
  }

  return { ok: true, bytes: new Uint8Array(buffer), isVariableLength: false };
}

export function encodeFloatField(
  type: 'float32' | 'float64',
  raw: FieldValue,
  endianness: Endianness,
  field: ProtocolField,
  byteOffset: number
): FieldEncodeResult {
  const parsed = parseStrictNumeric(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_FLOAT_INPUT',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset,
        expected: `Finite IEEE 754 ${type} number`,
        received: parsed.received,
        message: `Field "${field.name}" (${type}) expects a finite number, received ${parsed.received}.`,
      },
    };
  }

  const byteLen = type === 'float32' ? 4 : 8;
  const buffer = new ArrayBuffer(byteLen);
  const view = new DataView(buffer);
  const little = endianness === 'little';

  if (type === 'float32') {
    view.setFloat32(0, parsed.value, little);
    if (!Number.isFinite(view.getFloat32(0, little))) {
      return {
        ok: false,
        error: {
          code: 'FLOAT32_OVERFLOW',
          fieldId: field.id,
          fieldName: field.name,
          byteOffset,
          expected: 'Value within IEEE 754 float32 finite range (±3.4028235e38)',
          received: String(parsed.value),
          message: `Field "${field.name}" overflows IEEE 754 float32 precision.`,
        },
      };
    }
  } else {
    view.setFloat64(0, parsed.value, little);
  }

  return { ok: true, bytes: new Uint8Array(buffer), isVariableLength: false };
}

export function encodeField(
  field: ProtocolField,
  rawValue: FieldValue | undefined,
  globalEndianness: Endianness,
  byteOffset: number,
  encodedFieldNumericValues?: Record<string, number>
): FieldEncodeResult {
  const endianness = field.endianness ?? globalEndianness;

  if (endianness !== 'big' && endianness !== 'little') {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_ENDIANNESS',
        fieldId: field.id,
        fieldName: field.name,
        byteOffset,
        expected: '"big" or "little"',
        received: String(endianness),
        message: `Field "${field.name}" has unsupported byte order "${String(endianness)}".`,
      },
    };
  }

  if (rawValue === undefined || rawValue === null) {
    if (field.required) {
      return {
        ok: false,
        error: {
          code: 'MISSING_REQUIRED_FIELD',
          fieldId: field.id,
          fieldName: field.name,
          byteOffset,
          expected: `Value for ${field.type}`,
          received: 'undefined',
          message: `Required field "${field.name}" is missing a value.`,
        },
      };
    }
    return { ok: true, bytes: new Uint8Array(0), isVariableLength: false };
  }

  switch (field.type) {
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'int8':
    case 'int16':
    case 'int32':
      return encodeIntegerField(field.type, rawValue, endianness, field, byteOffset);

    case 'float32':
    case 'float64':
      return encodeFloatField(field.type, rawValue, endianness, field, byteOffset);

    case 'boolean': {
      let boolVal: boolean;
      if (typeof rawValue === 'boolean') {
        boolVal = rawValue;
      } else if (rawValue === 0 || rawValue === 1) {
        boolVal = rawValue === 1;
      } else if (rawValue === 'true' || rawValue === 'false') {
        boolVal = rawValue === 'true';
      } else {
        return {
          ok: false,
          error: {
            code: 'INVALID_BOOLEAN',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'boolean (true/false)',
            received: String(rawValue),
            message: `Field "${field.name}" expects a boolean value, received ${String(rawValue)}.`,
          },
        };
      }
      return {
        ok: true,
        bytes: new Uint8Array([boolVal ? 1 : 0]),
        isVariableLength: false,
      };
    }

    case 'utf8_fixed': {
      const targetLen = field.length;
      if (!Number.isInteger(targetLen) || (targetLen ?? 0) <= 0 || (targetLen ?? 0) > MAX_SAFE_FIELD_BYTES) {
        return {
          ok: false,
          error: {
            code: 'INVALID_FIELD_LENGTH',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: `Integer length in [1, ${MAX_SAFE_FIELD_BYTES}]`,
            received: String(targetLen),
            message: `Fixed-length string field "${field.name}" has invalid byte length ${String(targetLen)}.`,
          },
        };
      }
      if (typeof rawValue !== 'string') {
        return {
          ok: false,
          error: {
            code: 'INVALID_STRING_INPUT',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'UTF-8 string',
            received: typeof rawValue,
            message: `Field "${field.name}" expects a string, received ${typeof rawValue}.`,
          },
        };
      }
      const padByte = field.paddingByte ?? 0x00;
      if (!Number.isInteger(padByte) || padByte < 0 || padByte > 255) {
        return {
          ok: false,
          error: {
            code: 'INVALID_PADDING_BYTE',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'Integer in [0, 255]',
            received: String(padByte),
            message: `Field "${field.name}" has invalid padding byte ${String(padByte)}.`,
          },
        };
      }

      const encoded = textEncoder.encode(rawValue);
      const len = targetLen as number;
      if (encoded.length > len && !field.truncate) {
        return {
          ok: false,
          error: {
            code: 'STRING_EXCEEDS_FIXED_LENGTH',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: `At most ${len} UTF-8 bytes`,
            received: `${encoded.length} UTF-8 bytes`,
            message: `String "${field.name}" encodes to ${encoded.length} UTF-8 bytes, exceeding fixed length ${len} (truncation disabled).`,
          },
        };
      }

      const slice = encoded.length > len ? truncateUtf8Safely(rawValue, len) : encoded;
      const out = new Uint8Array(len);
      out.fill(padByte);
      out.set(slice, 0);
      return { ok: true, bytes: out, isVariableLength: false };
    }

    case 'utf8_null': {
      if (typeof rawValue !== 'string') {
        return {
          ok: false,
          error: {
            code: 'INVALID_STRING_INPUT',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'UTF-8 string',
            received: typeof rawValue,
            message: `Field "${field.name}" expects a string, received ${typeof rawValue}.`,
          },
        };
      }
      const termByte = field.terminatorByte ?? 0x00;
      if (!Number.isInteger(termByte) || termByte < 0 || termByte > 255) {
        return {
          ok: false,
          error: {
            code: 'INVALID_TERMINATOR_BYTE',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'Integer in [0, 255]',
            received: String(termByte),
            message: `Field "${field.name}" has invalid terminator byte ${String(termByte)}.`,
          },
        };
      }
      const encoded = textEncoder.encode(rawValue);
      if (!field.allowEmbeddedTerminator && encoded.includes(termByte)) {
        return {
          ok: false,
          error: {
            code: 'EMBEDDED_TERMINATOR',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: `UTF-8 string without embedded 0x${termByte.toString(16).toUpperCase().padStart(2, '0')} byte`,
            received: `Contains 0x${termByte.toString(16).toUpperCase().padStart(2, '0')}`,
            message: `Null-terminated string "${field.name}" contains an embedded terminator byte (0x${termByte.toString(16).toUpperCase().padStart(2, '0')}).`,
          },
        };
      }
      const out = new Uint8Array(encoded.length + 1);
      out.set(encoded, 0);
      out[encoded.length] = termByte;
      return { ok: true, bytes: out, isVariableLength: true };
    }

    case 'utf8_length_prefixed': {
      if (typeof rawValue !== 'string') {
        return {
          ok: false,
          error: {
            code: 'INVALID_STRING_INPUT',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'UTF-8 string',
            received: typeof rawValue,
            message: `Field "${field.name}" expects a string, received ${typeof rawValue}.`,
          },
        };
      }
      const prefixType = field.lengthPrefixType ?? 'uint16';
      const encoded = textEncoder.encode(rawValue);
      const prefixResult = writeUnsignedPrefix(encoded.length, prefixType, endianness);
      if (!prefixResult.ok) {
        return {
          ok: false,
          error: {
            code: 'LENGTH_PREFIX_OVERFLOW',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: `At most ${prefixResult.max} UTF-8 bytes for ${prefixType} prefix`,
            received: `${encoded.length} bytes`,
            message: `Field "${field.name}" UTF-8 byte length (${encoded.length}) exceeds ${prefixType} prefix capacity (${prefixResult.max}).`,
          },
        };
      }
      const out = new Uint8Array(prefixResult.bytes.length + encoded.length);
      out.set(prefixResult.bytes, 0);
      out.set(encoded, prefixResult.bytes.length);
      return { ok: true, bytes: out, isVariableLength: true };
    }

    case 'bytes': {
      const coerced = coerceBytesValue(rawValue);
      if (!coerced.ok) {
        return {
          ok: false,
          error: {
            code: 'INVALID_BYTE_ARRAY',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'Valid hex byte sequence or Uint8Array',
            received: String(rawValue),
            message: `Field "${field.name}": ${coerced.error}`,
          },
        };
      }

      const rawBytes = coerced.bytes;
      const mode = field.bytesLengthMode ?? (field.length !== undefined ? 'fixed' : 'remaining');

      if (mode === 'fixed') {
        const expectedLen = field.length;
        if (!Number.isInteger(expectedLen) || (expectedLen ?? 0) < 0 || (expectedLen ?? 0) > MAX_SAFE_FIELD_BYTES) {
          return {
            ok: false,
            error: {
              code: 'INVALID_FIELD_LENGTH',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset,
              expected: `Non-negative integer length <= ${MAX_SAFE_FIELD_BYTES}`,
              received: String(expectedLen),
              message: `Byte array field "${field.name}" has invalid fixed length ${String(expectedLen)}.`,
            },
          };
        }
        if (rawBytes.length !== expectedLen) {
          return {
            ok: false,
            error: {
              code: 'BYTE_ARRAY_LENGTH_MISMATCH',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset,
              expected: `Exactly ${expectedLen} bytes`,
              received: `${rawBytes.length} bytes`,
              message: `Fixed byte array "${field.name}" requires ${expectedLen} bytes, received ${rawBytes.length} bytes.`,
            },
          };
        }
        return { ok: true, bytes: new Uint8Array(rawBytes), isVariableLength: false };
      }

      if (mode === 'length_prefixed') {
        const prefixType = field.lengthPrefixType ?? 'uint16';
        const prefixResult = writeUnsignedPrefix(rawBytes.length, prefixType, endianness);
        if (!prefixResult.ok) {
          return {
            ok: false,
            error: {
              code: 'LENGTH_PREFIX_OVERFLOW',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset,
              expected: `At most ${prefixResult.max} bytes for ${prefixType} prefix`,
              received: `${rawBytes.length} bytes`,
              message: `Byte array "${field.name}" length (${rawBytes.length}) exceeds ${prefixType} prefix max (${prefixResult.max}).`,
            },
          };
        }
        const out = new Uint8Array(prefixResult.bytes.length + rawBytes.length);
        out.set(prefixResult.bytes, 0);
        out.set(rawBytes, prefixResult.bytes.length);
        return { ok: true, bytes: out, isVariableLength: true };
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
              byteOffset,
              expected: 'Configured lengthFieldName referencing an earlier integer field',
              received: 'undefined',
              message: `Byte array "${field.name}" uses field_ref mode without a lengthFieldName.`,
            },
          };
        }
        const refLen = encodedFieldNumericValues?.[refName];
        if (refLen === undefined) {
          return {
            ok: false,
            error: {
              code: 'UNKNOWN_LENGTH_FIELD_REF',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset,
              expected: `Earlier numeric field "${refName}"`,
              received: 'not found before this field',
              message: `Byte array "${field.name}" references length field "${refName}" which was not encoded before it.`,
            },
          };
        }
        if (rawBytes.length !== refLen) {
          return {
            ok: false,
            error: {
              code: 'LENGTH_FIELD_MISMATCH',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset,
              expected: `${refLen} bytes (from field "${refName}")`,
              received: `${rawBytes.length} bytes`,
              message: `Byte array "${field.name}" has ${rawBytes.length} bytes, but referenced length field "${refName}" specifies ${refLen} bytes.`,
            },
          };
        }
        return { ok: true, bytes: new Uint8Array(rawBytes), isVariableLength: true };
      }

      // mode === 'remaining'
      return { ok: true, bytes: new Uint8Array(rawBytes), isVariableLength: true };
    }

    case 'bitfield': {
      // Bitfields are packed at the group level in BinaryWriter.
      // This fallback encodes a standalone bitfield storage unit if called directly.
      return encodeBitfieldGroup([field], { [field.name]: rawValue }, globalEndianness, byteOffset).result;
    }

    default: {
      const exhaustive: never = field.type;
      return {
        ok: false,
        error: {
          code: 'UNSUPPORTED_FIELD_TYPE',
          fieldId: field.id,
          fieldName: field.name,
          byteOffset,
          expected: 'Supported FieldType',
          received: String(exhaustive),
          message: `Unsupported field type "${String(exhaustive)}".`,
        },
      };
    }
  }
}

export interface BitfieldPackOutcome {
  result: FieldEncodeResult;
  bitEntries: Array<{
    field: ProtocolField;
    value: number;
    bitOffset: number;
    bitWidth: number;
    bitOrder: BitOrder;
    storageBytes: 1 | 2 | 4;
    lsbStart: number;
    lsbEnd: number;
  }>;
}

export function resolveBitStorageBytes(fields: ProtocolField[]): 1 | 2 | 4 {
  let explicitMax: 1 | 2 | 4 = 1;
  let maxBitEnd = 0;
  for (const f of fields) {
    if (f.bitStorageBytes && f.bitStorageBytes > explicitMax) {
      explicitMax = f.bitStorageBytes;
    }
    const end = (f.bitOffset ?? 0) + (f.bitWidth ?? 1);
    if (end > maxBitEnd) {
      maxBitEnd = end;
    }
  }
  const minBytes: 1 | 2 | 4 = maxBitEnd <= 8 ? 1 : maxBitEnd <= 16 ? 2 : 4;
  return explicitMax >= minBytes ? explicitMax : minBytes;
}

export function encodeBitfieldGroup(
  fields: ProtocolField[],
  values: Record<string, FieldValue | undefined>,
  globalEndianness: Endianness,
  byteOffset: number
): BitfieldPackOutcome {
  const storageBytes = resolveBitStorageBytes(fields);
  const storageBits = storageBytes * 8;
  const endianness = fields[0]?.endianness ?? globalEndianness;
  const occupiedMask = new Uint8Array(storageBits);

  let packed = 0; // unsigned 32-bit accumulator (using >>> 0)
  const bitEntries: BitfieldPackOutcome['bitEntries'] = [];

  for (const field of fields) {
    const bitWidth = field.bitWidth ?? 1;
    const bitOffset = field.bitOffset ?? 0;
    const bitOrder: BitOrder = field.bitOrder ?? 'msb-first';

    if (!Number.isInteger(bitWidth) || bitWidth < 1 || bitWidth > 32) {
      return {
        bitEntries: [],
        result: {
          ok: false,
          error: {
            code: 'INVALID_BIT_WIDTH',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: 'Bit width integer in [1, 32]',
            received: String(bitWidth),
            message: `Bit field "${field.name}" has invalid bit width ${bitWidth}.`,
          },
        },
      };
    }

    if (!Number.isInteger(bitOffset) || bitOffset < 0 || bitOffset + bitWidth > storageBits) {
      return {
        bitEntries: [],
        result: {
          ok: false,
          error: {
            code: 'BITFIELD_OUT_OF_BOUNDS',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: `bitOffset + bitWidth <= ${storageBits} bits (${storageBytes}-byte unit)`,
            received: `offset ${bitOffset} + width ${bitWidth} = ${bitOffset + bitWidth}`,
            message: `Bit field "${field.name}" exceeds its ${storageBits}-bit storage unit.`,
          },
        },
      };
    }

    const lsbStart = bitOrder === 'lsb-first' ? bitOffset : storageBits - bitOffset - bitWidth;
    const lsbEnd = lsbStart + bitWidth - 1;

    for (let b = lsbStart; b <= lsbEnd; b++) {
      if (occupiedMask[b] === 1) {
        return {
          bitEntries: [],
          result: {
            ok: false,
            error: {
              code: 'BITFIELD_OVERLAP',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset,
              expected: 'Non-overlapping bit range within storage unit',
              received: `Overlap at bit position ${b} (LSB-indexed)`,
              message: `Bit field "${field.name}" overlaps another bit field at bit ${b}.`,
            },
          },
        };
      }
      occupiedMask[b] = 1;
    }

    const raw = values[field.name];
    if (raw === undefined || raw === null) {
      if (field.required) {
        return {
          bitEntries: [],
          result: {
            ok: false,
            error: {
              code: 'MISSING_REQUIRED_FIELD',
              fieldId: field.id,
              fieldName: field.name,
              byteOffset,
              expected: `${bitWidth}-bit unsigned integer`,
              received: 'undefined',
              message: `Required bit field "${field.name}" is missing a value.`,
            },
          },
        };
      }
      continue;
    }

    const normalizedRaw: FieldValue = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
    const parsed = parseStrictNumeric(normalizedRaw);
    const maxVal = bitWidth === 32 ? 0xffffffff : (1 << bitWidth) - 1;

    if (!parsed.ok || !Number.isInteger(parsed.value)) {
      return {
        bitEntries: [],
        result: {
          ok: false,
          error: {
            code: 'INVALID_BITFIELD_VALUE',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: `Integer in [0, ${maxVal}]`,
            received: parsed.ok ? String(parsed.value) : parsed.received,
            message: `Bit field "${field.name}" expects an integer in [0, ${maxVal}].`,
          },
        },
      };
    }

    if (parsed.value < 0 || parsed.value > maxVal) {
      return {
        bitEntries: [],
        result: {
          ok: false,
          error: {
            code: 'BITFIELD_VALUE_OVERFLOW',
            fieldId: field.id,
            fieldName: field.name,
            byteOffset,
            expected: `Unsigned integer in [0, ${maxVal}] (${bitWidth} bits)`,
            received: String(parsed.value),
            message: `Bit field "${field.name}" value ${parsed.value} does not fit in ${bitWidth} bits (max ${maxVal}).`,
          },
        },
      };
    }

    const shifted = bitWidth === 32 ? parsed.value >>> 0 : ((parsed.value & maxVal) << lsbStart) >>> 0;
    packed = (packed | shifted) >>> 0;

    bitEntries.push({
      field,
      value: parsed.value,
      bitOffset,
      bitWidth,
      bitOrder,
      storageBytes,
      lsbStart,
      lsbEnd,
    });
  }

  const buffer = new ArrayBuffer(storageBytes);
  const view = new DataView(buffer);
  const little = endianness === 'little';
  if (storageBytes === 1) {
    view.setUint8(0, packed & 0xff);
  } else if (storageBytes === 2) {
    view.setUint16(0, packed & 0xffff, little);
  } else {
    view.setUint32(0, packed >>> 0, little);
  }

  return {
    bitEntries,
    result: { ok: true, bytes: new Uint8Array(buffer), isVariableLength: false },
  };
}

export function isVariableLengthFieldType(field: ProtocolField): boolean {
  if (field.type === 'utf8_null' || field.type === 'utf8_length_prefixed') {
    return true;
  }
  if (field.type === 'bytes') {
    return (field.bytesLengthMode ?? (field.length !== undefined ? 'fixed' : 'remaining')) !== 'fixed';
  }
  return false;
}

export function getFixedFieldByteSize(type: FieldType): number | null {
  switch (type) {
    case 'uint8':
    case 'int8':
    case 'boolean':
      return 1;
    case 'uint16':
    case 'int16':
      return 2;
    case 'uint32':
    case 'int32':
    case 'float32':
      return 4;
    case 'float64':
      return 8;
    default:
      return null;
  }
}
