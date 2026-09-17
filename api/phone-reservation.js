const PHONE_PREORDER_CHAT_ID = "-5015981289";

export default async function handler(request, response) {
  const origin = request.headers.origin || "";
  const configuredOrigins = String(process.env.ALLOWED_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);
  const allowedOrigins = new Set(["https://www.ktmns.store", "https://ktmns.store", "https://seohum.github.io", ...configuredOrigins]);
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "https://www.ktmns.store";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") return response.status(allowedOrigins.has(origin) ? 204 : 403).end();
  if (request.method !== "POST") return response.status(405).json({success:false,message:"지원하지 않는 요청입니다."});
  if (!allowedOrigins.has(origin)) return response.status(403).json({success:false,message:"허용되지 않은 요청입니다."});
  if (!process.env.TELEGRAM_BOT_TOKEN) return response.status(503).json({success:false,message:"알림 서버 설정이 필요합니다."});
  try {
    const b = request.body || {};
    const seller = clean(b.seller,30), type = clean(b.type,20), name = clean(b.name,30);
    const birth = String(b.birth || "").replace(/\D/g,"").slice(0,8);
    const phone = String(b.phone || "").replace(/\D/g,"").slice(0,11);
    const carrier = clean(b.carrier,30), model = clean(b.model,60), color = clean(b.color,40), capacity = clean(b.capacity,30);
    if (!seller || !["신규","번호이동","기기변경"].includes(type) || !name || !/^\d{8}$/.test(birth) || !/^01\d{8,9}$/.test(phone) || !model || !color || !capacity || (type === "번호이동" && !carrier)) return response.status(400).json({success:false,message:"입력 내용을 확인해주세요."});
    const time = new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"medium"}).format(new Date());
    const lines = ["📱 <b>동부법인지사 신모델 사전예약</b>","",`👔 <b>판매자</b>  ${esc(seller)}`,`🔄 <b>가입유형</b>  ${esc(type)}`,`👤 <b>고객명</b>  ${esc(name)}`,`🎂 <b>생년월일</b>  ${esc(birth)}`,`📞 <b>전화번호</b>  ${esc(formatPhone(phone))}`];
    if (type === "번호이동") lines.push(`📡 <b>현재 통신사</b>  ${esc(carrier)}`);
    lines.push(`⭐ <b>예약 모델</b>  ${esc(model)}`,`🎨 <b>색상</b>  ${esc(color)}`,`💾 <b>용량</b>  ${esc(capacity)}`,`🕒 <b>접수시간</b>  ${esc(time)}`);
    const telegram = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:PHONE_PREORDER_CHAT_ID,text:lines.join("\n"),parse_mode:"HTML",disable_web_page_preview:true})});
    const result = await telegram.json();
    if (!telegram.ok || !result.ok) { console.error("Telegram API error", result); return response.status(502).json({success:false,message:"텔레그램 알림 전송에 실패했습니다."}); }
    return response.status(200).json({success:true});
  } catch (e) { console.error(e); return response.status(500).json({success:false,message:"사전예약 접수 중 오류가 발생했습니다."}); }
}
function clean(v,n){return String(v||"").trim().replace(/[\u0000-\u001f\u007f]/g," ").slice(0,n)}
function esc(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function formatPhone(v){return v.length===11?`${v.slice(0,3)}-${v.slice(3,7)}-${v.slice(7)}`:`${v.slice(0,3)}-${v.slice(3,6)}-${v.slice(6)}`}
