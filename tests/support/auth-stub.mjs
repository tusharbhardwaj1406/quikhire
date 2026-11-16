// TEST HARNESS ONLY. A minimal stand-in for the Supabase Auth HTTP API so the real application code
// (forms → supabase-js → cookies → proxy → role routing → database) can be exercised end-to-end on a
// machine with no access to Supabase. It is never deployed and is not part of the product.
import http from 'node:http';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const SECRET = 'test-jwt-secret-not-for-production';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const jwt = (u) => { const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600, session_id: u.id })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`; };
const verify = (t) => { const [h, p, s] = (t ?? '').split('.'); if (!s) return null;
  const ok = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') === s;
  const c = ok ? JSON.parse(Buffer.from(p, 'base64url').toString()) : null; return c && c.exp > Date.now() / 1000 ? c : null; };
const hash = (pw, salt = randomBytes(8).toString('hex')) => `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
const check = (pw, stored) => { const [salt, h] = (stored ?? ':').split(':'); const a = Buffer.from(h, 'hex'), b = scryptSync(pw, salt, 32); return a.length === b.length && timingSafeEqual(a, b); };
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at, confirmed_at: u.created_at,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.raw_user_meta_data, identities: [], created_at: u.created_at, updated_at: u.created_at });
const refresh = new Map();
const session = (u) => { const rt = randomBytes(12).toString('hex'); refresh.set(rt, u.id);
  return { access_token: jwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt, user: userJson(u) }; };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const path = url.pathname.replace(/^\/auth\/v1/, '');
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (path === '/signup' && req.method === 'POST') {
      const [exists] = await sql`select 1 from auth.users where email = ${body.email}`;
      if (exists) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const [u] = await sql`insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at) values (${body.email}, ${hash(body.password)}, ${sql.json(body.data ?? {})}, now()) returning *`;
      return send(200, session(u));
    }
    if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
      const [u] = await sql`select * from auth.users where email = ${body.email}`;
      if (!u || !check(body.password, u.encrypted_password)) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return send(200, session(u));
    }
    if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const [u] = await sql`select * from auth.users where id = ${refresh.get(body.refresh_token) ?? null}`;
      return u ? send(200, session(u)) : send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    if (path === '/user' && req.method === 'GET') {
      const claims = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
      const [u] = claims ? await sql`select * from auth.users where id = ${claims.sub}` : [];
      return u ? send(200, userJson(u)) : send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    }
    if (path === '/logout') { res.writeHead(204); return res.end(); }
    return send(200, {});
  } catch (e) { console.error(e); send(500, { msg: String(e) }); }
}).listen(54321, '127.0.0.1', () => console.log('auth stub on :54321'));
