import crypto from 'node:crypto';

export function getTelegramUser(initData) {
  if (!initData) throw new Error('Missing Telegram initData');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !authDate) throw new Error('Invalid Telegram initData');
  if (Math.abs(Date.now() / 1000 - authDate) > 86400) throw new Error('Expired Telegram initData');

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest();
  const expected = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (hash.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) {
    throw new Error('Invalid Telegram signature');
  }

  return JSON.parse(params.get('user') || '{}');
}
