import applicationHandler from './application.js';

const ALLOWED_ORIGINS = new Set([
  'https://seohum.github.io',
  'https://ktmns.store',
  'https://www.ktmns.store',
  'https://kt-dong-bu.vercel.app'
]);

const MAX_REQUEST_BYTES = 4_400_000;

export const maxDuration = 60;
export const config = { api: { bodyParser: false } };

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://seohum.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}

function send(res, status, payload, origin) {
  Object.entries(cors(origin)).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(status).json(payload);
}

async function readBody(req) {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseCombinedBody(raw) {
  if (raw.length < 9) throw new Error('INVALID_REQUEST');
  const jsonLength = raw.readUInt32BE(0);
  if (!jsonLength || jsonLength > raw.length - 9) throw new Error('INVALID_REQUEST');
  const input = JSON.parse(raw.subarray(4, 4 + jsonLength).toString('utf8'));
  const pdf = raw.subarray(4 + jsonLength);
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('INVALID_PDF');
  return { input, pdf };
}

async function submitApplication(input, origin) {
  let statusCode = 500;
  let payload = { success: false, message: '접수 서버에 연결할 수 없습니다.' };
  const response = {
    setHeader() {},
    status(value) { statusCode = value; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await applicationHandler({ method: 'POST', headers: { origin }, body: input }, response);
  return { statusCode, payload };
}

async function attachPdf(applicationId, fileName, pdf) {
  const upstream = await fetch(process.env.APPLICATION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'attachPdf',
      secret: process.env.APPLICATION_SECRET,
      applicationId,
      fileName,
      pdfData: `data:application/pdf;base64,${pdf.toString('base64')}`
    }),
    redirect: 'follow'
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !result.ok) throw new Error('PDF upload failed');
}

async function attachPdfWithRetry(applicationId, fileName, pdf) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await attachPdf(applicationId, fileName, pdf);
      return true;
    } catch (error) {
      lastError = error;
      console.error('PDF upload attempt failed', applicationId, attempt, error && error.message);
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError || new Error('PDF upload failed');
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || '');
  if (req.method === 'OPTIONS') {
    Object.entries(cors(origin)).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(204).end();
  }
  if (req.method !== 'POST') return send(res, 405, { success: false, message: '허용되지 않은 요청입니다.' }, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return send(res, 403, { success: false, message: '허용되지 않은 사이트입니다.' }, origin);
  if (!process.env.APPLICATION_ENDPOINT || !process.env.APPLICATION_SECRET) {
    return send(res, 503, { success: false, message: '접수 서버 설정을 확인해주세요.' }, origin);
  }

  try {
    const { input, pdf } = parseCombinedBody(await readBody(req));
    const applicationResponse = await submitApplication(input, origin);
    const applicationResult = applicationResponse.payload;
    if (applicationResponse.statusCode !== 200 || !applicationResult.success) {
      return send(res, applicationResponse.statusCode || 502, {
        success: false,
        message: applicationResult.message || '접수 서버에 연결할 수 없습니다.'
      }, origin);
    }

    const applicationId = String(applicationResult.applicationId || '').trim();
    const suffix = String(input.pdfFileName || '유선가입신청서.pdf')
      .replace(/^KT_/, '')
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 150);
    const fileName = `${applicationId}_${suffix || '유선가입신청서.pdf'}`;
    let pdfSaved = false;
    try {
      pdfSaved = await attachPdfWithRetry(applicationId, fileName, pdf);
    } catch (pdfError) {
      console.error('PDF upload failed after submission', applicationId, pdfError && pdfError.message);
    }

    return send(res, 200, {
      success: true,
      applicationId,
      pdfSaved,
      message: pdfSaved ? '' : '접수는 완료됐지만 PDF 저장에 실패했습니다. 접수번호를 관리자에게 알려주세요.'
    }, origin);
  } catch (error) {
    console.error('combined application submission failed', error && error.message);
    if (error && error.message === 'REQUEST_TOO_LARGE') {
      return send(res, 413, { success: false, message: '첨부파일 용량이 너무 큽니다. 더 작은 파일로 다시 등록해주세요.' }, origin);
    }
    return send(res, 400, { success: false, message: '신청서 전송 데이터를 확인해주세요.' }, origin);
  }
}
