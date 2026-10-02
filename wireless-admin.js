const $ = id => document.getElementById(id);
const endpoint = 'https://kt-dong-bu.vercel.app/api/wireless-leads';
let password = '', items = [], generation = 0;
function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function phoneLabel(value) {
  const digits = value.replace(/\D/g, '');
  return /^01\d{8,9}$/.test(digits) ? digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') : value;
}
function render() {
  const query = $('search').value.trim().toLowerCase();
  const digits = query.replace(/\D/g, '');
  const filtered = items.filter(item => (!$('carrierFilter').value || item.carrier === $('carrierFilter').value) &&
    (!query || [item.name, item.phone, item.memo].some(v => v.toLowerCase().includes(query)) ||
      (digits && /^[\d\s+()-]+$/.test(query) && item.phone.replace(/\D/g, '').includes(digits))));
  $('total').replaceChildren(document.createTextNode(String(items.length)), element('small', '명'));
  $('count').textContent = filtered.length + '건';
  $('leads').replaceChildren();
  for (const item of filtered) {
    const card = element('article', '', 'lead');
    const top = element('div', '', 'lead-top'), identity = element('div', '');
    identity.append(element('h3', item.name));
    const phone = element('a', phoneLabel(item.phone), 'phone');
    const number = item.phone.replace(/\D/g, '');
    if (/^01\d{8,9}$/.test(number)) phone.href = 'tel:' + number;
    identity.append(phone); top.append(identity, element('span', item.carrier, 'carrier'));
    const details = element('dl', '');
    for (const [label, value] of [['복지할인',item.welfare],['기존 평균 요금',item.plan || '미입력']]) {
      const field = element('div', ''); field.append(element('dt', label), element('dd', value)); details.append(field);
    }
    card.append(top, details, element('p', '상담 메모', 'memo-label'), element('p', item.memo || '등록된 메모가 없습니다.', 'memo'), element('p', '등록시간 · ' + (item.createdAt || '기록 없음'), 'registered'));
    $('leads').append(card);
  }
  $('empty').hidden = filtered.length > 0;
  $('empty').textContent = items.length ? '검색 조건에 맞는 고객이 없습니다.' : '등록된 가망고객이 없습니다. 고객 등록 후 새로고침해주세요.';
}
async function load(candidate) {
  const current = ++generation;
  $('loginButton').disabled = $('refresh').disabled = true;
  $('message').textContent = '목록을 불러오는 중입니다…';
  try {
    const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:candidate}), cache:'no-store', signal:AbortSignal.timeout(25000)});
    const result = await response.json();
    if (current !== generation) return;
    if (!response.ok || !result.success || !Array.isArray(result.items)) {
      if (response.status === 401) logout();
      throw new Error(result.message || '목록을 불러오지 못했습니다.');
    }
    password = candidate; items = result.items;
    $('password').value = ''; $('login').hidden = true; $('dashboard').hidden = false;
    $('message').textContent = ''; $('updated').textContent = '최근 조회 ' + new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'});
    render();
  } catch (error) {
    if (current === generation || !password) $('message').textContent = error.name === 'TimeoutError' ? '응답이 지연되고 있습니다. 다시 시도해주세요.' : (error.message || '연결을 확인한 뒤 다시 시도해주세요.');
  } finally {
    if (current === generation || !password) $('loginButton').disabled = $('refresh').disabled = false;
  }
}
function logout() {
  generation++; password = ''; items = [];
  $('leads').replaceChildren(); $('password').value = ''; $('search').value = ''; $('carrierFilter').value = '';
  $('dashboard').hidden = true; $('login').hidden = false; $('message').textContent = '';
  $('loginButton').disabled = $('refresh').disabled = false; $('password').focus();
}
$('loginForm').addEventListener('submit', event => {event.preventDefault();load($('password').value.trim());});
$('refresh').addEventListener('click', () => load(password));
$('logout').addEventListener('click', logout);
$('search').addEventListener('input', render);
$('carrierFilter').addEventListener('change', render);
// Do not leave customer data in a restored back/forward page snapshot.
window.addEventListener('pagehide', logout);
