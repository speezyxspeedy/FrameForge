export type Endianness = 'big' | 'little';

export type FieldType =
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'float32'
  | 'float64'
  | 'boolean'
  | 'utf8_fixed'
  | 'utf8_null'
  | 'utf8_length_prefixed'
  | 'bytes'
  | 'bitfield';

export type LengthPrefixType = 'uint8' | 'uint16' | 'uint32';

export type BytesLengthMode = 'fixed' | 'length_prefixed' | 'field_ref' | 'remaining';

export type BitOrder = 'msb-first' | 'lsb-first';

export type ChecksumAlgorithm =
  | 'xor8'
  | 'crc8_atm'
  | 'crc16_ccitt_false'
  | 'crc32_iso_hdlc';

export type FieldValue = number | boolean | string | Uint8Array;

export type FieldValuesMap = Record<string, FieldValue>;

export interface ProtocolField {
  id: string;
  name: string;
  type: FieldType;
  defaultValue: FieldValue;
  description?: string;
  required: boolean;
  /** Optional per-field endianness override. Falls back to schema.endianness */
  endianness?: Endianness;
  /** Byte length for utf8_fixed or fixed-length bytes */
  length?: number;
  /** Padding byte (0..255) for utf8_fixed */
  paddingByte?: number;
  /** Allow safe UTF-8 boundary truncation for utf8_fixed */
  truncate?: boolean;
  /** Terminator byte (0..255) for utf8_null, defaults to 0x00 */
  terminatorByte?: number;
  /** Allow embedded terminator bytes in utf8_null */
  allowEmbeddedTerminator?: boolean;
  /** Prefix width for utf8_length_prefixed or length_prefixed bytes */
  lengthPrefixType?: LengthPrefixType;
  /** Length mode for raw byte arrays */
  bytesLengthMode?: BytesLengthMode;
  /** Name of an earlier integer field providing byte count when bytesLengthMode === 'field_ref' */
  lengthFieldName?: string;
  /** Bit width (1..32) for bitfield */
  bitWidth?: number;
  /** Bit offset (0..31) within the storage unit for bitfield */
  bitOffset?: number;
  /** Storage unit size in bytes (1, 2, or 4) for bitfield */
  bitStorageBytes?: 1 | 2 | 4;
  /** Bit numbering convention within storage unit */
  bitOrder?: BitOrder;
  /** Shared group name so consecutive bitfields pack into one storage unit */
  bitGroup?: string;
  /** Visual accent color token for byte maps & hex inspector */
  color?: string;
}

export interface ChecksumConfig {
  enabled: boolean;
  algorithm: ChecksumAlgorithm;
  /** Inclusive start byte offset (default 0) */
  startOffset: number;
  /** Exclusive end byte offset. Undefined means end of payload before checksum field */
  endOffset?: number;
  /** Optional byte-order override for multi-byte checksums */
  endianness?: Endianness;
  /** Display name for the appended checksum field */
  fieldName?: string;
}

export interface ProtocolSchema {
  id: string;
  version: number;
  name: string;
  description: string;
  endianness: Endianness;
  fields: ProtocolField[];
  checksum?: ChecksumConfig;
  strictDecoding?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ByteRange {
  fieldId: string;
  fieldName: string;
  fieldType: FieldType | 'checksum';
  startOffset: number;
  /** Exclusive end offset (startOffset + byteLength) */
  endOffset: number;
  byteLength: number;
  isVariableLength: boolean;
  endianness: Endianness;
  color: string;
  rawHex: string;
  description?: string;
}

export interface BitRange {
  fieldId: string;
  fieldName: string;
  byteOffset: number;
  storageBytes: 1 | 2 | 4;
  bitOffset: number;
  bitWidth: number;
  bitOrder: BitOrder;
  /** Absolute bit positions from LSB (0 = LSB of storage unit) */
  lsbStart: number;
  lsbEnd: number;
  value: number;
  color: string;
  bitGroup?: string;
}

export interface EncodingError {
  code: string;
  fieldId?: string;
  fieldName?: string;
  byteOffset?: number;
  expected?: string;
  received?: string;
  message: string;
}

export interface DecodingError {
  code: string;
  fieldId?: string;
  fieldName?: string;
  byteOffset?: number;
  expected?: string;
  received?: string;
  message: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  fieldId?: string;
  fieldName?: string;
  byteOffset?: number;
  expected?: string;
  received?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ChecksumCalculation {
  algorithm: ChecksumAlgorithm;
  value: number;
  hex: string;
  byteLength: number;
  startOffset: number;
  endOffset: number;
  processedBytes: number;
}

export interface ChecksumVerification {
  algorithm: ChecksumAlgorithm;
  expected: number;
  expectedHex: string;
  actual: number;
  actualHex: string;
  valid: boolean;
  startOffset: number;
  endOffset: number;
  checksumOffset: number;
  checksumLength: number;
}

export interface EncodedPacket {
  success: boolean;
  bytes: Uint8Array;
  hexString: string;
  binaryString: string;
  byteLength: number;
  fieldMappings: ByteRange[];
  bitRanges: BitRange[];
  fieldValues: FieldValuesMap;
  checksum?: ChecksumCalculation;
  errors: EncodingError[];
  warnings: ValidationIssue[];
}

export interface DecodedFieldEntry {
  fieldId: string;
  fieldName: string;
  fieldType: FieldType | 'checksum';
  value: FieldValue;
  formattedValue: string;
  startOffset: number;
  endOffset: number;
  byteLength: number;
  rawHex: string;
  endianness: Endianness;
  isBitfield?: boolean;
  bitRange?: BitRange;
}

export interface DecodedPacket {
  success: boolean;
  bytes: Uint8Array;
  byteLength: number;
  values: FieldValuesMap;
  fields: DecodedFieldEntry[];
  fieldMappings: ByteRange[];
  bitRanges: BitRange[];
  checksum?: ChecksumVerification;
  trailingBytes: Uint8Array;
  errors: DecodingError[];
  warnings: ValidationIssue[];
}

export interface RoundTripFieldComparison {
  fieldId: string;
  fieldName: string;
  fieldType: FieldType;
  originalValue: FieldValue;
  decodedValue: FieldValue | undefined;
  originalFormatted: string;
  decodedFormatted: string;
  matched: boolean;
  byteOffset: number;
  byteLength: number;
  toleranceUsed?: number;
  diffDetail?: string;
}

export interface RoundTripResult {
  success: boolean;
  encodedPacket: EncodedPacket;
  decodedPacket: DecodedPacket;
  comparisons: RoundTripFieldComparison[];
  checksumValid: boolean | null;
  mismatchCount: number;
  summary: string;
}

export interface OperationLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  category: 'encode' | 'decode' | 'checksum' | 'roundtrip' | 'io' | 'schema' | 'edit';
  message: string;
}

export type NavigationView =
  | 'workspace'
  | 'builder'
  | 'hex'
  | 'decoder'
  | 'checksum'
  | 'templates'
  | 'docs';

export interface ProtocolTemplate {
  id: string;
  name: string;
  category: string;
  summary: string;
  builtIn: boolean;
  schema: ProtocolSchema;
  sampleValues: FieldValuesMap;
}
