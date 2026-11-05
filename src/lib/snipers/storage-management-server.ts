import 'server-only';
import {getServerSession} from 'next-auth';
import {authOptions} from '../auth';
import {pool} from '../db';
import {createR2Storage} from './upload-storage';
import {createStorageManagementGateway} from './storage-management-gateway';

export const snipersStorage=createStorageManagementGateway(pool,()=>getServerSession(authOptions),()=>({
  enabled:process.env.SNIPERS_ENABLED,singleSession:process.env.ENABLE_SINGLE_SESSION,secret:process.env.NEXTAUTH_SECRET,
}),()=>createR2Storage());
