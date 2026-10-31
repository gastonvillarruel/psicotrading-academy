import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth';
import { pool } from '../db';
import { createUploadGateway } from './upload-gateway';
import { createR2Storage, type MultipartStorage } from './upload-storage';

let storage: MultipartStorage | undefined;
export const snipersUploads = createUploadGateway(pool, () => getServerSession(authOptions), () => ({
  enabled: process.env.SNIPERS_ENABLED, singleSession: process.env.ENABLE_SINGLE_SESSION, secret: process.env.NEXTAUTH_SECRET,
}), () => storage ??= createR2Storage());
