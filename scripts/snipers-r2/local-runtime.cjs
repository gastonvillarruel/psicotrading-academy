/* eslint @typescript-eslint/no-require-imports: "off" */
// Preloaded only by the explicit R2 local launcher, including Next child workers.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),tls=require('node:tls');
const {fileURLToPath}=require('node:url');
if(process.env.SNIPERS_R2_LOCAL_PROCESS!=='1'||process.env.SNIPERS_ENVIRONMENT!=='local')throw Error('LOCAL_R2_LAUNCHER_REQUIRED');
const r2Host=process.env.SNIPERS_R2_LOCAL_HOST;
if(!/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(r2Host??''))throw Error('LOCAL_R2_HOST_INVALID');
function isEnvFile(file){
  if(typeof file==='number')return false;
  const value=file instanceof URL?fileURLToPath(file):String(file);
  return /^\.env(?:\.|$)/.test(path.basename(value));
}
function denied(){return Object.assign(new Error('Local launcher blocks automatic env-file loading.'),{code:'ENOENT'});}
// Next and dotenv cannot read the exposed .env or any other automatically discovered profile.
const readSync=fs.readFileSync,readAsync=fs.promises.readFile;
fs.readFileSync=function(file,...args){if(isEnvFile(file))throw denied();return readSync.call(this,file,...args);};
fs.promises.readFile=async function(file,...args){if(isEnvFile(file))throw denied();return readAsync.call(this,file,...args);};
function allow(options){
  if(options.path||!options.port)return;
  const host=String(options.host||options.hostname||'localhost');
  if(['127.0.0.1','::1','localhost'].includes(host))return;
  if(host===r2Host&&Number(options.port)===443)return;
  throw Error('LOCAL_R2_OTHER_EXTERNAL_SERVICE_BLOCKED');
}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){allow(Array.isArray(args[0])?args[0][0]:net._normalizeArgs(args)[0]);return connect.apply(this,args);};
const secure=tls.connect;
tls.connect=function(...args){
  const options=typeof args[0]==='object'?args[0]:Object.assign({port:args[0],host:typeof args[1]==='string'?args[1]:'localhost'},...args.slice(1).filter(x=>x&&typeof x==='object'));
  allow(options);return secure.apply(this,args);
};
