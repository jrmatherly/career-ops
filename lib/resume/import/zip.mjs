// Ported from Reactive Resume packages/import/src/zip.ts at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: JavaScript, no other changes.
import { Unzip, UnzipInflate } from 'fflate';

export class ZipEntryTooLargeError extends Error {
  constructor(entry) {
    super(`"${entry}" is too large.`);
    this.entry = entry;
  }
}

// Each pushed slice inflates in one step, so this bounds the overshoot past the limit (about 1,000x for deflate).
const SLICE_BYTES = 16 * 1024;

/**
 * Inflates the first entry of each name `select` accepts and nothing else. A ZIP's declared sizes can lie, so
 * inflation stops as soon as an entry actually produces more than `maxEntryBytes`. Callers bound the number of names
 * they accept, or pass `maxTotalBytes` when a pattern can match many entries.
 *
 * @param {Uint8Array} data
 * @param {(name: string) => boolean} select
 * @param {number} maxEntryBytes
 * @param {number} [maxTotalBytes]
 * @returns {Record<string, Uint8Array>}
 */
export function unzipEntries(data, select, maxEntryBytes, maxTotalBytes = Number.POSITIVE_INFINITY) {
  const entries = new Map();
  let totalBytes = 0;
  let entryCount = 0;
  const unzip = new Unzip((file) => {
    if (++entryCount > 2_000) throw new Error('ZIP contains too many entries.');
    if (entries.has(file.name) || !select(file.name)) return;
    const chunks = [];
    let size = 0;
    entries.set(file.name, chunks);
    file.ondata = (error, chunk) => {
      if (error) throw error;
      size += chunk.length;
      totalBytes += chunk.length;
      if (size > maxEntryBytes || totalBytes > maxTotalBytes) throw new ZipEntryTooLargeError(file.name);
      chunks.push(chunk);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < data.length; offset += SLICE_BYTES) {
    unzip.push(data.subarray(offset, offset + SLICE_BYTES), offset + SLICE_BYTES >= data.length);
  }

  const files = {};
  for (const [name, chunks] of entries) {
    const file = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      file.set(chunk, offset);
      offset += chunk.length;
    }
    files[name] = file;
  }
  return files;
}
