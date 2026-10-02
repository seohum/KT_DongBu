import { wirelessLead } from '../lib/wireless-leads.js';
import { issueAccess, readAccess } from '../lib/wireless-access.js';

const SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxi7OLg1zqI9BZtxOHVg5tsL_mgU_hj0zRnYY1vC92U9OGrxiwVDW9_Q6oDAIlJssYz/exec';

export default async function handler(request, response) {
  const origin = request.headers.origin || '';
  const allowed = new Set(['https://www.ktmns.store', 'https://ktmns.store', 'https://seohum.github.io', 'https://kt-dong-bu.vercel.app',
    ...String(process.env.ALLOWED_ORIGIN || '').split(',').map(v => v.trim()).filter(Boolean)]);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Origin', allowed.has(origin) ? origin : 'https://www.ktmns.store');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (!allowed.has(origin)) return response.status(403).json({success:false, message:'허용되지 않은 요청입니다.'});
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({success:false, message:'지원하지 않는 요청입니다.'});
  const issue = request.body?.action === 'issueLink';
  let password;
  if (issue) {
    password = request.body?.password;
  } else {
    try { password = readAccess(request.body?.token); }
    catch (_) { return response.status(401).json({success:false, message:'유효한 비밀 전용 링크로 접속해주세요. 만료된 링크는 다시 발급받아주세요.'}); }
  }
  if (typeof password !== 'string' || !password.trim() || password.length > 200) {
    return response.status(401).json({success:false, message:'기존 관리자 비밀번호를 입력해주세요.'});
  }
  try {
    // Authenticate using the existing administrator service; never expose other leads.
    const upstream = await fetch(SHEETS_ENDPOINT, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'list', password}), signal:AbortSignal.timeout(20000)
    });
    if (!upstream.ok) throw new Error('upstream');
    const result = await upstream.json();
    if (!result.success) return response.status(401).json({success:false, message:issue ? '관리자 비밀번호를 확인해주세요.' : '링크 권한이 만료되었습니다. 관리자에게 새 링크를 요청해주세요.'});
    if (!Array.isArray(result.items)) throw new Error('invalid response');
    if (issue) {
      const {token, expiresAt} = issueAccess(password);
      return response.status(200).json({success:true, url:'https://www.ktmns.store/wireless-admin.html#access=' + token, expiresAt});
    }
    return response.status(200).json({success:true, items:result.items.map(wirelessLead).filter(Boolean)});
  } catch (_) {
    return response.status(502).json({success:false, message:'목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'});
  }
}
