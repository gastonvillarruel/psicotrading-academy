import type { Pool } from 'pg';
import { actorFromSession } from './session';
import { previewKey } from './preview';
import { reject } from './errors';
import { requirePermission, transaction, type Actor } from './permissions';
import * as uploads from './uploads';
import type { MultipartStorage } from './upload-storage';

export function createUploadGateway(pool: Pool, session: () => Promise<Parameters<typeof actorFromSession>[0]>,
  config: () => { enabled?: string; singleSession?: string; secret?: string }, storage: () => MultipartStorage,
  advance?: (who: Actor, uploadId: string) => Promise<void>) {
  async function actor() {
    const c = config();
    if (c.enabled !== 'true') reject('DISABLED', 'Snipers deshabilitado.');
    previewKey(c.secret);
    return actorFromSession(await session(), c.singleSession);
  }
  return {
    async start(input: unknown) {
      const who = await actor();
      // Check permission before inspecting external configuration or allocating a durable transfer.
      await transaction(pool, tx => requirePermission(tx, who, 'SNIPERS_CONTENT_EDITOR', true));
      storage();
      return uploads.startUpload(pool, who, input);
    },
    async get(input: unknown) { return uploads.getUpload(pool, await actor(), input); },
    async advance(input: unknown) {
      const who = await actor();
      const current = await uploads.getUpload(pool, who, input);
      if (!advance) reject('CONFIGURATION', 'Avance privado no configurado.');
      await advance(who, current.uploadId);
      return uploads.getUpload(pool, who, input);
    },
    async sign(input: unknown) { return uploads.signUploadPart(pool, await actor(), input, storage); },
    async complete(input: unknown) { return uploads.completeUpload(pool, await actor(), input); },
    async cancel(input: unknown) { return uploads.cancelUpload(pool, await actor(), input, storage); },
  };
}
