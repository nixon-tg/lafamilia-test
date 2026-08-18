import { bot } from '../bot/src/bot.js';

export default async function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  const secret=process.env.SETUP_SECRET;
  if (!secret || req.query.secret!==secret) return res.status(401).json({ error:'Unauthorized' });
  const base=process.env.VERCEL_PROJECT_PRODUCTION_URL||req.headers.host;
  const protocol=req.headers['x-forwarded-proto']||'https';
  const webhook=`${protocol}://${base}/api/telegram`;
  await bot.api.setWebhook(webhook);
  await bot.api.setMyCommands([
    {command:'start',description:'Otwórz menu'},
    {command:'orders',description:'Moje zamówienia'},
    {command:'profile',description:'Mój profil'},
    {command:'help',description:'Pomoc'}
  ]);
  return res.status(200).json({ok:true,webhook});
}
