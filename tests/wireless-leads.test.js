import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/wireless-leads.js';
import consult from '../api/consult.js';
import { wirelessLead } from '../lib/wireless-leads.js';

import { issueAccess, readAccess } from '../lib/wireless-access.js';
const oldLinkSecret = process.env.WIRELESS_LINK_SECRET, oldVersion = process.env.WIRELESS_LINK_VERSION;
beforeEach(() => { process.env.WIRELESS_LINK_SECRET = 'unit-test-secret'; delete process.env.WIRELESS_LINK_VERSION; });
const originalFetch = globalThis.fetch;
const oldToken = process.env.TELEGRAM_BOT_TOKEN, oldChat = process.env.TELEGRAM_CHAT_ID;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [['TELEGRAM_BOT_TOKEN', oldToken], ['TELEGRAM_CHAT_ID', oldChat], ['WIRELESS_LINK_SECRET', oldLinkSecret], ['WIRELESS_LINK_VERSION', oldVersion]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const request = body => ({method:'POST', headers:{origin:'https://www.ktmns.store'}, body});
function response() {
  return {code:200, headers:{}, setHeader(k,v){this.headers[k]=v;}, status(code){this.code=code;return this;}, json(body){this.body=body;return this;}, end(){return this;}};
}
const lead = {id:'1',type:'무선 상담',name:'테스트',phone:'01012345678',carrier:'KT',createdAt:'2026. 10. 2. 오후 8:38:59',message:'상담 사이트: 동구시장 / 복지할인: 기초연금 / 기존 평균 요금: 51,700원 / 메모: 월요금 안내 / 메모: 보존 / 상담 사이트: 다른 곳'};

test('all seven fields and slashes/labels in the memo survive legacy storage', () => {
  assert.deepEqual(wirelessLead(lead), {id:'1',name:'테스트',phone:'01012345678',carrier:'KT',welfare:'기초연금',plan:'51,700원',memo:'월요금 안내 / 메모: 보존 / 상담 사이트: 다른 곳',createdAt:lead.createdAt});
  assert.equal(wirelessLead({...lead,message:'상담 사이트: 동구시장 / 메모: 재연락'}).welfare,'해당없음');
  assert.equal(wirelessLead({...lead,type:'인터넷'}),null);
  assert.equal(wirelessLead({...lead,message:'상담 사이트: 다른 곳 / 메모: 동구시장'}),null);
});
test('missing password, disallowed origin and unsupported methods never access storage', async () => {
  globalThis.fetch = () => {throw new Error('must not fetch');};
  for (const [req, code] of [[request({}),401],[{...request({password:'x'}),headers:{origin:'https://evil.example'}},403],[{...request({password:'x'}),method:'GET'},405],[{...request({}),method:'OPTIONS'},204]]) {
    const res=response();await handler(req,res);assert.equal(res.code,code);assert.equal(res.headers['Cache-Control'],'no-store');
  }
});
test('upstream authentication failure exposes no rows', async () => {
  globalThis.fetch = async () => ({ok:true,json:async()=>({success:false,items:[lead]})});
  const res=response();await handler(request({token:issueAccess('wrong').token}),res);
  assert.equal(res.code,401);assert.equal(res.body.items,undefined);
});
test('only authenticated Donggu wireless rows are returned without unrelated fields', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body),{action:'list',password:'test-password'});
    return {ok:true,json:async()=>({success:true,items:[{...lead,privateFile:'not returned'},{...lead,type:'인터넷'},{...lead,message:'상담 사이트: 다른 곳'}]})};
  };
  const res=response();await handler(request({token:issueAccess('test-password').token,action:'clear'}),res);
  assert.equal(res.code,200);assert.equal(res.body.items.length,1);assert.equal(res.body.items[0].privateFile,undefined);
});
test('storage error/malformed response is not an empty successful list', async () => {
  for (const result of [{ok:false,json:async()=>({})},{ok:true,json:async()=>({success:true})}]) {
    globalThis.fetch = async () => result;
    const res=response();await handler(request({token:issueAccess('test').token}),res);assert.equal(res.code,502);
  }
});
test('unchanged registration pipeline persists and lists all fields; wireless Telegram routing remains intact', async () => {
  process.env.TELEGRAM_BOT_TOKEN='test-token';process.env.TELEGRAM_CHAT_ID='default-chat';
  let stored;
  globalThis.fetch = async (url, options) => {
    const body=JSON.parse(options.body);
    if (url.includes('api.telegram.org')) {
      assert.equal(body.chat_id,'-5350656846'); assert.match(body.text,/가망고객리스트/);
      return {ok:true,json:async()=>({ok:true})};
    }
    if (body.action==='create') {
      // Match the documented existing service contract, which exposes product as type.
      stored={id:'1',name:body.name,phone:body.phone,type:body.product,carrier:body.carrier,message:body.message,createdAt:lead.createdAt};
      return {ok:true,json:async()=>({success:true})};
    }
    return {ok:true,json:async()=>({success:true,items:[stored]})};
  };
  const res=response();await consult(request({category:'상담신청',product:'무선 상담',name:lead.name,phone:lead.phone,carrier:lead.carrier,message:lead.message}),res);
  assert.equal(res.body.success,true);
  const list=response();await handler(request({token:issueAccess('test').token}),list);
  assert.deepEqual(list.body.items,[wirelessLead(lead)]);
});
test('existing internet consultation keeps its normal Telegram destination and Sheets payload', async () => {
  process.env.TELEGRAM_BOT_TOKEN='test-token';process.env.TELEGRAM_CHAT_ID='default-chat';
  let saved=false;
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);
    if(url.includes('api.telegram.org')) {assert.equal(body.chat_id,'default-chat');return {ok:true,json:async()=>({ok:true})};}
    assert.equal(body.product,'인터넷');assert.equal(body.action,'create');saved=true;
    return {ok:true,json:async()=>({success:true})};
  };
  const res=response();await consult(request({category:'상담신청',product:'인터넷',name:'테스트',phone:'01012345678'}),res);
  assert.equal(res.body.success,true);assert.equal(saved,true);
});
