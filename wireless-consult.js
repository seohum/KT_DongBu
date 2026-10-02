const ids = ['consultSite','name','phone','carrier','welfare','plan','memo'];
const toast = document.getElementById('toast');
const button = document.getElementById('save');
let saved = false;
function msg(text, ok) {
  toast.textContent = text; toast.className = 'toast on ' + (ok ? 'ok' : 'err');
  window.scrollTo({top:0,behavior:'smooth'});
}
ids.forEach(id => document.getElementById(id).addEventListener('input', () => {
  if (saved) {saved = false; button.disabled = false; button.textContent = '상담 내용 저장';}
}));
button.onclick = async () => {
  const data = Object.fromEntries(ids.map(id => [id, document.getElementById(id).value.trim()]));
  if (data.consultSite !== '동구시장') return msg('상담 사이트를 선택해주세요.', false);
  if (!data.name || data.name.length > 30) return msg('고객명을 30자 이내로 입력해주세요.', false);
  if (!/^01\d{8,9}$/.test(data.phone.replace(/\D/g, ''))) return msg('올바른 휴대전화 번호를 입력해주세요.', false);
  if (data.plan.length > 40 || data.memo.length > 300) return msg('기존 평균 요금은 40자, 상담 메모는 300자 이내로 입력해주세요.', false);
  if (data.plan.includes(' / ')) return msg('기존 평균 요금은 금액으로 입력해주세요.', false);
  // These labelled fields survive the existing Sheets schema, including legacy records.
  const details = ['상담 사이트: 동구시장', '복지할인: ' + (data.welfare || '해당없음'), '기존 평균 요금: ' + (data.plan || '미입력'), '메모: ' + data.memo].join(' / ');
  button.disabled = true; button.textContent = '저장 중…';
  try {
    const response = await fetch('https://kt-dong-bu.vercel.app/api/consult', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({category:'상담신청',name:data.name,phone:data.phone,product:'무선 상담',carrier:data.carrier,message:details})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || '저장에 실패했습니다.');
    saved = true;
    msg('가망고객이 저장되었습니다. 관리 목록에서 확인할 수 있으며 담당자에게 알림을 전송했습니다.', true);
  } catch (error) {
    msg((error.message || '연결 오류가 발생했습니다.') + ' 재등록 전 관리 목록에서 저장 여부를 확인해주세요.', false);
  } finally {
    button.disabled = saved; button.textContent = saved ? '저장 완료 · 새 고객 입력 시 다시 저장' : '상담 내용 저장';
  }
};
