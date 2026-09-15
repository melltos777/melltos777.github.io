const PRODUCT = {
  pro_monthly: {
    title: 'QuickList PRO',
    description: 'QuickList PRO на 30 дней: расширенный доступ к функциям сервиса.',
    stars: 50,
    periodSeconds: 30 * 24 * 60 * 60,
  },
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function validateInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) throw new Error('Telegram initData is missing');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) throw new Error('Telegram initData hash is missing');

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Math.floor(Date.now() / 1000) - authDate) > maxAgeSeconds) {
    throw new Error('Telegram initData expired');
  }

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const calculatedHash = bytesToHex(await hmacSha256(secretKey, dataCheckString));
  if (!timingSafeEqual(calculatedHash, receivedHash)) throw new Error('Invalid Telegram initData');

  const user = JSON.parse(params.get('user') || 'null');
  if (!user?.id) throw new Error('Telegram user is missing');

  return { user, startParam: params.get('start_param') || '' };
}

async function tgApi(env, method, body) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data.result;
}

async function upsertUser(env, user) {
  if (!env.DB) return;
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO users(telegram_id, username, first_name, last_name, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username=excluded.username,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      updated_at=excluded.updated_at
  `).bind(
    String(user.id), user.username || null, user.first_name || null,
    user.last_name || null, now, now
  ).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO entitlements(telegram_id, plan, expires_at, charge_id, updated_at)
    VALUES(?, 'FREE', NULL, NULL, ?)
  `).bind(String(user.id), now).run();
}

async function registerReferral(env, userId, startParam) {
  if (!env.DB || !startParam?.startsWith('ref_')) return;
  const referrerId = startParam.slice(4).trim();
  if (!referrerId || referrerId === String(userId) || !/^\d+$/.test(referrerId)) return;
  await env.DB.prepare(`INSERT OR IGNORE INTO referrals(referred_id, referrer_id, created_at) VALUES(?, ?, ?)`)
    .bind(String(userId), referrerId, Date.now()).run();
}

async function getEntitlement(env, userId) {
  if (!env.DB) return { plan: 'FREE', expires_at: null, referrals: 0 };
  const row = await env.DB.prepare('SELECT plan, expires_at FROM entitlements WHERE telegram_id=?')
    .bind(String(userId)).first();
  const pro = row?.plan === 'PRO' && Number(row?.expires_at || 0) > Date.now();
  const referrals = await env.DB.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrer_id=?')
    .bind(String(userId)).first();
  return { plan: pro ? 'PRO' : 'FREE', expires_at: pro ? Number(row.expires_at) : null, referrals: Number(referrals?.c || 0) };
}

async function handleCreateInvoice(request, env) {
  const body = await request.json().catch(() => ({}));
  const { user } = await validateInitData(body.initData, env.TELEGRAM_BOT_TOKEN);
  await upsertUser(env, user);

  const product = PRODUCT[body.product] || PRODUCT.pro_monthly;
  const payload = `pro_monthly:${user.id}:${crypto.randomUUID()}`;

  if (env.DB) {
    await env.DB.prepare(`INSERT INTO payments(payload, telegram_id, product, stars, status, created_at) VALUES(?, ?, ?, ?, 'pending', ?)`)
      .bind(payload, String(user.id), 'pro_monthly', product.stars, Date.now()).run();
  }

  const invoice = await tgApi(env, 'createInvoiceLink', {
    title: product.title,
    description: product.description,
    payload,
    currency: 'XTR',
    prices: [{ label: product.title, amount: product.stars }],
    subscription_period: product.periodSeconds,
  });
  return json({ ok: true, url: invoice });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ ok: true });
    const url = new URL(request.url);

    try {
      if (url.pathname === '/health') return json({ ok: true, service: 'quicklist-backend', time: Date.now() });

      if (url.pathname === '/me' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { user, startParam } = await validateInitData(body.initData, env.TELEGRAM_BOT_TOKEN);
        await upsertUser(env, user);
        await registerReferral(env, user.id, startParam);
        const ent = await getEntitlement(env, user.id);
        return json({ ok: true, user, ...ent, daily_limit: Number(env.FREE_DAILY_LIMIT || 5) });
      }

      if (url.pathname === '/create-invoice' && request.method === 'POST') {
        return handleCreateInvoice(request, env);
      }

      if (url.pathname === '/entitlement' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { user } = await validateInitData(body.initData, env.TELEGRAM_BOT_TOKEN);
        const ent = await getEntitlement(env, user.id);
        return json({ ok: true, ...ent });
      }

      if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
        const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
        const update = await request.json();

        if (update.pre_checkout_query) {
          await tgApi(env, 'answerPreCheckoutQuery', {
            pre_checkout_query_id: update.pre_checkout_query.id,
            ok: true,
          });
        }

        const pay = update.message?.successful_payment;
        if (pay) {
          const userId = update.message?.from?.id;
          const payload = pay.invoice_payload || '';
          const expiresAt = pay.subscription_expiration_date
            ? Number(pay.subscription_expiration_date) * 1000
            : Date.now() + 30 * 24 * 60 * 60 * 1000;

          if (env.DB && userId) {
            await env.DB.prepare(`UPDATE payments SET status='paid', charge_id=?, paid_at=? WHERE payload=?`)
              .bind(pay.telegram_payment_charge_id || '', Date.now(), payload).run();
            await env.DB.prepare(`
              INSERT INTO entitlements(telegram_id, plan, expires_at, charge_id, updated_at)
              VALUES(?, 'PRO', ?, ?, ?)
              ON CONFLICT(telegram_id) DO UPDATE SET
                plan='PRO', expires_at=excluded.expires_at, charge_id=excluded.charge_id, updated_at=excluded.updated_at
            `).bind(String(userId), expiresAt, pay.telegram_payment_charge_id || '', Date.now()).run();
          }
          await tgApi(env, 'sendMessage', {
            chat_id: userId,
            text: '⭐ QuickList PRO активирован. Спасибо за покупку!',
          });
        }

        if (update.message?.refunded_payment && env.DB) {
          const rp = update.message.refunded_payment;
          const userId = update.message?.from?.id;
          if (userId) {
            await env.DB.prepare(`UPDATE entitlements SET plan='FREE', expires_at=NULL, updated_at=? WHERE telegram_id=?`)
              .bind(Date.now(), String(userId)).run();
          }
          if (rp.invoice_payload) {
            await env.DB.prepare(`UPDATE payments SET status='refunded' WHERE payload=?`)
              .bind(rp.invoice_payload).run();
          }
        }

        return json({ ok: true });
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: String(err?.message || err) }, 400);
    }
  },
};
