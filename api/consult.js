const ALLOWED_TYPES = new Set([
  "상담 문의",
  "인터넷",
  "인터넷 + TV",
  "인터넷+TV",
  "기타 문의",
  "입주 특판 상담"
]);

export default async function handler(request, response) {
  const origin = request.headers.origin || "";
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://seohum.github.io";

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    return response.status(origin === allowedOrigin ? 204 : 403).end();
  }

  if (request.method !== "POST") {
    return response.status(405).json({ success: false, message: "지원하지 않는 요청입니다." });
  }

  if (origin !== allowedOrigin) {
    return response.status(403).json({ success: false, message: "허용되지 않은 요청입니다." });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return response.status(503).json({ success: false, message: "알림 서버 설정이 필요합니다." });
  }

  try {
    const body = request.body || {};
    const name = clean(body.name, 30);
    const phone = String(body.phone || "").replace(/\D/g, "");
    const type = clean(body.type || body.consultType, 40);
    const address = clean(body.address || body.area, 100);
    const carrier = clean(body.carrier, 30);
    const message = clean(body.message, 500);

    if (!name || !/^01\d{8,9}$/.test(phone) || !type || !address) {
      return response.status(400).json({ success: false, message: "입력 내용을 확인해주세요." });
    }

    if (!ALLOWED_TYPES.has(type) && type.length > 40) {
      return response.status(400).json({ success: false, message: "상담 유형을 확인해주세요." });
    }

    const time = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(new Date());

    const text = [
      "🔴 <b>KT동부법인지사 신규 상담</b>",
      "",
      `👤 <b>이름</b>  ${escapeHtml(name)}`,
      `📞 <b>연락처</b>  ${escapeHtml(formatPhone(phone))}`,
      `📡 <b>상담유형</b>  ${escapeHtml(type)}`,
      `📍 <b>설치주소</b>  ${escapeHtml(address)}`,
      `🔄 <b>현재 통신사</b>  ${escapeHtml(carrier || "미선택")}`,
      `💬 <b>문의사항</b>  ${escapeHtml(message || "없음")}`,
      `🕒 <b>접수시간</b>  ${escapeHtml(time)}`
    ].join("\n");

    const telegram = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      }
    );

    const result = await telegram.json();

    if (!telegram.ok || !result.ok) {
      console.error("Telegram API error", result);
      return response.status(502).json({ success: false, message: "알림 전송에 실패했습니다." });
    }

    return response.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ success: false, message: "상담 접수 중 오류가 발생했습니다." });
  }
}

function clean(value, maxLength) {
  return String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPhone(value) {
  return value.length === 11
    ? `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`
    : `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
}

