import { CHUNK_SIZE } from '../config/constants';

/**
 * Generator that yields chunks of a file.
 * @param {File} file 
 * @param {number} chunkSize 
 * @returns {Generator<{ index: number, total: number, data: Blob, start: number, end: number }>}
 */
export function* chunkFile(file, chunkSize = CHUNK_SIZE) {
  const total = getChunkCount(file.size, chunkSize);
  for (let index = 0; index < total; index++) {
    const { start, end } = getChunkRange(index, file.size, chunkSize);
    const chunkBlob = file.slice(start, end);
    yield { index, total, data: chunkBlob, start, end };
  }
}

/**
 * Async generator that yields ArrayBuffer chunks of a file.
 * @param {File} file 
 * @param {number} chunkSize 
 * @returns {AsyncGenerator<{ index: number, total: number, data: ArrayBuffer, start: number, end: number }>}
 */
export async function* chunkFileAsync(file, chunkSize = CHUNK_SIZE) {
  const total = getChunkCount(file.size, chunkSize);
  for (let index = 0; index < total; index++) {
    const { start, end } = getChunkRange(index, file.size, chunkSize);
    const chunkBlob = file.slice(start, end);
    const data = await chunkBlob.arrayBuffer();
    yield { index, total, data, start, end };
  }
}

/**
 * Gets the total number of chunks for a given file size.
 * @param {number} fileSize 
 * @param {number} chunkSize 
 * @returns {number}
 */
export function getChunkCount(fileSize, chunkSize = CHUNK_SIZE) {
  return Math.max(1, Math.ceil(fileSize / chunkSize));
}

/**
 * Gets the byte range for a specific chunk index.
 * @param {number} chunkIndex 
 * @param {number} fileSize 
 * @param {number} chunkSize 
 * @returns {{ start: number, end: number, size: number }}
 */
export function getChunkRange(chunkIndex, fileSize, chunkSize = CHUNK_SIZE) {
  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, fileSize);
  return { start, end, size: end - start };
}
