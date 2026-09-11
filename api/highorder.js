const ALLOWED_ORIGINS = new Set([
  'https://seohum.github.io',
  'https://ktmns.store',
  'https://www.ktmns.store',
  'https://kt-dong-bu.vercel.app'
]);

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.ktmns.store',
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

function validImage(value) {
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(value || ''));
}

function validDocument(value) {
  return validImage(value) || /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(String(value || ''));
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
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const required = ['businessName', 'businessNumber', 'applicantName', 'applicantPhone', 'address', 'installDate'];
    if (required.some(key => !text(input[key], 300))) {
      return send(res, 400, {success:false, message:'필수 입력 내용을 확인해주세요.'}, origin);
    }
    if (!validDocument(input.businessLicense) || !validImage(input.idFront) || !validImage(input.signature)) {
      return send(res, 400, {success:false, message:'사업자등록증, 신분증 앞면과 서명을 확인해주세요.'}, origin);
    }

    const payload = {
      action: 'submitApplication',
      secret: process.env.APPLICATION_SECRET,
      applicationType: 'highorder',
      siteCode: 'highorder-business',
      siteLabel: '기업·소상공인 하이오더',
      product: text(input.product, 300) || 'KT 하이오더',
      preferredInstallDate: text(input.installDate, 30),
      customerName: text(input.applicantName, 60),
      businessName: text(input.businessName, 120),
      businessNumber: text(input.businessNumber, 30),
      birthDate: text(input.birthDate, 20),
      residentNumber: '',
      gender: text(input.gender, 10),
      phone: text(input.applicantPhone, 30),
      address: text(input.address, 250),
      email: text(input.email, 120),
      currentCarrier: '하이오더',
      billingMethod: text(input.billType, 30),
      paymentMethod: '자동이체(은행)',
      accountHolder: text(input.accountHolder, 60),
      bankName: text(input.bankName, 60),
      accountNumber: text(input.accountNumber, 80),
      holderRelation: text(input.payerRelation, 40),
      payerBirth: text(input.payerNumber, 30),
      idType: '신분증 앞면',
      consents: {service:true, privacy:true, uniqueId:true, credit:true, fraudPrevention:true, signatureApply:true},
      idFront: input.idFront,
      idBack: '',
      businessLicense: input.businessLicense,
      signature: input.signature
    };

    const upstream = await fetch(process.env.APPLICATION_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !result.ok || !result.applicationId) throw new Error('Drive folder creation failed');
    return send(res, 200, {success:true, applicationId:result.applicationId}, origin);
  } catch (error) {
    console.error('highorder application failed', error && error.message);
    return send(res, 502, {success:false, message:'하이오더 Drive 접수 폴더 생성에 실패했습니다.'}, origin);
  }
}
