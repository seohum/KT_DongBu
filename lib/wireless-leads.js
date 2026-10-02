// The existing Sheets service persists message/type. Keep its schema intact.
export function wirelessLead(item) {
  if (String(item.type || item.product || '') !== '무선 상담') return null;
  const message = String(item.message || '');
  // Parse metadata only before the memo: customer notes may contain any labels.
  const memoStart = message.search(/(?:^| \/ )메모: /);
  const metadata = memoStart < 0 ? message : message.slice(0, memoStart);
  const fields = {};
  for (const part of metadata.split(' / ')) {
    const split = part.indexOf(': ');
    if (split >= 0) fields[part.slice(0, split)] = part.slice(split + 2);
  }
  if ((fields['상담 사이트'] || item.consultSite) !== '동구시장') return null;
  const memo = memoStart < 0 ? '' : message.slice(memoStart).replace(/^(?: \/ )?메모: /, '');
  return {
    id: String(item.id || ''),
    name: String(item.name || ''),
    phone: String(item.phone || ''),
    carrier: String(item.carrier || '미선택'),
    welfare: String(fields['복지할인'] || item.welfare || '해당없음'),
    plan: String(fields['기존 평균 요금'] || item.plan || ''),
    memo: memo || String(item.memo || ''),
    createdAt: String(item.createdAt || '')
  };
}
