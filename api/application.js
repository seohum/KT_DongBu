const ALLOWED_ORIGINS = new Set([
  'https://seohum.github.io',
  'https://kt-dong-bu.vercel.app'
]);

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

function validDataImage(value) {
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(value || ''));
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
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const requiredText = ['customerName', 'phone', 'address', 'product', 'idType'];
    if (requiredText.some(key => !text(input[key], 300))) {
      return send(res, 400, { success: false, message: '필수 입력 내용을 확인해주세요.' }, origin);
    }
    if (!validDataImage(input.idFront) || !validDataImage(input.signature)) {
      return send(res, 400, { success: false, message: '신분증과 서명을 확인해주세요.' }, origin);
    }
    if (input.idBack && !validDataImage(input.idBack)) {
      return send(res, 400, { success: false, message: '신분증 뒷면 파일을 확인해주세요.' }, origin);
    }
    const consentCount = Object.values(input.consents || {}).filter(Boolean).length;
    if (consentCount < 6) return send(res, 400, { success: false, message: '필수 동의를 모두 확인해주세요.' }, origin);

    const payload = {
      action: 'submitApplication',
      secret: process.env.APPLICATION_SECRET,
      siteCode: text(input.siteCode, 80),
      siteLabel: text(input.siteLabel, 120),
      product: text(input.product, 80),
      preferredInstallDate: text(input.preferredInstallDate, 30),
      customerName: text(input.customerName, 40),
      birthDate: text(input.birthDate, 8),
      gender: text(input.gender, 10),
      phone: text(input.phone, 30),
      address: text(input.address, 250),
      email: text(input.email, 120),
      currentCarrier: text(input.currentCarrier, 50),
      billingMethod: text(input.billingMethod, 50),
      idType: text(input.idType, 40),
      consents: input.consents,
      idFront: input.idFront,
      idBack: input.idBack || '',
      signature: input.signature
    };

    const upstream = await fetch(process.env.APPLICATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const result = await upstream.json().catch(() => ({}));
    if (!result.ok) throw new Error('Apps Script rejected the submission');

    return send(res, 200, { success: true, applicationId: result.applicationId }, origin);
  } catch (error) {
    console.error('application submission failed', error && error.message);
    return send(res, 502, { success: false, message: '접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, origin);
  }
}
