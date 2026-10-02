import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/wireless-leads.js';
import { issueAccess, readAccess } from '../lib/wireless-access.js';
const originalFetch=globalThis.fetch;
const oldSecret=process.env.WIRELESS_LINK_SECRET, oldVersion=process.env.WIRELESS_LINK_VERSION;
beforeEach(()=>{process.env.WIRELESS_LINK_SECRET='unit-test-secret';delete process.env.WIRELESS_LINK_VERSION;});
afterEach(()=>{globalThis.fetch=originalFetch;for(const [k,v] of [['WIRELESS_LINK_SECRET',oldSecret],['WIRELESS_LINK_VERSION',oldVersion]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const request=body=>({method:'POST',headers:{origin:'https://www.ktmns.store'},body});
function response(){return {code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('authenticated issuance returns only an encrypted link and opens without a password', async () => {
  let calls=0;
  globalThis.fetch=async(_url,options)=>{
    assert.equal(JSON.parse(options.body).password,'owner-password');calls++;
    return {ok:true,json:async()=>({success:true,items:[]})};
  };
  const issued=response();await handler(request({action:'issueLink',password:'owner-password'}),issued);
  assert.equal(issued.code,200);assert.equal(issued.body.items,undefined);
  assert.equal(issued.body.url.includes('owner-password'),false);
  const token=new URLSearchParams(new URL(issued.body.url).hash.slice(1)).get('access');
  assert.equal(Buffer.from(token,'base64url').includes(Buffer.from('owner-password')),false);
  const list=response();await handler(request({token}),list);
  assert.deepEqual(list.body.items,[]);assert.equal(calls,2);
});
test('issuance requires existing administrator authentication', async () => {
  globalThis.fetch=async()=>({ok:true,json:async()=>({success:false})});
  const res=response();await handler(request({action:'issueLink',password:'wrong'}),res);
  assert.equal(res.code,401);assert.equal(res.body.url,undefined);
});
test('tampered, expired, revoked and missing links cannot fetch customer data', async () => {
  const valid=issueAccess('password');
  const raw=Buffer.from(valid.token,'base64url');raw[35]^=1;
  const expired=issueAccess('password',Date.now()-91*24*60*60*1000).token;
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not call');};
  for(const body of [{token:raw.toString('base64url')},{token:expired},{password:'password'},{}]){
    const res=response();await handler(request(body),res);assert.equal(res.code,401);
  }
  process.env.WIRELESS_LINK_VERSION='2';
  const res=response();await handler(request({token:valid.token}),res);assert.equal(res.code,401);
  assert.equal(calls,0);
});
test('secret rotation revokes old links and each issuance is randomized', () => {
  const first=issueAccess('password'),second=issueAccess('password');
  assert.notEqual(first.token,second.token);assert.equal(readAccess(first.token),'password');
  process.env.WIRELESS_LINK_SECRET='new-secret';assert.throws(()=>readAccess(first.token));
});
