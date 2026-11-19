import type { NavigationView } from '../types/protocol';
import { calculateChecksum } from '../engine/checksumEngine';
import { bytesToBinaryString, bytesToHexString, BinaryWriter } from '../engine/binaryWriter';

export interface DocumentationTopic {
  id: string;
  title: string;
  category: 'Fundamentals' | 'Data Encoding' | 'Framing & Layout' | 'Integrity & Checksums';
  summary: string;
  explanation: string[];
  exampleTitle: string;
  computeExample: () => { input: string; output: string; detail: string };
  useCase: string;
  targetView: NavigationView;
  targetLabel: string;
}

const enc = new TextEncoder();

export const DOCUMENTATION_TOPICS: DocumentationTopic[] = [
  {
    id: 'binary-serialization',
    title: 'What is Binary Serialization?',
    category: 'Fundamentals',
    summary: 'Packing structured in-memory fields into compact contiguous byte streams for wire transport or storage.',
    explanation: [
      'Binary serialization translates structured values—integers, floating-point numbers, booleans, bit flags, and UTF-8 strings—into a deterministic sequence of raw bytes.',
      'Unlike text formats such as JSON or XML, binary protocols omit field names, quotes, and delimiters on the wire. Both sender and receiver agree on a schema that maps byte offsets and widths to typed fields.',
    ],
    exampleTitle: 'Compact Binary vs. Text Representation',
    computeExample: () => {
      const w = new BinaryWriter();
      w.writeUint8(0xa1);
      w.writeUint16(4660, 'big');
      w.writeFloat32(22.5, 'big');
      const bytes = w.toUint8Array();
      const jsonSize = enc.encode('{"magic":161,"id":4660,"temp":22.5}').length;
      return {
        input: 'magic=161 (uint8), id=4660 (uint16 BE), temp=22.5 (float32 BE)',
        output: bytesToHexString(bytes),
        detail: `${bytes.length} bytes in binary vs. ${jsonSize} bytes in JSON (${Math.round((1 - bytes.length / jsonSize) * 100)}% smaller).`,
      };
    },
    useCase: 'Microcontroller telemetry over LoRa/BLE, game networking, industrial Modbus/CAN frames, and high-frequency RPC protocols.',
    targetView: 'builder',
    targetLabel: 'Open Packet Builder',
  },
  {
    id: 'bits-and-bytes',
    title: 'Bits and Bytes',
    category: 'Fundamentals',
    summary: 'How 8 binary digits compose a byte (0–255) and map cleanly to two hexadecimal characters.',
    explanation: [
      'A bit is the smallest unit of digital information (0 or 1). Eight bits form one byte (octet), representing 2^8 = 256 distinct values from 0x00 (0) to 0xFF (255).',
      'Bit 7 (weight 128) is the Most Significant Bit (MSB), and Bit 0 (weight 1) is the Least Significant Bit (LSB). Every 4 bits (a nibble) maps cleanly to a single hexadecimal digit (0–F).',
    ],
    exampleTitle: 'Bit Weights of Byte 0xA5 (165)',
    computeExample: () => {
      const b = new Uint8Array([0xa5]);
      return {
        input: 'Decimal 165',
        output: `Hex: 0x${bytesToHexString(b)}  |  Binary: ${bytesToBinaryString(b)}`,
        detail: '128 (b7) + 32 (b5) + 4 (b2) + 1 (b0) = 165. Upper nibble 1010 = A, lower nibble 0101 = 5.',
      };
    },
    useCase: 'Inspecting hardware registers, GPIO masks, and raw hex dumps in embedded debugging.',
    targetView: 'hex',
    targetLabel: 'Inspect Bits in Hex Inspector',
  },
  {
    id: 'signed-vs-unsigned',
    title: 'Signed vs. Unsigned Integers',
    category: 'Data Encoding',
    summary: 'Interpreting the exact same bit pattern as non-negative magnitudes or negative/positive values.',
    explanation: [
      'Unsigned integers (uint8, uint16, uint32) dedicate all bits to magnitude: uint8 spans 0 to 255, uint16 spans 0 to 65,535, and uint32 spans 0 to 4,294,967,295.',
      'Signed integers (int8, int16, int32) use the highest bit as a sign weight, splitting the range symmetrically around zero (e.g. int8 spans -128 to +127).',
    ],
    exampleTitle: 'Same Byte (0xFE) Under uint8 vs. int8',
    computeExample: () => {
      const buf = new ArrayBuffer(1);
      const dv = new DataView(buf);
      dv.setUint8(0, 0xfe);
      return {
        input: 'Raw byte 0xFE (11111110)',
        output: `uint8 = ${dv.getUint8(0)}  |  int8 = ${dv.getInt8(0)}`,
        detail: 'The raw bits on the wire are identical; only the schema type determines whether 0xFE reads as 254 or -2.',
      };
    },
    useCase: 'Choosing uint16 for packet lengths and counters, and int16/int32 for signed sensor deltas, temperature offsets, or accelerometer readings.',
    targetView: 'builder',
    targetLabel: 'Test Integer Ranges in Builder',
  },
  {
    id: 'twos-complement',
    title: "Two's Complement Representation",
    category: 'Data Encoding',
    summary: 'The universal encoding for negative binary integers that makes binary addition work identically for signed and unsigned values.',
    explanation: [
      "In two's complement, an N-bit signed integer negates a value by inverting all bits (one's complement) and adding 1.",
      'Consequently, -1 is always all ones (0xFF for int8, 0xFFFF for int16, 0xFFFFFFFF for int32), and there is only a single representation of zero.',
    ],
    exampleTitle: 'Encoding -42 as int16 (Big-Endian)',
    computeExample: () => {
      const w = new BinaryWriter();
      w.writeInt16(-42, 'big');
      const bytes = w.toUint8Array();
      return {
        input: 'int16 value = -42',
        output: `Hex: ${bytesToHexString(bytes)}  |  Binary: ${bytesToBinaryString(bytes)}`,
        detail: '+42 = 0x002A -> invert = 0xFFD5 -> add 1 = 0xFFD6.',
      };
    },
    useCase: 'Decoding negative altitudes, longitudes, or signed ADC counts from raw hex captures.',
    targetView: 'decoder',
    targetLabel: 'Decode Signed Bytes',
  },
  {
    id: 'endianness',
    title: 'Little-Endian vs. Big-Endian',
    category: 'Data Encoding',
    summary: 'Byte ordering for multi-byte values: Big-Endian puts the most significant byte first; Little-Endian puts the least significant byte first.',
    explanation: [
      'Big-Endian (network byte order, used by IP/TCP/UDP) stores the most significant byte at the lowest memory address—reading left-to-right just like normal hex notation.',
      'Little-Endian (native on x86-64 and most ARM Cortex-M microcontrollers) stores the least significant byte first. Mixing up endianness silently corrupts multi-byte integers and floats.',
    ],
    exampleTitle: 'Live Calculation: 4660 (0x1234) in Both Byte Orders',
    computeExample: () => {
      const be = new BinaryWriter();
      be.writeUint16(4660, 'big');
      const le = new BinaryWriter();
      le.writeUint16(4660, 'little');
      return {
        input: 'uint16 value = 4660 (0x1234)',
        output: `Big-Endian: ${bytesToHexString(be.toUint8Array())}  |  Little-Endian: ${bytesToHexString(le.toUint8Array())}`,
        detail: 'Same logical integer, reversed byte sequence on the wire. Single-byte types (uint8/int8) are unaffected by endianness.',
      };
    },
    useCase: 'Interoperating between network protocols (big-endian) and embedded x86/ARM firmware structs (little-endian).',
    targetView: 'builder',
    targetLabel: 'Toggle Endianness in Builder',
  },
  {
    id: 'ieee-754',
    title: 'IEEE 754 Floating Point',
    category: 'Data Encoding',
    summary: 'Binary scientific notation using sign, exponent, and mantissa bits for float32 (4 bytes) and float64 (8 bytes).',
    explanation: [
      'IEEE 754 float32 uses 1 sign bit, 8 exponent bits (bias 127), and 23 fraction bits (~7 decimal digits of precision). float64 uses 1 sign bit, 11 exponent bits (bias 1023), and 52 fraction bits (~15–17 decimal digits).',
      'Because decimals like 0.1 or 22.3 cannot be represented exactly in base-2 fractions, float32 round-trips exhibit tiny quantization deltas (e.g. ~1e-6), which is why FrameForge uses precision-aware tolerance checks during round-trip validation.',
    ],
    exampleTitle: 'IEEE 754 float32 Encoding of 22.5',
    computeExample: () => {
      const w = new BinaryWriter();
      w.writeFloat32(22.5, 'big');
      const bytes = w.toUint8Array();
      return {
        input: 'float32 value = 22.5 (Big-Endian)',
        output: `Hex: ${bytesToHexString(bytes)}  |  Binary: ${bytesToBinaryString(bytes)}`,
        detail: 'Sign=0, Exponent=131 (127+4 -> 2^4=16), Mantissa=1.40625 -> 1.40625 × 16 = 22.5 exactly.',
      };
    },
    useCase: 'Transmitting GPS coordinates (float64) and calibrated physical measurements like temperature or pressure (float32).',
    targetView: 'builder',
    targetLabel: 'Inspect Float Fields',
  },
  {
    id: 'utf8-encoding',
    title: 'UTF-8 Encoding',
    category: 'Data Encoding',
    summary: 'Variable-width Unicode encoding (1 to 4 bytes per code point) that stays 100% backward-compatible with ASCII.',
    explanation: [
      'Standard ASCII characters (0x00–0x7F) encode to a single byte in UTF-8. Accented Latin characters take 2 bytes, CJK characters take 3 bytes, and emoji take 4 bytes.',
      'Crucially, binary framing lengths must always count encoded UTF-8 bytes—not JavaScript string `.length` (UTF-16 code units)—and truncation must never split a multi-byte sequence.',
    ],
    exampleTitle: 'UTF-8 Byte Length vs. Character Count',
    computeExample: () => {
      const sample = '22.5°C';
      const bytes = enc.encode(sample);
      return {
        input: `"${sample}" (${sample.length} characters)`,
        output: `${bytesToHexString(bytes)} (${bytes.length} UTF-8 bytes)`,
        detail: 'The degree symbol "°" (U+00B0) encodes to two bytes (C2 B0), making the byte length 7 instead of 6.',
      };
    },
    useCase: 'Device labels, telemetry units, and internationalized text frames over binary sockets.',
    targetView: 'templates',
    targetLabel: 'Try Text Message Frame',
  },
  {
    id: 'fixed-vs-variable',
    title: 'Fixed-Length vs. Variable-Length Fields',
    category: 'Framing & Layout',
    summary: 'Comparing constant-offset static layouts against dynamic length-prefixed and delimited fields.',
    explanation: [
      'Fixed-length fields (integers, floats, utf8_fixed, fixed byte arrays) guarantee constant byte offsets, allowing zero-copy struct casting in C/Rust.',
      'Variable-length fields (utf8_length_prefixed, utf8_null, dynamic byte arrays) save bandwidth on short values and support arbitrary payload sizes, but require sequential offset tracking during decoding.',
    ],
    exampleTitle: 'Length-Prefixed (uint16 BE) Encoding of "Hello"',
    computeExample: () => {
      const payload = enc.encode('Hello');
      const w = new BinaryWriter();
      w.writeUint16(payload.length, 'big');
      w.writeBytes(payload);
      const bytes = w.toUint8Array();
      return {
        input: 'utf8_length_prefixed("Hello", prefix=uint16 BE)',
        output: bytesToHexString(bytes),
        detail: 'Bytes 0..1 (00 05) declare 5 UTF-8 bytes; bytes 2..6 (48 65 6C 6C 6F) carry "Hello".',
      };
    },
    useCase: 'Balancing deterministic header offsets with flexible message payloads in real wire protocols.',
    targetView: 'builder',
    targetLabel: 'Explore Dynamic Layout',
  },
  {
    id: 'bit-masks-and-fields',
    title: 'Bit Masks and Bit Fields',
    category: 'Framing & Layout',
    summary: 'Packing multiple small flags and narrow integers into a single 1-, 2-, or 4-byte storage unit.',
    explanation: [
      'When bandwidth is tight (e.g. radio telemetry or hardware headers like IPv4/TCP), multiple boolean flags and small enumerations are packed into individual bit ranges using bit shifts (`<<`, `>>>`) and masks (`&`, `|`).',
      'Bit numbering order (MSB-first vs. LSB-first) defines where bit offset 0 starts within the storage unit and is distinct from multi-byte endianness.',
    ],
    exampleTitle: 'Packing 4 Status Subfields Into 1 Byte (MSB-First)',
    computeExample: () => {
      // sensorReady(1b)=1 @0, lowBat(1b)=0 @1, mode(3b)=3 @2, err(3b)=2 @5
      const packed = (1 << 7) | (0 << 6) | (3 << 3) | 2;
      const b = new Uint8Array([packed]);
      return {
        input: 'ready=1 (1b), lowBat=0 (1b), mode=3 (3b), err=2 (3b)',
        output: `Hex: 0x${bytesToHexString(b)}  |  Binary: ${bytesToBinaryString(b)}`,
        detail: '1 | 0 | 011 | 010 -> 10011010 (0x9A = 154). Four fields packed into a single byte.',
      };
    },
    useCase: 'Protocol control flags (TCP SYN/ACK/FIN), sensor status registers, and compressed telemetry headers.',
    targetView: 'hex',
    targetLabel: 'Toggle Individual Bits',
  },
  {
    id: 'xor-checksum',
    title: 'XOR-8 Checksum',
    category: 'Integrity & Checksums',
    summary: 'Lightweight 8-bit longitudinal parity computed by XORing every byte in a frame.',
    explanation: [
      'XOR-8 starts at 0x00 and XORs each byte sequentially. It detects any single-bit flip and any odd number of bit errors in a given bit column.',
      'However, XOR-8 cannot detect byte reordering or two identical bit flips in different bytes, so use a CRC for noisy links.',
    ],
    exampleTitle: 'XOR-8 of ASCII "123456789"',
    computeExample: () => {
      const data = enc.encode('123456789');
      const res = calculateChecksum('xor8', data);
      return {
        input: 'ASCII "123456789" (31 32 33 34 35 36 37 38 39)',
        output: `0x${res.hex} (decimal ${res.value})`,
        detail: `Processed ${res.processedBytes} bytes using bitwise XOR accumulation.`,
      };
    },
    useCase: 'NMEA 0183 GPS sentences and ultra-low-overhead serial framing on reliable wired links.',
    targetView: 'checksum',
    targetLabel: 'Run XOR-8 in Checksum Lab',
  },
  {
    id: 'crc-8',
    title: 'CRC-8/ATM',
    category: 'Integrity & Checksums',
    summary: '8-bit cyclic redundancy check using polynomial 0x07 (x^8 + x^2 + x + 1) for short frames.',
    explanation: [
      'Cyclic Redundancy Checks treat the bit stream as a polynomial over GF(2) and compute the remainder after division by a generator polynomial.',
      'CRC-8/ATM uses polynomial 0x07, initial value 0x00, no bit reflection (RefIn=false, RefOut=false), and XorOut=0x00. It catches all single-bit, double-bit, and burst errors up to 8 bits.',
    ],
    exampleTitle: 'Standard Check Vector: CRC-8/ATM("123456789")',
    computeExample: () => {
      const data = enc.encode('123456789');
      const res = calculateChecksum('crc8_atm', data);
      return {
        input: 'ASCII "123456789"',
        output: `0x${res.hex} (decimal ${res.value})`,
        detail: 'Matches official CRC catalogue check value 0xF4 (poly=0x07, init=0x00, refIn=false, refOut=false, xorOut=0x00).',
      };
    },
    useCase: 'I2C/SMBus sensor readings (SHT3x, Sensirion, 1-Wire) and compact 10–32 byte telemetry packets.',
    targetView: 'checksum',
    targetLabel: 'Verify CRC-8/ATM Vector',
  },
  {
    id: 'crc-16',
    title: 'CRC-16/CCITT-FALSE',
    category: 'Integrity & Checksums',
    summary: '16-bit industrial CRC using polynomial 0x1021 and non-zero initial seed 0xFFFF.',
    explanation: [
      'Initializing the register to 0xFFFF ensures leading 0x00 bytes alter the resulting checksum—fixing a common weakness of zero-initialized CRCs.',
      'CRC-16/CCITT-FALSE detects all burst errors up to 16 bits and 99.998% of longer burst errors with only 2 bytes of frame overhead.',
    ],
    exampleTitle: 'Standard Check Vector: CRC-16/CCITT-FALSE("123456789")',
    computeExample: () => {
      const data = enc.encode('123456789');
      const res = calculateChecksum('crc16_ccitt_false', data);
      return {
        input: 'ASCII "123456789"',
        output: `0x${res.hex} (decimal ${res.value})`,
        detail: 'Matches standard check value 0x29B1 (poly=0x1021, init=0xFFFF, refIn=false, refOut=false, xorOut=0x0000).',
      };
    },
    useCase: 'Firmware update packets, Modbus/HDLC command frames, and wireless telemetry links.',
    targetView: 'checksum',
    targetLabel: 'Verify CRC-16 Vector',
  },
  {
    id: 'crc-32',
    title: 'CRC-32/ISO-HDLC',
    category: 'Integrity & Checksums',
    summary: '32-bit Ethernet/ZIP/PNG standard CRC with reflected polynomial 0xEDB88320 and final XOR inversion.',
    explanation: [
      'CRC-32/ISO-HDLC reflects input and output bits (RefIn=true, RefOut=true), initializes with 0xFFFFFFFF, uses reflected polynomial 0xEDB88320, and finishes by XORing with 0xFFFFFFFF.',
      'Its 256-entry lookup table enables multi-megabyte per second verification directly in the browser.',
    ],
    exampleTitle: 'Standard Check Vector: CRC-32/ISO-HDLC("123456789")',
    computeExample: () => {
      const data = enc.encode('123456789');
      const res = calculateChecksum('crc32_iso_hdlc', data);
      return {
        input: 'ASCII "123456789"',
        output: `0x${res.hex} (decimal ${res.value})`,
        detail: 'Matches IEEE 802.3 / ISO-HDLC standard check value 0xCBF43926.',
      };
    },
    useCase: 'Ethernet FCS frames, PNG chunks, ZIP archives, and high-integrity binary file containers.',
    targetView: 'checksum',
    targetLabel: 'Verify CRC-32 Vector',
  },
  {
    id: 'binary-packet-structures',
    title: 'Binary Packet Structures',
    category: 'Framing & Layout',
    summary: 'Designing resilient frames with Sync/Magic headers, Version bytes, Length fields, Payloads, and Trailing Checksums.',
    explanation: [
      'Well-engineered binary packets follow a predictable anatomy: (1) Magic/Sync bytes for stream framing, (2) Protocol Version for forward compatibility, (3) Fixed header fields & payload length, (4) Typed or raw payload bytes, and (5) a trailing Checksum/CRC covering the header and payload.',
      'Always validate round-trip encoding and decoding—including strict trailing-byte checks and corrupted-checksum rejection—before shipping firmware or parsers.',
    ],
    exampleTitle: 'Anatomy of a Verified Frame',
    computeExample: () => {
      const w = new BinaryWriter();
      w.writeUint8(0x7e); // sync
      w.writeUint8(0x01); // version
      w.writeUint16(2, 'big'); // len
      w.writeBytes(new Uint8Array([0xca, 0xfe])); // payload
      const body = w.toUint8Array();
      const crc = calculateChecksum('crc16_ccitt_false', body);
      w.writeUint16(crc.value, 'big');
      const frame = w.toUint8Array();
      return {
        input: 'Sync(0x7E) | Ver(1) | Len(2) | Payload(CA FE) | CRC-16',
        output: bytesToHexString(frame),
        detail: `Body = 6 bytes; appended CRC-16/CCITT-FALSE = 0x${crc.hex}; total frame = ${frame.length} bytes.`,
      };
    },
    useCase: 'Designing custom UART, SPI, TCP, or BLE binary protocols from scratch with guaranteed parser compatibility.',
    targetView: 'workspace',
    targetLabel: 'Open Full Workbench',
  },
];
