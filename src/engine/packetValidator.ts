import type {
  FieldType,
  FieldValue,
  FieldValuesMap,
  ProtocolField,
  ProtocolSchema,
  RoundTripFieldComparison,
  RoundTripResult,
  ValidationIssue,
  ValidationResult,
} from '../types/protocol';
import { bytesToHexString, encodePacket, partitionFieldsIntoSegments } from './binaryWriter';
import { decodePacket, formatDecodedFieldValue } from './binaryReader';
import { coerceBytesValue, MAX_SAFE_FIELD_BYTES, resolveBitStorageBytes } from './fieldEncoder';

const SUPPORTED_FIELD_TYPES = new Set<FieldType>([
  'uint8',
  'uint16',
  'uint32',
  'int8',
  'int16',
  'int32',
  'float32',
  'float64',
  'boolean',
  'utf8_fixed',
  'utf8_null',
  'utf8_length_prefixed',
  'bytes',
  'bitfield',
]);

const SUPPORTED_CHECKSUMS = new Set([
  'xor8',
  'crc8_atm',
  'crc16_ccitt_false',
  'crc32_iso_hdlc',
]);

export function validateSchema(schema: ProtocolSchema): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!schema || typeof schema !== 'object') {
    errors.push({
      severity: 'error',
      code: 'INVALID_SCHEMA',
      message: 'Schema object is missing or malformed.',
    });
    return { valid: false, errors, warnings };
  }

  if (schema.endianness !== 'big' && schema.endianness !== 'little') {
    errors.push({
      severity: 'error',
      code: 'UNSUPPORTED_ENDIANNESS',
      expected: '"big" or "little"',
      received: String(schema.endianness),
      message: `Schema endianness "${String(schema.endianness)}" is unsupported.`,
    });
  }

  if (!Array.isArray(schema.fields)) {
    errors.push({
      severity: 'error',
      code: 'INVALID_FIELDS_ARRAY',
      message: 'Schema fields must be an array.',
    });
    return { valid: false, errors, warnings };
  }

  const seenNames = new Map<string, string>();
  const earlierIntFields = new Set<string>();

  for (let i = 0; i < schema.fields.length; i++) {
    const field = schema.fields[i];
    const trimmedName = field.name?.trim() ?? '';

    if (!trimmedName) {
      errors.push({
        severity: 'error',
        code: 'EMPTY_FIELD_NAME',
        fieldId: field.id,
        expected: 'Non-empty unique field name',
        received: '(empty)',
        message: `Field at index ${i} must have a non-empty name.`,
      });
    } else if (seenNames.has(trimmedName)) {
      errors.push({
        severity: 'error',
        code: 'DUPLICATE_FIELD_NAME',
        fieldId: field.id,
        fieldName: trimmedName,
        expected: 'Unique field name',
        received: trimmedName,
        message: `Duplicate field name "${trimmedName}". Every field in a protocol schema must have a unique name.`,
      });
    } else {
      seenNames.set(trimmedName, field.id);
    }

    if (!SUPPORTED_FIELD_TYPES.has(field.type)) {
      errors.push({
        severity: 'error',
        code: 'UNSUPPORTED_FIELD_TYPE',
        fieldId: field.id,
        fieldName: field.name,
        expected: 'Supported protocol field type',
        received: String(field.type),
        message: `Field "${field.name}" has unsupported type "${String(field.type)}".`,
      });
    }

    if (field.endianness !== undefined && field.endianness !== 'big' && field.endianness !== 'little') {
      errors.push({
        severity: 'error',
        code: 'UNSUPPORTED_ENDIANNESS',
        fieldId: field.id,
        fieldName: field.name,
        expected: '"big" or "little"',
        received: String(field.endianness),
        message: `Field "${field.name}" has invalid byte order "${String(field.endianness)}".`,
      });
    }

    if (field.type === 'utf8_fixed') {
      if (!Number.isInteger(field.length) || (field.length ?? 0) <= 0 || (field.length ?? 0) > MAX_SAFE_FIELD_BYTES) {
        errors.push({
          severity: 'error',
          code: 'INVALID_FIELD_LENGTH',
          fieldId: field.id,
          fieldName: field.name,
          expected: `Integer in [1, ${MAX_SAFE_FIELD_BYTES}]`,
          received: String(field.length),
          message: `Fixed-length string "${field.name}" requires a valid positive byte length.`,
        });
      }
      if (field.paddingByte !== undefined && (!Number.isInteger(field.paddingByte) || field.paddingByte < 0 || field.paddingByte > 255)) {
        errors.push({
          severity: 'error',
          code: 'INVALID_PADDING_BYTE',
          fieldId: field.id,
          fieldName: field.name,
          expected: '0..255',
          received: String(field.paddingByte),
          message: `Field "${field.name}" padding byte must be between 0 and 255.`,
        });
      }
    }

    if (field.type === 'bytes') {
      const mode = field.bytesLengthMode ?? (field.length !== undefined ? 'fixed' : 'remaining');
      if (mode === 'fixed') {
        if (!Number.isInteger(field.length) || (field.length ?? 0) < 0 || (field.length ?? 0) > MAX_SAFE_FIELD_BYTES) {
          errors.push({
            severity: 'error',
            code: 'INVALID_FIELD_LENGTH',
            fieldId: field.id,
            fieldName: field.name,
            expected: `Integer in [0, ${MAX_SAFE_FIELD_BYTES}]`,
            received: String(field.length),
            message: `Fixed byte array "${field.name}" has invalid length ${String(field.length)}.`,
          });
        }
      } else if (mode === 'field_ref') {
        if (!field.lengthFieldName) {
          errors.push({
            severity: 'error',
            code: 'MISSING_LENGTH_FIELD_REF',
            fieldId: field.id,
            fieldName: field.name,
            expected: 'Name of a preceding integer field',
            received: '(none)',
            message: `Byte array "${field.name}" in field_ref mode requires a length field reference.`,
          });
        } else if (!earlierIntFields.has(field.lengthFieldName)) {
          errors.push({
            severity: 'error',
            code: 'INVALID_LENGTH_FIELD_REF',
            fieldId: field.id,
            fieldName: field.name,
            expected: `Preceding integer field named "${field.lengthFieldName}"`,
            received: 'Not found before this field',
            message: `Byte array "${field.name}" references "${field.lengthFieldName}", which is not a preceding integer field.`,
          });
        }
      } else if (mode === 'remaining' && i < schema.fields.length - 1) {
        warnings.push({
          severity: 'warning',
          code: 'REMAINING_BYTES_NOT_LAST',
          fieldId: field.id,
          fieldName: field.name,
          message: `Byte array "${field.name}" consumes all remaining bytes, leaving no bytes for fields defined after it during decoding.`,
        });
      }
    }

    if (
      field.type === 'uint8' ||
      field.type === 'uint16' ||
      field.type === 'uint32' ||
      field.type === 'int8' ||
      field.type === 'int16' ||
      field.type === 'int32'
    ) {
      if (trimmedName) {
        earlierIntFields.add(trimmedName);
      }
    }
  }

  // Validate bitfield segments for bit widths, bounds, and overlaps
  const segments = partitionFieldsIntoSegments(schema.fields);
  for (const seg of segments) {
    if (seg.kind !== 'bitfield_group') continue;
    const storageBytes = resolveBitStorageBytes(seg.fields);
    const storageBits = storageBytes * 8;
    const occupied = new Map<number, string>();

    for (const bf of seg.fields) {
      const bitWidth = bf.bitWidth ?? 1;
      const bitOffset = bf.bitOffset ?? 0;
      const bitOrder = bf.bitOrder ?? 'msb-first';

      if (!Number.isInteger(bitWidth) || bitWidth < 1 || bitWidth > 32) {
        errors.push({
          severity: 'error',
          code: 'INVALID_BIT_WIDTH',
          fieldId: bf.id,
          fieldName: bf.name,
          expected: 'Integer in [1, 32]',
          received: String(bitWidth),
          message: `Bit field "${bf.name}" has invalid bit width ${bitWidth}.`,
        });
        continue;
      }

      if (!Number.isInteger(bitOffset) || bitOffset < 0 || bitOffset + bitWidth > storageBits) {
        errors.push({
          severity: 'error',
          code: 'BITFIELD_OUT_OF_BOUNDS',
          fieldId: bf.id,
          fieldName: bf.name,
          expected: `bitOffset + bitWidth <= ${storageBits} bits`,
          received: `offset ${bitOffset} + width ${bitWidth} = ${bitOffset + bitWidth}`,
          message: `Bit field "${bf.name}" exceeds its ${storageBytes}-byte (${storageBits}-bit) storage unit.`,
        });
        continue;
      }

      const lsbStart = bitOrder === 'lsb-first' ? bitOffset : storageBits - bitOffset - bitWidth;
      const lsbEnd = lsbStart + bitWidth - 1;
      for (let b = lsbStart; b <= lsbEnd; b++) {
        const prev = occupied.get(b);
        if (prev) {
          errors.push({
            severity: 'error',
            code: 'BITFIELD_OVERLAP',
            fieldId: bf.id,
            fieldName: bf.name,
            expected: 'Non-overlapping bit range',
            received: `Bit ${b} already occupied by "${prev}"`,
            message: `Bit field "${bf.name}" overlaps with "${prev}" at LSB bit position ${b}.`,
          });
          break;
        }
        occupied.set(b, bf.name);
      }
    }
  }

  // Validate checksum config
  if (schema.checksum?.enabled) {
    if (!SUPPORTED_CHECKSUMS.has(schema.checksum.algorithm)) {
      errors.push({
        severity: 'error',
        code: 'UNSUPPORTED_CHECKSUM_ALGORITHM',
        expected: 'xor8 | crc8_atm | crc16_ccitt_false | crc32_iso_hdlc',
        received: String(schema.checksum.algorithm),
        message: `Unsupported checksum algorithm "${String(schema.checksum.algorithm)}".`,
      });
    }
    if (!Number.isInteger(schema.checksum.startOffset) || schema.checksum.startOffset < 0) {
      errors.push({
        severity: 'error',
        code: 'INVALID_CHECKSUM_RANGE',
        expected: 'Non-negative integer startOffset',
        received: String(schema.checksum.startOffset),
        message: `Checksum startOffset must be a non-negative integer.`,
      });
    }
    if (
      schema.checksum.endOffset !== undefined &&
      (!Number.isInteger(schema.checksum.endOffset) ||
        schema.checksum.endOffset < schema.checksum.startOffset)
    ) {
      errors.push({
        severity: 'error',
        code: 'INVALID_CHECKSUM_RANGE',
        expected: `endOffset >= startOffset (${schema.checksum.startOffset})`,
        received: String(schema.checksum.endOffset),
        message: `Checksum endOffset (${schema.checksum.endOffset}) cannot be less than startOffset (${schema.checksum.startOffset}).`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function compareFieldValues(
  field: ProtocolField,
  original: FieldValue,
  decoded: FieldValue | undefined
): { matched: boolean; toleranceUsed?: number; diffDetail?: string } {
  if (decoded === undefined) {
    return { matched: false, diffDetail: 'Field was not decoded from output bytes.' };
  }

  if (field.type === 'float32') {
    const a = Number(original);
    const b = Number(decoded);
    const tolerance = Math.max(1e-5, Math.abs(a) * 1e-6);
    const diff = Math.abs(a - b);
    const matched = Number.isFinite(a) && Number.isFinite(b) && diff <= tolerance;
    return {
      matched,
      toleranceUsed: tolerance,
      diffDetail: matched
        ? diff > 0
          ? `IEEE 754 float32 quantization delta: ${diff.toExponential(2)} (within ±${tolerance.toExponential(1)})`
          : undefined
        : `Delta ${diff.toExponential(3)} exceeds float32 tolerance ±${tolerance.toExponential(1)}`,
    };
  }

  if (field.type === 'float64') {
    const a = Number(original);
    const b = Number(decoded);
    const tolerance = Math.max(1e-12, Math.abs(a) * 1e-12);
    const diff = Math.abs(a - b);
    const matched = Number.isFinite(a) && Number.isFinite(b) && diff <= tolerance;
    return {
      matched,
      toleranceUsed: tolerance,
      diffDetail: matched ? undefined : `Delta ${diff.toExponential(3)} exceeds float64 tolerance`,
    };
  }

  if (field.type === 'bytes') {
    const origCoerced = coerceBytesValue(original);
    if (!origCoerced.ok || !(decoded instanceof Uint8Array)) {
      return { matched: false, diffDetail: 'Byte array representation mismatch.' };
    }
    const a = origCoerced.bytes;
    const b = decoded;
    if (a.length !== b.length) {
      return {
        matched: false,
        diffDetail: `Length mismatch: original ${a.length}B vs decoded ${b.length}B`,
      };
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return {
          matched: false,
          diffDetail: `First byte difference at byte ${i}: 0x${a[i].toString(16).toUpperCase().padStart(2, '0')} vs 0x${b[i].toString(16).toUpperCase().padStart(2, '0')}`,
        };
      }
    }
    return { matched: true };
  }

  if (field.type === 'boolean') {
    const a = typeof original === 'boolean' ? original : original === 1 || original === 'true';
    const b = Boolean(decoded);
    return {
      matched: a === b,
      diffDetail: a === b ? undefined : `Expected ${String(a)}, decoded ${String(b)}`,
    };
  }

  if (
    field.type === 'uint8' ||
    field.type === 'uint16' ||
    field.type === 'uint32' ||
    field.type === 'int8' ||
    field.type === 'int16' ||
    field.type === 'int32' ||
    field.type === 'bitfield'
  ) {
    const a = typeof original === 'boolean' ? (original ? 1 : 0) : Number(original);
    const b = Number(decoded);
    return {
      matched: a === b,
      diffDetail: a === b ? undefined : `Expected ${a}, decoded ${b}`,
    };
  }

  // Strings (utf8_fixed, utf8_null, utf8_length_prefixed)
  const a = String(original);
  const b = String(decoded);
  if (a === b) {
    return { matched: true };
  }
  return {
    matched: false,
    diffDetail: `String mismatch: original "${a}" vs decoded "${b}"`,
  };
}

export function runRoundTripValidation(
  schema: ProtocolSchema,
  values: FieldValuesMap
): RoundTripResult {
  const encodedPacket = encodePacket(schema, values);

  if (!encodedPacket.success) {
    const emptyDecoded = {
      success: false,
      bytes: new Uint8Array(0),
      byteLength: 0,
      values: {},
      fields: [],
      fieldMappings: [],
      bitRanges: [],
      trailingBytes: new Uint8Array(0),
      errors: encodedPacket.errors.map((e) => ({ ...e })),
      warnings: [],
    };
    return {
      success: false,
      encodedPacket,
      decodedPacket: emptyDecoded,
      comparisons: [],
      checksumValid: null,
      mismatchCount: encodedPacket.errors.length,
      summary: `Encoding failed with ${encodedPacket.errors.length} error(s). Round-trip aborted.`,
    };
  }

  const decodedPacket = decodePacket(schema, encodedPacket.bytes, { strictMode: true });
  const comparisons: RoundTripFieldComparison[] = [];

  for (const field of schema.fields) {
    const orig = values[field.name] !== undefined ? values[field.name] : field.defaultValue;
    const dec = decodedPacket.values[field.name];
    const decEntry = decodedPacket.fields.find((e) => e.fieldName === field.name);

    const cmp = compareFieldValues(field, orig, dec);
    const origFormatted =
      field.type === 'bytes'
        ? (() => {
            const c = coerceBytesValue(orig);
            return c.ok ? (c.bytes.length === 0 ? '(empty)' : bytesToHexString(c.bytes)) : String(orig);
          })()
        : formatDecodedFieldValue(orig, field.type);

    comparisons.push({
      fieldId: field.id,
      fieldName: field.name,
      fieldType: field.type,
      originalValue: orig,
      decodedValue: dec,
      originalFormatted: origFormatted,
      decodedFormatted:
        dec !== undefined ? formatDecodedFieldValue(dec, field.type) : '(not decoded)',
      matched: cmp.matched,
      byteOffset: decEntry?.startOffset ?? 0,
      byteLength: decEntry?.byteLength ?? 0,
      toleranceUsed: cmp.toleranceUsed,
      diffDetail: cmp.diffDetail,
    });
  }

  const mismatchCount = comparisons.filter((c) => !c.matched).length;
  const checksumValid = decodedPacket.checksum ? decodedPacket.checksum.valid : null;
  const success =
    encodedPacket.success &&
    decodedPacket.success &&
    mismatchCount === 0 &&
    (checksumValid === null || checksumValid === true);

  let summary: string;
  if (success) {
    summary = `Round-trip verified: all ${comparisons.length} field(s) preserved across ${encodedPacket.byteLength} bytes${
      checksumValid ? ` (${decodedPacket.checksum?.algorithm} valid)` : ''
    }.`;
  } else if (!decodedPacket.success) {
    summary = `Decoding failed with ${decodedPacket.errors.length} error(s); ${mismatchCount} field mismatch(es).`;
  } else {
    summary = `Round-trip failed: ${mismatchCount} of ${comparisons.length} field(s) differed after decode.`;
  }

  return {
    success,
    encodedPacket,
    decodedPacket,
    comparisons,
    checksumValid,
    mismatchCount,
    summary,
  };
}

export interface ImportedSchemaPayload {
  schema: ProtocolSchema;
  sampleValues?: FieldValuesMap;
}

export function validateImportedSchemaJson(
  jsonText: string
): { ok: true; data: ImportedSchemaPayload } | { ok: false; error: string } {
  if (!jsonText || jsonText.trim().length === 0) {
    return { ok: false, error: 'File is empty. Expected a FrameForge JSON protocol schema.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Unable to parse JSON.'}`,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'JSON root must be an object containing a protocol schema.' };
  }

  const obj = parsed as Record<string, unknown>;
  const candidateSchema = (obj.schema && typeof obj.schema === 'object' ? obj.schema : obj) as Partial<ProtocolSchema>;

  if (candidateSchema.version !== undefined && candidateSchema.version !== 1) {
    return {
      ok: false,
      error: `Unsupported schema version "${String(candidateSchema.version)}". FrameForge supports schema version 1.`,
    };
  }

  if (!candidateSchema.name || typeof candidateSchema.name !== 'string') {
    return { ok: false, error: 'Imported schema is missing a valid string "name" property.' };
  }

  if (!Array.isArray(candidateSchema.fields)) {
    return { ok: false, error: 'Imported schema is missing a "fields" array.' };
  }

  const normalizedSchema: ProtocolSchema = {
    id: typeof candidateSchema.id === 'string' && candidateSchema.id ? candidateSchema.id : `imported_${Date.now()}`,
    version: 1,
    name: candidateSchema.name,
    description: typeof candidateSchema.description === 'string' ? candidateSchema.description : '',
    endianness: candidateSchema.endianness === 'little' ? 'little' : candidateSchema.endianness === 'big' ? 'big' : ('invalid' as 'big'),
    fields: candidateSchema.fields.map((f, idx) => ({
      ...f,
      id: typeof f.id === 'string' && f.id ? f.id : `field_${idx}_${Date.now()}`,
      required: f.required !== undefined ? Boolean(f.required) : true,
    })),
    checksum: candidateSchema.checksum,
    strictDecoding: Boolean(candidateSchema.strictDecoding),
  };

  const validation = validateSchema(normalizedSchema);
  if (!validation.valid) {
    return {
      ok: false,
      error: `Schema validation failed: ${validation.errors.map((e) => e.message).join(' ')}`,
    };
  }

  let sampleValues: FieldValuesMap | undefined;
  if (obj.sampleValues && typeof obj.sampleValues === 'object' && !Array.isArray(obj.sampleValues)) {
    sampleValues = obj.sampleValues as FieldValuesMap;
  }

  return { ok: true, data: { schema: normalizedSchema, sampleValues } };
}
