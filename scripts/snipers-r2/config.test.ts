import test from 'node:test';
import assert from 'node:assert/strict';
import {privateTestConfig} from './check';

const fixture=['SNIPERS_ENVIRONMENT=local','SNIPERS_R2_ENVIRONMENT=test',
  'SNIPERS_R2_TEST_ACCOUNT_ID='+ 'a'.repeat(32),'SNIPERS_R2_TEST_BUCKET=snipers-test-psicoemotrading',
  'SNIPERS_R2_TEST_ACCESS_KEY_ID=synthetic-key','SNIPERS_R2_TEST_SECRET_ACCESS_KEY=synthetic-secret'].join('\n');
test('explicit test profile resolves the pinned bucket and endpoint without network',()=>{
  const config=privateTestConfig(fixture);
  assert.equal(config.bucket,'snipers-test-psicoemotrading');
  assert.equal(config.endpoint,'https://'+'a'.repeat(32)+'.r2.cloudflarestorage.com');
});
test('profile rejects other buckets, environments and ambient configuration keys',()=>{
  for(const text of [fixture.replace('snipers-test-psicoemotrading','snipers-test-other'),
    fixture.replace('SNIPERS_ENVIRONMENT=local','SNIPERS_ENVIRONMENT=production'),
    fixture.replace('SNIPERS_R2_ENVIRONMENT=test','SNIPERS_R2_ENVIRONMENT=production'),
    fixture+'\nAWS_ACCESS_KEY_ID=synthetic',fixture+'\nSNIPERS_ENABLED=true',fixture+'\nDATABASE_URL=synthetic']){
    assert.throws(()=>privateTestConfig(text));
  }
});
test('empty credentials and invalid account identifiers cannot become an active profile',()=>{
  assert.throws(()=>privateTestConfig(fixture.replace('=synthetic-secret','=')));
  assert.throws(()=>privateTestConfig(fixture.replace('a'.repeat(32),'invalid-account')));
});
