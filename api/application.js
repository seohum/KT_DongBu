const ALLOWED_ORIGINS = new Set([
  'https://seohum.github.io',
  'https://kt-dong-bu.vercel.app'
]);

const SHEETS_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxi7OLg1zqI9BZtxOHVg5tsL_mgU_hj0zRnYY1vC92U9OGrxiwVDW9_Q6oDAIlJssYz/exec';

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
function validDataPdf(value) {
  return /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(String(value || ''));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPhone(value) {
  const phone = String(value || '').replace(/\D/g, '');
  return phone.length === 11
    ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
    : phone;
}

async function notifyTelegramAndAdmin(input, applicationId) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    throw new Error('Telegram environment variables are missing');
  }

  const createdAt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(new Date());
  const siteLabel = text(input.siteLabel, 120) || '일반 가입';
  const adminRecord = {
    action: 'create',
    category: '가입신청',
    name: text(input.customerName, 40),
    phone: String(input.phone || '').replace(/\D/g, ''),
    product: text(input.product, 80),
    address: text(input.address, 250),
    carrier: text(input.currentCarrier, 50),
    apartment: siteLabel,
    unit: '',
    installDate: text(input.preferredInstallDate, 30),
    message: `전자신청 접수번호: ${applicationId}`,
    status: '접수'
  };

  const telegramText = [
    '🔵 <b>KT동부법인지사 전자 가입신청</b>',
    '',
    `🧾 <b>접수번호</b>  ${escapeHtml(applicationId)}`,
    `👤 <b>가입자</b>  ${escapeHtml(adminRecord.name)}`,
    `📞 <b>연락처</b>  ${escapeHtml(formatPhone(adminRecord.phone))}`,
    `📡 <b>가입상품</b>  ${escapeHtml(adminRecord.product)}`,
    `🏢 <b>가입구분</b>  ${escapeHtml(siteLabel)}`,
    `📍 <b>설치주소</b>  ${escapeHtml(adminRecord.address)}`,
    `📅 <b>설치희망일</b>  ${escapeHtml(adminRecord.installDate || '미지정')}`,
    `🕒 <b>접수시간</b>  ${escapeHtml(createdAt)}`,
    '',
    '🔒 신분증·계좌정보·전자서명은 Telegram에 전송하지 않았습니다.'
  ].join('\n');

  const [telegram, sheets] = await Promise.all([
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: telegramText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    }),
    fetch(SHEETS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(adminRecord),
      redirect: 'follow'
    })
  ]);

  const telegramResult = await telegram.json().catch(() => ({}));
  const sheetsResult = await sheets.json().catch(() => ({}));
  if (!telegram.ok || !telegramResult.ok) throw new Error('Telegram notification failed');
  if (!sheets.ok || !sheetsResult.success) throw new Error('Admin registration failed');
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
    if (input.action === 'attachPdf') {
      const applicationId = text(input.applicationId, 100);
      if (!applicationId || !validDataPdf(input.pdfData)) return send(res, 400, { success: false, message: 'PDF 파일을 확인해주세요.' }, origin);
      const upstream = await fetch(process.env.APPLICATION_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attachPdf', secret: process.env.APPLICATION_SECRET, applicationId, fileName: text(input.fileName, 180), pdfData: input.pdfData }),
        redirect: 'follow'
      });
      const result = await upstream.json().catch(() => ({}));
      if (!result.ok) throw new Error('PDF upload failed');
      return send(res, 200, { success: true }, origin);
    }
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
      paymentMethod: text(input.paymentMethod, 50),
      accountHolder: text(input.accountHolder, 60),
      bankName: text(input.bankName, 60),
      accountNumber: text(input.accountNumber, 80),
      holderRelation: text(input.holderRelation, 40),
      payerBirth: text(input.payerBirth, 20),
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

    try {
      await notifyTelegramAndAdmin(input, result.applicationId);
    } catch (notificationError) {
      console.error('application notification warning', notificationError && notificationError.message);
    }

    return send(res, 200, { success: true, applicationId: result.applicationId }, origin);
  } catch (error) {
    console.error('application submission failed', error && error.message);
    return send(res, 502, { success: false, message: '접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, origin);
  }
}
