import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {getUpload} from '../../src/lib/snipers/uploads';

const uploadId='00000000-0000-4000-8000-000000000001';
const actor={userId:'local-editor',activeSessionId:'local-session',singleSession:true};
type Job={kind:string;status:string;phase:string;errorCode:string|null};
const pending:Job={kind:'PROCESS_UPLOAD',status:'BLOCKED',phase:'DOWNLOAD',errorCode:'AWAITING_VALIDATION'};
function fixture(status='PROCESSING',job:Job=pending,access={grant:true,owner:true,session:true}){
  const queries:string[]=[];
  const tx={release(){},async query(sql:string){
    queries.push(sql);
    let rows:unknown[]=[];
    if(sql.includes('FROM "User"'))rows=[{activeSessionId:access.session?actor.activeSessionId:'replaced'}];
    else if(sql.includes('FROM "UserPermission"'))rows=access.grant?[{id:'grant'}]:[];
    else if(sql.startsWith('SELECT r."classId"'))rows=[{classId:'class',id:'resource'}];
    else if(sql.startsWith('SELECT status FROM "SnipersClass"'))rows=[{status:'DRAFT'}];
    else if(sql.startsWith('SELECT u.*,o.key'))rows=[{id:uploadId,resourceId:'resource',creatorId:access.owner?actor.userId:'other-editor',
      status,expiresAt:new Date('2099-01-01'),sizeBytes:'73049',name:'synthetic.pdf'}];
    else if(sql.includes('ORDER BY CASE kind')){
      assert.match(sql,/SELECT kind,status,phase/);rows=[job];
    }else if(sql==='SELECT clock_timestamp() AS now')rows=[{now:new Date('2026-11-02')}];
    else assert.ok(/^(BEGIN|COMMIT|ROLLBACK|SELECT id FROM "Snipers)/.test(sql),'unexpected SQL');
    return {rows,rowCount:rows.length};
  }};
  return {pool:{async connect(){return tx;}} as unknown as Pool,queries};
}
test('pending basic validation stays PROCESSING and can reach the next advance without declaring success',async()=>{
  const {pool,queries}=fixture();const state=await getUpload(pool,actor,{uploadId});
  assert.equal(state.blocked,false);assert.equal(state.status,'PROCESSING');
  assert.equal(state.errorCode,'AWAITING_VALIDATION');assert.equal(state.transferComplete,true);
  assert.equal(state.uploadId,uploadId);assert.ok(!queries.some(sql=>/^(UPDATE|INSERT|DELETE)/.test(sql)));
});
test('every other BLOCKED combination remains blocked',async()=>{
  const cases:[string,Job][]=[
    ['PROCESSING',{...pending,errorCode:'VALIDATION_UNAVAILABLE'}],
    ['PROCESSING',{...pending,errorCode:'VALIDATION_INTERRUPTED'}],
    ['PROCESSING',{...pending,errorCode:'SHA256_MISMATCH'}],
    ['PROCESSING',{...pending,phase:'VERIFY_FINAL'}],
    ['PROCESSING',{...pending,kind:'PREPARE_UPLOAD'}],
    ['COMPLETING',pending],['FAILED',pending],
    ['PREPARING',{...pending,kind:'PREPARE_UPLOAD',phase:'CREATE_MULTIPART',errorCode:'CREATE_UNCERTAIN'}],
  ];
  for(const [status,job] of cases){
    const state=await getUpload(fixture(status,job).pool,actor,{uploadId});
    assert.equal(state.blocked,true,JSON.stringify({status,job}));assert.equal(state.status,status);
  }
});
test('recoverable state still requires the editor permission, ownership and current session',async()=>{
  for(const [access,code] of [
    [{grant:false,owner:true,session:true},'FORBIDDEN'],
    [{grant:true,owner:false,session:true},'NOT_FOUND'],
    [{grant:true,owner:true,session:false},'SESSION'],
  ] as const){
    await assert.rejects(getUpload(fixture('PROCESSING',pending,access).pool,actor,{uploadId}),
      (error:unknown)=>(error as {code?:string}).code===code);
  }
});
