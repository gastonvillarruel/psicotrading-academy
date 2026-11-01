// Policy 2 checks recognizable structure, not decoding, sanitization or malware.
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { ValidationFailure } from './file-validation';

export const BASIC_VALIDATION_POLICY = 2;

export async function checkBasicFormat(file: string, type: 'MP3' | 'PDF', signal: AbortSignal) {
  if (type === 'PDF') {
    const input = await open(file, 'r');
    try {
      signal.throwIfAborted();
      const { size } = await input.stat();
      const head = Buffer.alloc(16), tail = Buffer.alloc(Math.min(size, 4096));
      await input.read(head, 0, head.length, 0);
      await input.read(tail, 0, tail.length, size - tail.length);
      const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail.toString('latin1'));
      const offset = end ? Number(end[1]) : NaN;
      if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(head.toString('latin1'))
        || !Number.isSafeInteger(offset) || offset < 9 || offset >= size - 6) throw new ValidationFailure('INVALID_PDF');
      const xref = Buffer.alloc(Math.min(256, size - offset));
      await input.read(xref, 0, xref.length, offset);
      // Accept classic xref tables and the indirect-object form used by xref streams.
      if (!/^(?:xref\s|\d+\s+\d+\s+obj\s)/.test(xref.toString('latin1'))) throw new ValidationFailure('INVALID_PDF');
      signal.throwIfAborted();
    } finally { await input.close(); }
    return;
  }

  // Walk complete MPEG Layer III frames with bounded buffering. This does not decode audio.
  let buffer = Buffer.alloc(0), first = true, skip = 0, frames = 0, identity: number | undefined;
  const stream = createReadStream(file, { highWaterMark: 64 * 1024, signal });
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    if (first) {
      if (buffer.length < 10) continue;
      first = false;
      if (buffer.subarray(0, 3).toString('ascii') === 'ID3') {
        if (![2, 3, 4].includes(buffer[3]) || buffer[4] === 255 || buffer.subarray(6, 10).some(n => n > 127)
          || (buffer[3] !== 4 && (buffer[5] & 16))) throw new ValidationFailure('INVALID_MP3');
        skip = 10 + buffer[6] * 2097152 + buffer[7] * 16384 + buffer[8] * 128 + buffer[9]
          + (buffer[3] === 4 && (buffer[5] & 16) ? 10 : 0);
      }
    }
    while (buffer.length) {
      if (skip) {
        const count = Math.min(skip, buffer.length); skip -= count; buffer = buffer.subarray(count);
        if (!buffer.length) break;
      }
      if (buffer.length < 4) break;
      // An optional ID3v1 tag is allowed only at the end (checked below).
      if (buffer.subarray(0, 3).toString('ascii') === 'TAG') break;
      const h = buffer.readUInt32BE(), version = (h >>> 19) & 3, layer = (h >>> 17) & 3;
      const bitrateIndex = (h >>> 12) & 15, sampleIndex = (h >>> 10) & 3;
      if ((h >>> 21) !== 2047 || version === 1 || layer !== 1 || !bitrateIndex || bitrateIndex === 15 || sampleIndex === 3) {
        throw new ValidationFailure('INVALID_MP3');
      }
      const frameIdentity = version * 4 + sampleIndex;
      if (identity !== undefined && identity !== frameIdentity) throw new ValidationFailure('INVALID_MP3');
      identity = frameIdentity;
      const bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]
        : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateIndex];
      const sample = [44100,48000,32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
      const length = Math.floor((version === 3 ? 144000 : 72000) * bitrate / sample) + ((h >>> 9) & 1);
      if (buffer.length < length) break;
      buffer = buffer.subarray(length); frames++;
    }
    if (buffer.length > 4096) throw new ValidationFailure('INVALID_MP3');
  }
  if (first || skip || frames < 3 || (buffer.length && !(buffer.length === 128 && buffer.subarray(0, 3).toString('ascii') === 'TAG'))) {
    throw new ValidationFailure('INVALID_MP3');
  }
}
