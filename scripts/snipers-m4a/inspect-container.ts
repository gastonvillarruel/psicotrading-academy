// Local, read-only diagnostic. Only box types and ftyp brands leave this process.
import { open } from 'node:fs/promises';
import path from 'node:path';
import { checkM4aFormat } from '../../src/lib/snipers/m4a-validation';

const topLevelTypes = ['ftyp','moov','mdat','free','skip','wide'];
const fourcc = (bytes: Buffer) => bytes.every(b => b >= 32 && b <= 126)
  ? bytes.toString('ascii') : `0x${bytes.toString('hex')}`;

export async function inspectContainer(file: string) {
  const input = await open(file, 'r');
  try {
    const { size } = await input.stat();
    if (!Number.isSafeInteger(size) || size < 8) throw new Error('INVALID_CONTAINER');
    const read = async (offset: number, length: number) => {
      const bytes = Buffer.alloc(length);
      for (let used = 0; used < length;) {
        const result = await input.read(bytes, used, length - used, offset + used);
        if (!result.bytesRead) throw new Error('INVALID_CONTAINER');
        used += result.bytesRead;
      }
      return bytes;
    };
    const topLevelBoxes: string[] = [];
    const brands: { majorBrand: string; compatibleBrands: string[] }[] = [];
    const uuidUserTypes: string[] = [];
    const unsupportedTopLevelBoxes: string[] = [];
    for (let offset = 0; offset < size;) {
      if (topLevelBoxes.length >= 10000 || size - offset < 8) throw new Error('INVALID_CONTAINER');
      const header = await read(offset, 8);
      let length = header.readUInt32BE(), headerLength = 8;
      if (length === 1) {
        if (size - offset < 16) throw new Error('INVALID_CONTAINER');
        const wide = (await read(offset + 8, 8)).readBigUInt64BE();
        if (wide > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_CONTAINER');
        length = Number(wide); headerLength = 16;
      } else if (length === 0) length = size - offset;
      if (length < headerLength || length > size - offset) throw new Error('INVALID_CONTAINER');
      const type = fourcc(header.subarray(4, 8));
      topLevelBoxes.push(type);
      let supported = topLevelTypes.includes(type);
      if (type === 'uuid') {
        if (length - headerLength < 16) throw new Error('INVALID_CONTAINER');
        const id = (await read(offset + headerLength, 16)).toString('hex');
        uuidUserTypes.push(`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`);
        supported = id === 'd8fec3d61b0e483c92975828877ec481' && length - headerLength >= 20
          && (await read(offset + headerLength + 16, 4)).readUInt32BE() === 0;
      }
      if (!supported) unsupportedTopLevelBoxes.push(type);
      if (type === 'ftyp') {
        const payloadLength = length - headerLength;
        if (payloadLength < 8 || payloadLength > 1024 || payloadLength % 4) throw new Error('INVALID_CONTAINER');
        const payload = await read(offset + headerLength, payloadLength);
        const compatibleBrands: string[] = [];
        for (let i = 8; i < payload.length; i += 4) compatibleBrands.push(fourcc(payload.subarray(i, i + 4)));
        brands.push({ majorBrand: fourcc(payload.subarray(0, 4)), compatibleBrands });
      }
      // Skip every other payload, including all audio and descriptive metadata.
      offset += length;
    }
    return { topLevelBoxes, brands, uuidUserTypes,
      unsupportedTopLevelBoxes: [...new Set(unsupportedTopLevelBoxes)] };
  } finally { await input.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/snipers-m4a/inspect-container.ts')) {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    console.error('Uso: node --import tsx scripts/snipers-m4a/inspect-container.ts "RUTA_LOCAL_M4A"');
    process.exitCode = 1;
  } else {
    inspectContainer(file).then(async result => {
      let formatCheck: { result: string; validatorLines: number[] };
      try {
        await checkM4aFormat(file, AbortSignal.timeout(45000));
        formatCheck = { result: 'ACCEPTED', validatorLines: [] };
      } catch (error) {
        const failure = error as { code?: string; stack?: string };
        const code = failure.code && ['UNSUPPORTED_M4A','INVALID_M4A'].includes(failure.code) ? failure.code : 'LOCAL_FORMAT_CHECK_FAILED';
        const lines = [...String(failure.stack ?? '').matchAll(/m4a-validation\.ts:(\d+):(\d+)/g)].map(m => Number(m[1])).filter(n => n > 7);
        formatCheck = { result: code, validatorLines: [...new Set(lines)] };
      }
      console.log(JSON.stringify({ ...result, formatCheck }));
    })
      .catch(() => { console.error(JSON.stringify({ error: 'LOCAL_CONTAINER_INSPECTION_FAILED' })); process.exitCode = 1; });
  }
}
