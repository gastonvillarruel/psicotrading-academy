import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth';
import { pool } from '../db';
import { createUploadGateway } from './upload-gateway';
import { createR2Storage } from './upload-storage';
import { advancePrivateUpload } from './basic-upload-processor';

let storage: ReturnType<typeof createR2Storage> | undefined;
export const snipersUploads = createUploadGateway(pool, () => getServerSession(authOptions), () => ({
  enabled: process.env.SNIPERS_ENABLED, singleSession: process.env.ENABLE_SINGLE_SESSION, secret: process.env.NEXTAUTH_SECRET,
}), () => storage ??= createR2Storage(), (who, uploadId) => advancePrivateUpload(pool, who, uploadId, storage ??= createR2Storage()),true);
