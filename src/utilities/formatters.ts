import type { FieldType, ProtocolSchema, FieldValuesMap } from '../types/protocol';

export function formatHexOffset(offset: number, padWidth = 8): string {
  return offset.toString(16).toUpperCase().padStart(padWidth, '0');
}

export function formatByteHex(byte: number): string {
  return (byte & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

export function formatByteBinary(byte: number): string {
  return (byte & 0xff).toString(2).padStart(8, '0');
}

export function formatByteSize(bytes: number): string {
  if (bytes === 1) return '1 byte';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function getFieldTypeLabel(type: FieldType | 'checksum'): string {
  switch (type) {
    case 'uint8':
      return 'uint8 (1B)';
    case 'uint16':
      return 'uint16 (2B)';
    case 'uint32':
      return 'uint32 (4B)';
    case 'int8':
      return 'int8 (1B)';
    case 'int16':
      return 'int16 (2B)';
    case 'int32':
      return 'int32 (4B)';
    case 'float32':
      return 'float32 (4B)';
    case 'float64':
      return 'float64 (8B)';
    case 'boolean':
      return 'bool (1B)';
    case 'utf8_fixed':
      return 'utf8 fixed';
    case 'utf8_null':
      return 'utf8 null-term';
    case 'utf8_length_prefixed':
      return 'utf8 len-prefix';
    case 'bytes':
      return 'byte[]';
    case 'bitfield':
      return 'bitfield';
    case 'checksum':
      return 'checksum';
  }
}

export function getFieldTypeShortLabel(type: FieldType | 'checksum'): string {
  switch (type) {
    case 'utf8_fixed':
      return 'utf8[N]';
    case 'utf8_null':
      return 'utf8\\0';
    case 'utf8_length_prefixed':
      return 'len+utf8';
    case 'boolean':
      return 'bool';
    case 'bitfield':
      return 'bits';
    default:
      return type;
  }
}

export function formatTimestampNow(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBinaryFile(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, filename.endsWith('.bin') ? filename : `${filename}.bin`);
}

export function exportHexFile(hexString: string, filename: string, extension: 'hex' | 'txt' = 'hex'): void {
  const blob = new Blob([hexString + '\n'], { type: 'text/plain;charset=utf-8' });
  const name = filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
  downloadBlob(blob, name);
}

export function exportSchemaJsonFile(
  schema: ProtocolSchema,
  sampleValues?: FieldValuesMap,
  filename?: string
): void {
  const serializableValues: Record<string, unknown> = {};
  if (sampleValues) {
    for (const [k, v] of Object.entries(sampleValues)) {
      if (v instanceof Uint8Array) {
        serializableValues[k] = Array.from(v)
          .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
          .join(' ');
      } else {
        serializableValues[k] = v;
      }
    }
  }
  const payload = {
    frameforgeSchemaVersion: 1,
    exportedAt: new Date().toISOString(),
    schema,
    sampleValues: serializableValues,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const slug = (filename ?? schema.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  downloadBlob(blob, `${slug || 'protocol-schema'}.json`);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function searchBytesInBuffer(
  haystack: Uint8Array,
  needle: Uint8Array
): number[] {
  const matches: number[] = [];
  if (needle.length === 0 || needle.length > haystack.length) {
    return matches;
  }
  const limit = haystack.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      matches.push(i);
    }
  }
  return matches;
}
