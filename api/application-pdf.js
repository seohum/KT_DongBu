const ALLOWED_ORIGINS = new Set([
  'https://seohum.github.io',
  'https://ktmns.store',
  'https://www.ktmns.store',
  'https://kt-dong-bu.vercel.app'
]);

const MAX_PDF_BYTES = 4_400_000;

export const config = {
  api: {
    bodyParser: false
  }
};

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

function text(value, max) {
  return String(value || '').trim().slice(0, max);
}

async function readPdfBody(req) {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_PDF_BYTES) throw new Error('PDF_TOO_LARGE');

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_PDF_BYTES) throw new Error('PDF_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || '');

  if (req.method === 'OPTIONS') {
    Object.entries(cors(origin)).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(204).end();
  }

  if (req.method !== 'POST') return send(res, 405, {success:false, message:'허용되지 않은 요청입니다.'}, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return send(res, 403, {success:false, message:'허용되지 않은 사이트입니다.'}, origin);
  if (!process.env.APPLICATION_ENDPOINT || !process.env.APPLICATION_SECRET) {
    return send(res, 503, {success:false, message:'접수 서버 설정을 확인해주세요.'}, origin);
  }

  try {
    const applicationId = text(req.query?.applicationId, 100);
    const fileName = text(req.query?.fileName, 180);
    if (!/^KT-[0-9A-Z-]+$/i.test(applicationId)) {
      return send(res, 400, {success:false, message:'접수번호를 확인해주세요.'}, origin);
    }

    const pdf = await readPdfBody(req);
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return send(res, 400, {success:false, message:'PDF 파일을 확인해주세요.'}, origin);
    }

    const upstream = await fetch(process.env.APPLICATION_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'attachPdf',
        secret:process.env.APPLICATION_SECRET,
        applicationId,
        fileName:fileName || `${applicationId}_유선가입신청서.pdf`,
        pdfData:`data:application/pdf;base64,${pdf.toString('base64')}`
      }),
      redirect:'follow'
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !result.ok) throw new Error('PDF upload failed');
    return send(res, 200, {success:true}, origin);
  } catch (error) {
    console.error('binary PDF upload failed', error && error.message);
    if (error && error.message === 'PDF_TOO_LARGE') {
      return send(res, 413, {success:false, message:'PDF 용량이 너무 큽니다.'}, origin);
    }
    return send(res, 502, {success:false, message:'PDF 저장 중 오류가 발생했습니다.'}, origin);
  }
}
