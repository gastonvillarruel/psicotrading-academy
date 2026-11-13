import {pool} from '@/lib/db';
import {createR2Storage} from '@/lib/snipers/upload-storage';
import {createDeletionCronHandler} from '@/lib/snipers/storage-deletion-cron';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const GET=createDeletionCronHandler(pool,()=>createR2Storage(),()=>({
  secret:process.env.CRON_SECRET,enabled:process.env.SNIPERS_STORAGE_CLEANUP_ENABLED,snipers:process.env.SNIPERS_ENABLED,
}));
