export async function postLike(id, action, nonce, apiBase = '/api') {
  const response = await fetch(`${apiBase}/likes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Nonce': nonce || '',
    },
    body: JSON.stringify({ id, action }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

export async function fetchLikes(ids, apiBase = '/api') {
  if (!ids || ids.length === 0) return { success: true, data: {} };
  const url = `${apiBase}/likes?ids=${ids.join(',')}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '获取失败');
  return data;
}