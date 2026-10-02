const $ = id => document.getElementById(id);
$('issueForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('issueButton').disabled = true; $('message').textContent = '권한을 확인하고 링크를 발급하는 중입니다…';
  try {
    const response = await fetch('https://kt-dong-bu.vercel.app/api/wireless-leads', {method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', signal:AbortSignal.timeout(25000), body:JSON.stringify({action:'issueLink', password:$('password').value.trim()})});
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || '링크를 발급하지 못했습니다.');
    const url = new URL(result.url);
    if (url.origin !== 'https://www.ktmns.store' || url.pathname !== '/wireless-admin.html' || !url.hash.startsWith('#access=')) throw new Error('링크 응답을 확인할 수 없습니다.');
    $('password').value = ''; $('setup').hidden = true; $('result').hidden = false;
    $('link').value = url.href; $('open').href = url.href;
    $('expires').textContent = '사용 기한: ' + new Date(result.expiresAt).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'});
    $('message').textContent = '';
  } catch (error) { $('message').textContent = error.name === 'TimeoutError' ? '응답이 지연됩니다. 잠시 후 다시 시도해주세요.' : error.message; }
  finally { $('issueButton').disabled = false; }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('link').value); $('message').textContent = '비밀 링크를 복사했습니다.'; }
  catch (_) { $('link').focus(); $('link').select(); $('message').textContent = '선택된 링크를 복사해주세요.'; }
});
