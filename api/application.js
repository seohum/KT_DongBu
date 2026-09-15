import { waitUntil } from '@vercel/functions';

const ALLOWED_ORIGINS = new Set([
  'https://seohum.github.io',
  'https://ktmns.store',
  'https://www.ktmns.store',
  'https://kt-dong-bu.vercel.app'
]);

const SHEETS_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxi7OLg1zqI9BZtxOHVg5tsL_mgU_hj0zRnYY1vC92U9OGrxiwVDW9_Q6oDAIlJssYz/exec';

export const maxDuration = 60;
export const config = {
  api: {
    bodyParser: { sizeLimit: '4mb' }
  }
};

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('NOTIFICATION_TIMEOUT')), ms); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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

function normalizeDataImage(value) {
  return String(value || '').trim().replace(/[\r\n\t ]+/g, '');
}

function validDataImage(value) {
  const normalized = normalizeDataImage(value);
  const match = /^data:image\/(?:jpeg|jpg|png|webp)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(normalized);
  return Boolean(match && match[1].length >= 16);
}
function validDataPdf(value) {
  return /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(String(value || ''));
}
function validDataDocument(value) {
  return validDataImage(value) || validDataPdf(value);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeKoreanMobile(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0082')) phone = phone.slice(2);
  if (phone.startsWith('82')) phone = '0' + phone.slice(2);
  if (phone.startsWith('10')) phone = '0' + phone;
  return phone;
}

function formatPhone(value) {
  const phone = normalizeKoreanMobile(value);
  return phone.length === 11 ? phone.slice(0,3) + '-' + phone.slice(3,7) + '-' + phone.slice(7) : phone;
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
  const customerType = text(input.customerType, 20) === '개인사업자' ? '개인사업자' : '개인';
  const businessName = customerType === '개인사업자' ? text(input.businessName, 120) : '';
  const businessNumber = customerType === '개인사업자' ? text(input.businessNumber, 30) : '';
  const representativeName = customerType === '개인사업자' ? text(input.representativeName, 60) : '';
  const customerName = customerType === '개인사업자' ? representativeName : text(input.customerName, 40);
  const isSamjeong = input.siteCode === 'samjeong-greencore-the-city' || siteLabel === '삼정그린코아 더 시티';
  const telegramChatId = isSamjeong ? '@ktmnsDB' : process.env.TELEGRAM_CHAT_ID;
  const adminRecord = {
    action: 'create',
    category: '가입신청',
    name: customerName,
    phone: normalizeKoreanMobile(input.phone),
    residentNumber: String(input.residentNumber || '').replace(/\D/g, '').slice(0, 13),
    product: text(input.product, 80),
    address: text(input.address, 250),
    carrier: text(input.currentCarrier, 50),
    apartment: siteLabel,
    unit: '',
    installDate: text(input.preferredInstallDate, 30),
    message: customerType === '개인사업자'
      ? `개인사업자: ${businessName} / ${businessNumber} / 대표자 ${representativeName} / 전자신청 접수번호: ${applicationId}`
      : `전자신청 접수번호: ${applicationId}`,
    status: '접수'
  };

  const productText = adminRecord.product;
  const isInternetTv = /(?:인터넷\s*\+\s*(?:TV|티비)|지니\s*TV)/i.test(productText);
  const wifiExcluded = /(?:와이파이|Wi-?Fi).*(?:미포함|제외|없음)|(?:미포함|제외|없음).*(?:와이파이|Wi-?Fi)/i.test(productText);
  const wifiIncluded = !wifiExcluded && /(?:와이파이|Wi-?Fi).*(?:포함|체크)|(?:포함|체크).*(?:와이파이|Wi-?Fi)/i.test(productText);
  const contract = productText.match(/(\d+\s*년\s*약정)/)?.[1]?.replace(/\s+/g, '') || '';
  const tvSettop = isInternetTv
    ? (productText.match(/(?:지니\s*TV\s*)?(셋톱박스\s*[A-Za-z0-9]+)/i)?.[1] || '')
    : '';
  const residentNumber = String(input.residentNumber || '').replace(/\D/g, '').slice(0, 13);
  const birthDigits = String(input.birthDate || '').replace(/\D/g, '');
  const notificationBirth = birthDigits.length === 8
    ? `${birthDigits.slice(0, 4)}-${birthDigits.slice(4, 6)}-${birthDigits.slice(6, 8)}`
    : residentNumber.slice(0, 6);
  const paymentMethod = text(input.paymentMethod, 50) === '지로' ? '지로' : '자동이체(은행)';
  const paymentSummary = paymentMethod === '지로' ? '지로' : [
    paymentMethod,
    text(input.bankName, 60) ? `은행명: ${text(input.bankName, 60)}` : '',
    text(input.accountNumber, 80) ? `계좌번호: ${text(input.accountNumber, 80)}` : ''
  ].filter(Boolean).join(' / ');

  const standardTelegramText = [
    '<b>■ 유선양식■</b>',
    '＊서류발송여부(sos114@ktmns.com) : N',
    '＊판매코드 :',
    '＊프론티어 이름 :',
    '＊공조(서포터) :',
    '',
    `- 고객유형 : ${escapeHtml(customerType)}`,
    `- 사업자명 : ${escapeHtml(businessName)}`,
    `- 사업자등록번호 : ${escapeHtml(businessNumber)}`,
    `- 대표자명 : ${escapeHtml(representativeName)}`,
    `- 고객명 : ${escapeHtml(adminRecord.name)}`,
    `- 주민번호 : ${escapeHtml(notificationBirth)}`,
    `- 고객번호 : ${escapeHtml(formatPhone(adminRecord.phone))}`,
    '- 건물코드 :',
    `- 설치주소 : ${escapeHtml(adminRecord.address)}`,
    `- 납부방법 : ${escapeHtml(paymentSummary)}`,
    '  ＊가입유형 : 신규가입',
    `  ＊상품 : ${escapeHtml(productText)}`,
    '',
    `* 약정 : ${escapeHtml(contract || '3년')}`,
    `* WIFI여부 : ${wifiIncluded ? 'Y' : 'N'}`,
    `* TV셋탑 : ${escapeHtml(tvSettop)}`,
    '* 일반전화 :',
    '* 센트릭스 :',
    '* P/S 희망번호 :',
    `  ＊가설날짜 : ${escapeHtml(adminRecord.installDate || '')}`,
    `  ＊결 합 : ${isInternetTv ? '인터넷+TV' : ''}`,
    `  ＊특이사항 : ${escapeHtml(siteLabel)} / 접수번호 ${escapeHtml(applicationId)}`,
    '',
    `연락처 : ${escapeHtml(formatPhone(adminRecord.phone))}`,
    `접수시간 : ${escapeHtml(createdAt)}`
  ].join('\n');

  const samjeongTelegramText = [
    '<b>■ 유선양식■</b>',
    '＊서류발송여부(sos114@ktmns.com) : N',
    '＊판매코드 :',
    '＊프론티어 이름 :',
    '＊공조(서포터) :',
    '',
    `- 사업자명 : ${escapeHtml(businessName)}`,
    `- 사업자등록번호 : ${escapeHtml(businessNumber)}`,
    `- 고객명 : ${escapeHtml(adminRecord.name)}`,
    `- 주민번호 : ${escapeHtml(notificationBirth)}`,
    `- 고객번호 : ${escapeHtml(formatPhone(adminRecord.phone))}`,
    '- 건물코드 : B0002836953',
    `- 설치주소 : ${escapeHtml(adminRecord.address)}`,
    `- 자동이체(납부일) : ${escapeHtml(paymentSummary)}`,
    `- E-MAIL : ${escapeHtml(text(input.email, 120))}`,
    '＊가입유형 : 신규가입',
    `＊상품 : ${escapeHtml(productText)}`,
    ` * 약정 : ${escapeHtml(contract || '3년')}`,
    ` * WIFI여부 : ${wifiIncluded ? 'Y' : 'N'}`,
    ` * TV셋탑 : ${escapeHtml(tvSettop)}`,
    ' * 일반전화 :',
    ' * 센트릭스 :',
    ' * P/S 희망번호 :',
    `＊가설날짜 : ${escapeHtml(adminRecord.installDate || '')}`,
    `＊결 합 : ${isInternetTv ? '인터넷+TV' : ''}`,
    `＊특이사항 : ${escapeHtml(siteLabel)} / 접수번호 ${escapeHtml(applicationId)}`
  ].join('\n');
  const telegramText = isSamjeong ? samjeongTelegramText : standardTelegramText;

  const [telegram, sheets] = await Promise.all([
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
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
    if (input.action === 'getApplicationFiles') {
      const password = text(input.password, 200);
      const applicationId = text(input.applicationId, 100);
      if (!password || !applicationId) return send(res, 400, { success: false, message: '접수번호와 관리자 인증을 확인해주세요.' }, origin);
      const [auth, upstream] = await Promise.all([
        fetch(SHEETS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'list', password }), redirect: 'follow' }),
        fetch(process.env.APPLICATION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getApplicationFiles', secret: process.env.APPLICATION_SECRET, applicationId }), redirect: 'follow' })
      ]);
      const [authResult, result] = await Promise.all([
        auth.json().catch(() => ({})),
        upstream.json().catch(() => ({}))
      ]);
      if (!auth.ok || !authResult.success) return send(res, 401, { success: false, message: '관리자 비밀번호가 올바르지 않습니다.' }, origin);
      if (!upstream.ok || !result.ok) return send(res, 404, { success: false, message: '저장된 신청 파일을 찾지 못했습니다.' }, origin);
      return send(res, 200, { success: true, files: { folderUrl: result.folderUrl || '', pdfUrl: result.pdfUrl || '', idFrontUrl: result.idFrontUrl || '', idBackUrl: result.idBackUrl || '', businessLicenseUrl: result.businessLicenseUrl || '' } }, origin);
    }
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
    const residentNumber = String(input.residentNumber || '').replace(/\D/g, '').slice(0, 13);
    const paymentMethod = text(input.paymentMethod, 50) === '지로' ? '지로' : '자동이체(은행)';
    const customerType = text(input.customerType, 20) === '개인사업자' ? '개인사업자' : '개인';
    const effectiveCustomerName = customerType === '개인사업자' ? text(input.representativeName, 60) : text(input.customerName, 40);
    const requiredText = ['phone', 'address', 'product', 'idType'];
    if (residentNumber.length !== 13) return send(res, 400, { success: false, message: '주민등록번호를 확인해주세요.' }, origin);
    if (!effectiveCustomerName || requiredText.some(key => !text(input[key], 300))) {
      return send(res, 400, { success: false, message: '필수 입력 내용을 확인해주세요.' }, origin);
    }
    if (paymentMethod === '자동이체(은행)' && ['accountHolder', 'bankName', 'accountNumber', 'payerBirth'].some(key => !text(input[key], 100))) {
      return send(res, 400, { success: false, message: '자동이체 계좌정보를 확인해주세요.' }, origin);
    }
    if (customerType === '개인사업자') {
      if (['businessName', 'businessNumber', 'representativeName'].some(key => !text(input[key], 120))) {
        return send(res, 400, { success: false, message: '개인사업자 필수정보를 확인해주세요.' }, origin);
      }
      if (String(input.businessNumber || '').replace(/\D/g, '').length !== 10) {
        return send(res, 400, { success: false, message: '사업자등록번호 10자리를 확인해주세요.' }, origin);
      }
      if (!validDataDocument(input.businessLicense)) {
        return send(res, 400, { success: false, message: '사업자등록증 파일을 확인해주세요.' }, origin);
      }
    }
    const idFrontData = normalizeDataImage(input.idFront);
    const signatureData = normalizeDataImage(input.signature);
    if (!validDataImage(idFrontData)) {
      return send(res, 400, { success: false, message: '신분증 사진을 다시 선택해주세요.' }, origin);
    }
    if (!validDataImage(signatureData)) {
      return send(res, 400, { success: false, message: '서명을 다시 작성해주세요.' }, origin);
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
      customerType,
      customerName: effectiveCustomerName,
      businessName: customerType === '개인사업자' ? text(input.businessName, 120) : '',
      businessNumber: customerType === '개인사업자' ? text(input.businessNumber, 30) : '',
      representativeName: customerType === '개인사업자' ? text(input.representativeName, 60) : '',
      birthDate: text(input.birthDate, 8),
      residentNumber,
      gender: text(input.gender, 10),
      phone: text(input.phone, 30),
      address: text(input.address, 250),
      email: text(input.email, 120),
      currentCarrier: text(input.currentCarrier, 50),
      billingMethod: text(input.billingMethod, 50),
      paymentMethod,
      accountHolder: paymentMethod === '지로' ? '' : text(input.accountHolder, 60),
      bankName: paymentMethod === '지로' ? '' : text(input.bankName, 60),
      accountNumber: paymentMethod === '지로' ? '' : text(input.accountNumber, 80),
      holderRelation: paymentMethod === '지로' ? '' : text(input.holderRelation, 40),
      payerBirth: paymentMethod === '지로' ? '' : text(input.payerBirth, 20),
      idType: text(input.idType, 40),
      consents: input.consents,
      idFront: idFrontData,
      idBack: input.idBack ? normalizeDataImage(input.idBack) : '',
      businessLicense: customerType === '개인사업자' ? input.businessLicense : '',
      signature: signatureData
    };

    const upstream = await fetch(process.env.APPLICATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const result = await upstream.json().catch(() => ({}));
    if (!result.ok) throw new Error('Apps Script rejected the submission');

    waitUntil(
      withTimeout(notifyTelegramAndAdmin(input, result.applicationId), 8000)
        .catch(notificationError => {
          console.error('application notification warning', notificationError && notificationError.message);
        })
    );

    return send(res, 200, { success: true, applicationId: result.applicationId }, origin);
  } catch (error) {
    console.error('application submission failed', error && error.message);
    return send(res, 502, { success: false, message: '접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, origin);
  }
}
