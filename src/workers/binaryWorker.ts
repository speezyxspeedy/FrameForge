import type { ChecksumAlgorithm, ChecksumCalculation, DecodedPacket, ProtocolSchema } from '../types/protocol';
import { calculateChecksum } from '../engine/checksumEngine';
import { decodePacket } from '../engine/binaryReader';
import { searchBytesInBuffer } from '../utilities/formatters';

export type WorkerRequest =
  | {
      id: number;
      type: 'checksum';
      algorithm: ChecksumAlgorithm;
      bytes: Uint8Array;
      startOffset: number;
      endOffset: number;
    }
  | {
      id: number;
      type: 'decode';
      schema: ProtocolSchema;
      bytes: Uint8Array;
      strictMode: boolean;
    }
  | {
      id: number;
      type: 'search';
      haystack: Uint8Array;
      needle: Uint8Array;
    };

export type WorkerResponse =
  | { id: number; ok: true; type: 'checksum'; result: ChecksumCalculation }
  | { id: number; ok: true; type: 'decode'; result: DecodedPacket }
  | { id: number; ok: true; type: 'search'; result: number[] }
  | { id: number; ok: false; error: string };

// Web Worker execution entry point
const isWorkerContext =
  typeof self !== 'undefined' &&
  typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function';

if (isWorkerContext || (typeof self !== 'undefined' && typeof window === 'undefined')) {
  self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const req = event.data;
    try {
      if (req.type === 'checksum') {
        const result = calculateChecksum(req.algorithm, req.bytes, req.startOffset, req.endOffset);
        const resp: WorkerResponse = { id: req.id, ok: true, type: 'checksum', result };
        self.postMessage(resp);
      } else if (req.type === 'decode') {
        const result = decodePacket(req.schema, req.bytes, { strictMode: req.strictMode });
        const resp: WorkerResponse = { id: req.id, ok: true, type: 'decode', result };
        self.postMessage(resp);
      } else if (req.type === 'search') {
        const result = searchBytesInBuffer(req.haystack, req.needle);
        const resp: WorkerResponse = { id: req.id, ok: true, type: 'search', result };
        self.postMessage(resp);
      }
    } catch (err) {
      const resp: WorkerResponse = {
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : 'Worker processing failed.',
      };
      self.postMessage(resp);
    }
  });
}

/**
 * Threshold in bytes above which checksum/search operations offload to the Web Worker.
 */
export const WORKER_OFFLOAD_THRESHOLD_BYTES = 8192;

let sharedWorker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<
  number,
  { resolve: (res: WorkerResponse) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!sharedWorker) {
    try {
      sharedWorker = new Worker(new URL('./binaryWorker.ts', import.meta.url), {
        type: 'module',
      });
      sharedWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const resp = event.data;
        const pending = pendingRequests.get(resp.id);
        if (pending) {
          pendingRequests.delete(resp.id);
          pending.resolve(resp);
        }
      };
      sharedWorker.onerror = (err) => {
        for (const [, p] of pendingRequests) {
          p.reject(new Error(err.message || 'Binary worker error'));
        }
        pendingRequests.clear();
        sharedWorker?.terminate();
        sharedWorker = null;
      };
    } catch {
      return null;
    }
  }
  return sharedWorker;
}

export async function runChecksumAsync(
  algorithm: ChecksumAlgorithm,
  bytes: Uint8Array,
  startOffset = 0,
  endOffset = bytes.length
): Promise<ChecksumCalculation> {
  if (bytes.length < WORKER_OFFLOAD_THRESHOLD_BYTES) {
    return calculateChecksum(algorithm, bytes, startOffset, endOffset);
  }
  const worker = getWorker();
  if (!worker) {
    return calculateChecksum(algorithm, bytes, startOffset, endOffset);
  }
  const id = nextRequestId++;
  return new Promise<ChecksumCalculation>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (resp) => {
        if (resp.ok && resp.type === 'checksum') {
          resolve(resp.result);
        } else if (!resp.ok) {
          reject(new Error(resp.error));
        }
      },
      reject,
    });
    const req: WorkerRequest = {
      id,
      type: 'checksum',
      algorithm,
      bytes,
      startOffset,
      endOffset,
    };
    worker.postMessage(req);
  });
}

export async function searchBytesAsync(
  haystack: Uint8Array,
  needle: Uint8Array
): Promise<number[]> {
  if (haystack.length < WORKER_OFFLOAD_THRESHOLD_BYTES) {
    return searchBytesInBuffer(haystack, needle);
  }
  const worker = getWorker();
  if (!worker) {
    return searchBytesInBuffer(haystack, needle);
  }
  const id = nextRequestId++;
  return new Promise<number[]>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (resp) => {
        if (resp.ok && resp.type === 'search') {
          resolve(resp.result);
        } else if (!resp.ok) {
          reject(new Error(resp.error));
        }
      },
      reject,
    });
    const req: WorkerRequest = { id, type: 'search', haystack, needle };
    worker.postMessage(req);
  });
}
