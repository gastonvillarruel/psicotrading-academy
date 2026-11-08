// Conservative ISO-BMFF/AAC-LC structure validation, not audio decoding or malware scanning.
import { open } from 'node:fs/promises';
import { ValidationFailure } from './file-validation';

type Box = { type: string; start: number; data: number; end: number };
const invalid = (): never => { throw new ValidationFailure('INVALID_M4A'); };
const unsupported = (): never => { throw new ValidationFailure('UNSUPPORTED_M4A'); };
const MAX_METADATA = 32 * 1024 * 1024;
const C2PA_UUID = Buffer.from('d8fec3d61b0e483c92975828877ec481', 'hex');

function header(bytes: Buffer, start: number, limit: number): Box {
  if (bytes.length < 8) invalid();
  let size = bytes.readUInt32BE(), length = 8;
  if (size === 1) {
    if (bytes.length < 16) invalid();
    const wide = bytes.readBigUInt64BE(8);
    if (wide > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
    size = Number(wide); length = 16;
  } else if (size === 0) size = limit - start;
  if (size < length || start + size > limit) invalid();
  return { type: bytes.toString('latin1', 4, 8), start, data: start + length, end: start + size };
}
function boxes(bytes: Buffer, start = 0, end = bytes.length): Box[] {
  const result: Box[] = [];
  while (start < end) {
    if (result.length >= 10000) invalid();
    const box = header(bytes.subarray(start, Math.min(start + 16, end)), start, end);
    result.push(box); start = box.end;
  }
  return result;
}
function one(list: Box[], type: string): Box {
  const found = list.filter(b => b.type === type);
  if (found.length !== 1) invalid();
  return found[0];
}
function payload(bytes: Buffer, box: Box, minimum: number) {
  const value = bytes.subarray(box.data, box.end);
  if (value.length < minimum) invalid();
  return value;
}
function full(bytes: Buffer) {
  if (bytes.length < 4 || bytes.readUInt32BE() !== 0) unsupported();
}

// ISO 14496 descriptors use a bounded, 1–4 byte base-128 length (including padded lengths).
function descriptor(bytes: Buffer, offset: number) {
  if (offset + 2 > bytes.length) invalid();
  const tag = bytes[offset++]; let size = 0;
  for (let i = 0; i < 4; i++) {
    if (offset >= bytes.length) invalid();
    const value = bytes[offset++]; size = size * 128 + (value & 127);
    if (!(value & 128)) {
      if (offset + size > bytes.length) invalid();
      return { tag, value: bytes.subarray(offset, offset + size), end: offset + size };
    }
  }
  return invalid();
}
function aacConfig(bytes: Buffer, rate: number) {
  let position = 0;
  const bits = (count: number) => {
    if (position + count > bytes.length * 8) invalid();
    let value = 0;
    for (let i = 0; i < count; i++, position++) value = value * 2 + ((bytes[position >> 3] >> (7 - (position & 7))) & 1);
    return value;
  };
  if (bytes.length > 8 || bits(5) !== 2) unsupported(); // AAC-LC only; no HE-AAC/ALAC/USAC.
  const frequency = bits(4), channelConfig = bits(4);
  const rates = [96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
  if (frequency >= rates.length || rates[frequency] !== rate || ![1,2].includes(channelConfig)
    || bits(3) !== 0) unsupported(); // 1024 samples, no core dependency/extension.
  if (bytes.length * 8 - position >= 16) {
    // Common encoders signal an absent SBR extension after the LC config.
    if (bits(11) !== 0x2b7 || bits(5) !== 5 || bits(1) !== 0) unsupported();
    if (bytes.length * 8 - position >= 12 && (bits(11) !== 0x548 || bits(1) !== 0)) unsupported();
  }
  if (bytes.length * 8 - position > 7) unsupported();
  while (position < bytes.length * 8) if (bits(1)) unsupported();
}
function esds(bytes: Buffer, rate: number) {
  full(bytes);
  const es = descriptor(bytes, 4);
  if (es.tag !== 3 || es.end !== bytes.length || es.value.length < 3) invalid();
  const flags = es.value[2]; let start = 3;
  if (flags & 128) start += 2;
  if (flags & 64) { if (start >= es.value.length) invalid(); start += 1 + es.value[start]; }
  if (flags & 32) start += 2;
  const decoder = descriptor(es.value, start);
  if (decoder.tag !== 4 || decoder.value.length < 13) invalid();
  if (decoder.value[0] !== 0x40 || decoder.value[1] !== 0x15) unsupported();
  const config = descriptor(decoder.value, 13);
  if (config.tag !== 5 || config.end !== decoder.value.length) invalid();
  aacConfig(config.value, rate);
  const sl = descriptor(es.value, decoder.end);
  if (sl.tag !== 6 || sl.end !== es.value.length || sl.value.length !== 1 || sl.value[0] !== 2) unsupported();
}

function sampleTable(bytes: Buffer, stbl: Box, media: Box[], signal: AbortSignal) {
  const list = boxes(bytes, stbl.data, stbl.end);
  if (list.some(b => ['senc','saiz','saio','stz2'].includes(b.type))) unsupported();
  const description = payload(bytes, one(list, 'stsd'), 8); full(description);
  if (description.readUInt32BE(4) !== 1) unsupported();
  const descriptions = boxes(description, 8);
  if (descriptions.length !== 1) invalid();
  const entry = descriptions[0];
  if (entry.type !== 'mp4a') unsupported();
  const audio = payload(description, entry, 28);
  if (audio.readUInt16BE(6) !== 1 || audio.readUInt16BE(8) !== 0) unsupported();
  const channels = audio.readUInt16BE(16), rate = audio.readUInt32BE(24) / 65536;
  if (![1,2].includes(channels) || audio.readUInt16BE(18) !== 16) unsupported();
  const extensions = boxes(description, entry.data + 28, entry.end);
  if (extensions.some(b => !['esds','btrt'].includes(b.type))) unsupported();
  // MPEG-4 sample entries commonly say two channels even for mono; ASC is authoritative.
  esds(payload(description, one(extensions, 'esds'), 4), rate);

  const sizes = payload(bytes, one(list, 'stsz'), 12); full(sizes);
  const constant = sizes.readUInt32BE(4), count = sizes.readUInt32BE(8);
  if (!count || sizes.length !== 12 + (constant ? 0 : count * 4)) invalid();
  const timing = payload(bytes, one(list, 'stts'), 8); full(timing);
  if (timing.length !== 8 + timing.readUInt32BE(4) * 8) invalid();
  let timed = 0;
  for (let i = 8; i < timing.length; i += 8) {
    if (!timing.readUInt32BE(i) || !timing.readUInt32BE(i + 4)) invalid();
    timed += timing.readUInt32BE(i);
  }
  if (timed !== count) invalid();
  const mapping = payload(bytes, one(list, 'stsc'), 8); full(mapping);
  const entries = mapping.readUInt32BE(4);
  if (!entries || mapping.length !== 8 + entries * 12) invalid();
  const offsetBox = list.filter(b => b.type === 'stco' || b.type === 'co64');
  if (offsetBox.length !== 1) invalid();
  const offsets = payload(bytes, offsetBox[0], 8); full(offsets);
  const stride = offsetBox[0].type === 'stco' ? 4 : 8, chunks = offsets.readUInt32BE(4);
  if (!chunks || offsets.length !== 8 + chunks * stride) invalid();
  for (let i = 0; i < entries; i++) {
    const first = mapping.readUInt32BE(8 + i * 12);
    if ((i === 0 ? first !== 1 : first <= mapping.readUInt32BE(8 + (i - 1) * 12))
      || first > chunks || !mapping.readUInt32BE(12 + i * 12) || mapping.readUInt32BE(16 + i * 12) !== 1) invalid();
  }
  let sample = 0, group = 0, previousEnd = 0;
  for (let chunk = 1; chunk <= chunks; chunk++) {
    signal.throwIfAborted();
    if (group + 1 < entries && chunk === mapping.readUInt32BE(8 + (group + 1) * 12)) group++;
    const samples = mapping.readUInt32BE(12 + group * 12);
    if (sample + samples > count) invalid();
    const index = 8 + (chunk - 1) * stride;
    const start = stride === 4 ? offsets.readUInt32BE(index) : Number(offsets.readBigUInt64BE(index));
    let length = constant * samples;
    if (!constant) for (let i = 0; i < samples; i++) {
      const size = sizes.readUInt32BE(12 + (sample + i) * 4);
      if (!size) invalid(); length += size;
    }
    const end = start + length;
    if (!Number.isSafeInteger(end) || start < previousEnd || !media.some(b => start >= b.data && end <= b.end)) invalid();
    sample += samples; previousEnd = end;
  }
  if (sample !== count) invalid();
}

export async function checkM4aFormat(file: string, signal: AbortSignal) {
  const input = await open(file, 'r');
  try {
    const { size } = await input.stat();
    const read = async (start: number, length: number) => {
      signal.throwIfAborted(); const bytes = Buffer.alloc(length); let offset = 0;
      while (offset < length) {
        signal.throwIfAborted();
        const result = await input.read(bytes, offset, length - offset, start + offset);
        if (!result.bytesRead) invalid(); offset += result.bytesRead;
      }
      return bytes;
    };
    const top: Box[] = []; let position = 0;
    while (position < size) {
      if (top.length >= 10000) invalid();
      const box = header(await read(position, Math.min(16, size - position)), position, size);
      if (box.type === 'uuid') {
        // C2PA provenance is opaque metadata, never proof of audio validity or authenticity.
        if (box.end - box.data < 20) invalid();
        const extension = await read(box.data, 20);
        if (!extension.subarray(0, 16).equals(C2PA_UUID) || extension.readUInt32BE(16) !== 0) unsupported();
      } else if (!['ftyp','moov','mdat','free','skip','wide'].includes(box.type)) unsupported();
      top.push(box); position = box.end;
    }
    const ftyp = one(top, 'ftyp'), moov = one(top, 'moov'), media = top.filter(b => b.type === 'mdat' && b.end > b.data);
    if (top[0] !== ftyp || ftyp.end - ftyp.data < 8 || ftyp.end - ftyp.data > 1024
      || (ftyp.end - ftyp.data) % 4 || !media.length || moov.end - moov.data > MAX_METADATA) invalid();
    const brands = await read(ftyp.data, ftyp.end - ftyp.data);
    const accepted = ['M4A ','isom','iso2','mp41','mp42'];
    if (!accepted.includes(brands.toString('latin1', 0, 4))) unsupported();
    const bytes = await read(moov.data, moov.end - moov.data), movie = boxes(bytes);
    if (movie.some(b => b.type === 'mvex')) unsupported(); // No fragmented MP4.
    payload(bytes, one(movie, 'mvhd'), 100);
    const tracks = movie.filter(b => b.type === 'trak');
    if (tracks.length !== 1) unsupported(); // Includes rejection of video/cover-art tracks.
    const track = boxes(bytes, tracks[0].data, tracks[0].end);
    payload(bytes, one(track, 'tkhd'), 84);
    const mdia = one(track, 'mdia'), data = boxes(bytes, mdia.data, mdia.end);
    const handler = payload(bytes, one(data, 'hdlr'), 24);
    if (handler.toString('latin1', 8, 12) !== 'soun') unsupported();
    const mdhd = payload(bytes, one(data, 'mdhd'), 24);
    if (![0,1].includes(mdhd[0]) || mdhd.length < (mdhd[0] ? 36 : 24)
      || !mdhd.readUInt32BE(mdhd[0] ? 20 : 12)) invalid();
    const minf = one(data, 'minf'), info = boxes(bytes, minf.data, minf.end);
    payload(bytes, one(info, 'smhd'), 8);
    const dinf = one(info, 'dinf'), refs = boxes(bytes, dinf.data, dinf.end);
    const dref = payload(bytes, one(refs, 'dref'), 8); full(dref);
    const urls = boxes(dref, 8);
    if (dref.readUInt32BE(4) !== 1 || urls.length !== 1 || urls[0].type !== 'url '
      || !payload(dref, urls[0], 4).equals(Buffer.from([0,0,0,1]))) unsupported();
    sampleTable(bytes, one(info, 'stbl'), media, signal);
    signal.throwIfAborted();
  } finally { await input.close(); }
}
