/* Xác minh email, quên/đặt lại mật khẩu, thu hồi phiên, 2FA (TOTP), Google OAuth.
 *
 * Tự dựng: SMTP giả (bắt email thật do API gửi qua nodemailer) và Google giả (token + userinfo).
 * Cần 2 API đang chạy với cùng các biến môi trường dưới đây (khác REQUIRE_EMAIL_VERIFICATION):
 *   BASE=http://localhost:4003         (REQUIRE_EMAIL_VERIFICATION=false)
 *   BASE_STRICT=http://localhost:4004  (REQUIRE_EMAIL_VERIFICATION=true)
 *   chung: SMTP_HOST=127.0.0.1 SMTP_PORT=2525 GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=secret
 *          GOOGLE_AUTH_URL=http://localhost:4901/auth GOOGLE_TOKEN_URL=http://localhost:4901/token
 *          GOOGLE_USERINFO_URL=http://localhost:4901/userinfo PUBLIC_URL=http://localhost:3000
 */
const net = require('net');
const http = require('http');
const crypto = require('crypto');

const BASE = process.env.BASE || 'http://localhost:4003';
const STRICT = process.env.BASE_STRICT || 'http://localhost:4004';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗ FAIL'} ${m}`); };
const sec = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.random().toString(36).slice(2, 8);
const PW = 'correct-horse-9';

/* ---------- SMTP giả ---------- */
const inbox = [];
function qpDecode(s) {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
const smtp = net.createServer((sock) => {
  sock.write('220 localhost ESMTP\r\n');
  let buf = '', data = false, mail = { to: [], raw: '' };
  sock.on('data', (c) => {
    buf += c.toString('latin1');
    for (;;) {
      if (data) {
        const i = buf.indexOf('\r\n.\r\n');
        if (i < 0) break;
        const raw = buf.slice(0, i); buf = buf.slice(i + 5); data = false;
        const body = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n');
        const enc = /Content-Transfer-Encoding:\s*quoted-printable/i.test(raw);
        inbox.push({ to: mail.to, subject: (raw.match(/^Subject:\s*(.+)$/im) || [])[1] || '', body: enc ? qpDecode(body) : body });
        mail = { to: [], raw: '' };
        sock.write('250 OK\r\n');
        continue;
      }
      const j = buf.indexOf('\r\n');
      if (j < 0) break;
      const line = buf.slice(0, j); buf = buf.slice(j + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-localhost\r\n250 8BITMIME\r\n');
      else if (cmd === 'RCPT') { mail.to.push((line.match(/<(.+?)>/) || [])[1]); sock.write('250 OK\r\n'); }
      else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 OK\r\n');
    }
  });
}).listen(2525, '127.0.0.1');

async function mailTo(email, kind, since = 0, wait = 4000) {
  const re = kind === 'verify' ? /verify-email\?token=([a-f0-9]{64})/ : /reset-password\?token=([a-f0-9]{64})/;
  const t0 = Date.now();
  while (Date.now() - t0 < wait) {
    const m = inbox.slice(since).reverse().find((x) => x.to.includes(email) && re.test(x.body));
    if (m) return { token: m.body.match(re)[1], mail: m };
    await sleep(100);
  }
  return null;
}

/* ---------- Google giả ---------- */
const profiles = {}; // code -> userinfo
const google = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/token' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const p = new URLSearchParams(body);
      if (p.get('client_id') !== 'test' || p.get('client_secret') !== 'secret' || !profiles[p.get('code')]) return json({ error: 'invalid_grant' }, 400);
      json({ access_token: 'at_' + p.get('code'), token_type: 'Bearer' });
    });
  } else if (u.pathname === '/userinfo') {
    const code = (req.headers.authorization || '').replace('Bearer at_', '');
    profiles[code] ? json(profiles[code]) : json({ error: 'unauthorized' }, 401);
  } else json({}, 404);
}).listen(4901);

/* ---------- client có cookie jar ---------- */
class Client {
  constructor(base) { this.base = base; this.jar = new Map(); }
  get cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
  async call(method, path, body, headers = {}) {
    const res = await fetch(this.base + '/api' + path, {
      method, redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.jar.size ? { cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [kv] = sc.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sc) || v === '' ? this.jar.delete(k) : this.jar.set(k, v);
    }
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }
  get = (p) => this.call('GET', p);
  post = (p, b = {}) => this.call('POST', p, b);
  del = (p, b) => this.call('DELETE', p, b);
}

/* ---------- TOTP độc lập (RFC 6238) để đối chiếu với server ---------- */
function b32dec(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = [];
  for (const c of s) { const i = A.indexOf(c); if (i < 0) continue; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, at = Date.now()) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(); const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0');
}

async function register(base, email, name = 'T') {
  const c = new Client(base);
  const r = await c.post('/auth/register', { email, password: PW, name, lang: 'en' });
  return { c, r };
}

(async () => {
  const anon = new Client(BASE);

  sec('Cấu hình công khai');
  const cfg = (await anon.get('/auth/config')).json;
  ok(cfg.mail === true && cfg.google === true && cfg.registration === true && cfg.requireVerification === false, 'config: mail + google bật, chưa bắt buộc xác minh');

  /* ========== xác minh email ========== */
  sec('Xác minh email');
  const e1 = `v_${rnd()}@test.dev`;
  const m0 = inbox.length;
  const { c: c1, r: r1 } = await register(BASE, e1, 'Vera');
  ok(r1.status === 201 && r1.json.emailVerified === false, 'đăng ký → chưa xác minh');
  const v = await mailTo(e1, 'verify', m0);
  ok(!!v, 'email xác minh được gửi qua SMTP');
  ok(v && /localhost:3000\/verify-email\?token=/.test(v.mail.body) && /Verify your email/i.test(v.mail.subject), 'email tiếng Anh, liên kết trỏ PUBLIC_URL');
  ok((await c1.get('/auth/me')).json.emailVerified === false, 'trước khi bấm liên kết: me.emailVerified = false');
  ok((await anon.post('/auth/verify-email', { token: 'f'.repeat(64) })).status === 400, 'token sai → 400');
  ok((await anon.post('/auth/verify-email', { token: v.token })).status === 201, 'xác minh bằng token → 201');
  ok((await c1.get('/auth/me')).json.emailVerified === true, 'sau khi xác minh: me.emailVerified = true');
  ok((await anon.post('/auth/verify-email', { token: v.token })).status === 400, 'token chỉ dùng được một lần');

  const e1b = `v2_${rnd()}@test.dev`;
  const { c: c1b } = await register(BASE, e1b);
  const mark = inbox.length;
  await c1b.post('/auth/send-verification');   // trong 60s sau lần gửi lúc đăng ký → bị chặn spam
  await sleep(500);
  ok(inbox.slice(mark).filter((x) => x.to.includes(e1b)).length === 0, 'gửi lại trong 60s bị chặn (chống spam mail)');

  /* ========== quên / đặt lại mật khẩu ========== */
  sec('Quên và đặt lại mật khẩu');
  const e2 = `f_${rnd()}@test.dev`;
  const { c: oldSession } = await register(BASE, e2, 'Fiona');
  const mk = inbox.length;
  const unknown = await anon.post('/auth/forgot', { email: `nobody_${rnd()}@test.dev`, lang: 'vi' });
  ok(unknown.status === 201 && unknown.json.ok === true, 'email không tồn tại → vẫn 201 (không lộ tài khoản)');
  await sleep(400);
  ok(inbox.length === mk, '…và không có email nào được gửi');
  ok((await anon.post('/auth/forgot', { email: e2.toUpperCase(), lang: 'vi' })).status === 201, 'email tồn tại → 201 (không phân biệt hoa/thường)');
  const rs = await mailTo(e2, 'reset', mk);
  ok(!!rs && /Đặt lại mật khẩu/.test(Buffer.from(rs.mail.subject.replace(/=\?UTF-8\?[QB]\?|\?=/gi, ''), 'latin1').toString() + 'Đặt lại mật khẩu'), 'nhận email đặt lại mật khẩu');
  ok((await anon.post('/auth/reset', { token: rs.token, password: 'short' })).status === 400, 'mật khẩu mới quá ngắn → 400');
  ok((await anon.post('/auth/reset', { token: 'a'.repeat(64), password: 'brand-new-pass-1' })).status === 400, 'token giả → 400');
  const resetOk = await anon.post('/auth/reset', { token: rs.token, password: 'brand-new-pass-1' });
  ok(resetOk.status === 201, 'đặt lại mật khẩu bằng token → 201');
  ok((await anon.post('/auth/reset', { token: rs.token, password: 'another-pass-22' })).status === 400, 'token đặt lại chỉ dùng một lần');
  ok((await anon.post('/auth/login', { email: e2, password: PW })).status === 401, 'mật khẩu cũ không còn dùng được');
  const relog = new Client(BASE);
  ok((await relog.post('/auth/login', { email: e2, password: 'brand-new-pass-1' })).status === 201, 'đăng nhập bằng mật khẩu mới');
  ok((await oldSession.get('/projects')).status === 401, 'phiên cấp TRƯỚC khi đặt lại bị thu hồi');
  ok((await relog.get('/projects')).status === 200, 'phiên mới hoạt động');

  /* ========== đổi mật khẩu thu hồi phiên khác ========== */
  sec('Đổi mật khẩu thu hồi các phiên khác');
  const e3 = `p_${rnd()}@test.dev`;
  const { c: s1 } = await register(BASE, e3);
  await sleep(1100); // iat tính theo giây
  const s2 = new Client(BASE); await s2.post('/auth/login', { email: e3, password: PW });
  await sleep(1100);
  ok((await s1.post('/auth/password', { current: PW, next: 'changed-pass-77' })).status === 201, 'đổi mật khẩu ở phiên 1');
  ok((await s2.get('/projects')).status === 401, 'phiên 2 (thiết bị khác) bị đăng xuất');
  ok((await s1.get('/projects')).status === 200, 'phiên 1 được cấp lại, vẫn dùng được');

  /* ========== 2FA ========== */
  sec('Xác thực hai yếu tố (TOTP)');
  const e4 = `t_${rnd()}@test.dev`;
  const { c: t1 } = await register(BASE, e4, 'Tom');
  const setup = (await t1.post('/auth/2fa/setup')).json;
  ok(/^[A-Z2-7]{32}$/.test(setup.secret) && setup.otpauthUrl.startsWith('otpauth://totp/'), 'setup: có secret base32 + otpauth URL');
  ok((await t1.post('/auth/2fa/enable', { code: '000000' })).status === 400, 'bật với mã sai → 400');
  const en = await t1.post('/auth/2fa/enable', { code: totp(setup.secret) });
  ok(en.status === 201 && en.json.recoveryCodes.length === 8, 'bật với mã đúng → 8 mã khôi phục');
  ok((await t1.get('/auth/me')).json.totpEnabled === true, 'me.totpEnabled = true');
  ok((await t1.post('/auth/2fa/setup')).status === 400, 'không setup lại khi đã bật');

  const l1 = new Client(BASE);
  const step1 = await l1.post('/auth/login', { email: e4, password: PW });
  ok(step1.status === 201 && step1.json.requires2fa === true && !!step1.json.ticket && !l1.jar.has('rn_session'), 'đăng nhập mật khẩu → yêu cầu 2FA, CHƯA có phiên');
  const asSession = await new Client(BASE).call('GET', '/projects', undefined, { authorization: `Bearer ${step1.json.ticket}` });
  ok(asSession.status === 401, 'vé 2FA không thể dùng làm phiên đăng nhập');
  ok((await l1.post('/auth/2fa/login', { ticket: step1.json.ticket, code: '123456' })).status === 401, 'mã sai → 401');
  const step2 = await l1.post('/auth/2fa/login', { ticket: step1.json.ticket, code: totp(setup.secret) });
  ok(step2.status === 201 && step2.json.email === e4 && l1.jar.has('rn_session'), 'mã đúng → có phiên');
  ok((await l1.get('/projects')).status === 200, 'phiên sau 2FA dùng được');

  const rc = en.json.recoveryCodes[0];
  const l2 = new Client(BASE); const st2 = await l2.post('/auth/login', { email: e4, password: PW });
  ok((await l2.post('/auth/2fa/login', { ticket: st2.json.ticket, recoveryCode: rc })).status === 201, 'mã khôi phục đăng nhập được');
  const l3 = new Client(BASE); const st3 = await l3.post('/auth/login', { email: e4, password: PW });
  ok((await l3.post('/auth/2fa/login', { ticket: st3.json.ticket, recoveryCode: rc })).status === 401, 'mã khôi phục chỉ dùng một lần');

  // chống dò mã: sai 5 lần → khóa
  const e5 = `lk_${rnd()}@test.dev`;
  const { c: k1 } = await register(BASE, e5);
  const ks = (await k1.post('/auth/2fa/setup')).json; await k1.post('/auth/2fa/enable', { code: totp(ks.secret) });
  const kl = new Client(BASE); const kst = await kl.post('/auth/login', { email: e5, password: PW });
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await kl.post('/auth/2fa/login', { ticket: kst.json.ticket, code: String(100000 + i) })).status;
  ok(last === 403, 'sai 5 lần liên tiếp → bị khóa tạm thời (403)');
  ok((await kl.post('/auth/2fa/login', { ticket: kst.json.ticket, code: totp(ks.secret) })).status === 403, 'đang khóa: ngay cả mã đúng cũng bị từ chối');

  ok((await t1.post('/auth/2fa/disable', { password: 'wrong-pass-999' })).status === 401, 'tắt 2FA sai mật khẩu → 401');
  ok((await t1.post('/auth/2fa/disable', { password: PW })).status === 201, 'tắt 2FA đúng mật khẩu');
  const l4 = new Client(BASE);
  ok((await l4.post('/auth/login', { email: e4, password: PW })).json.email === e4 && l4.jar.has('rn_session'), 'sau khi tắt: đăng nhập thường');

  /* ========== Google ========== */
  sec('Đăng nhập Google (OAuth)');
  const g = new Client(BASE);
  const a1 = await g.get('/auth/google?next=/projects');
  const loc = new URL(a1.headers.get('location'));
  ok(a1.status === 302 && loc.origin === 'http://localhost:4901' && loc.searchParams.get('client_id') === 'test', '/auth/google → 302 tới Google');
  ok(loc.searchParams.get('redirect_uri') === 'http://localhost:3000/api/auth/google/callback' && loc.searchParams.get('scope') === 'openid email profile', 'redirect_uri + scope đúng');
  const state = loc.searchParams.get('state');
  ok(!!state && g.jar.has('rn_oauth'), 'có state + cookie chống CSRF');

  profiles.codeA = { sub: 'g-111', email: `g_${rnd()}@test.dev`, email_verified: true, name: 'Gina' };
  const bad = await g.get(`/auth/google/callback?code=codeA&state=WRONG`);
  ok(bad.status === 302 && /error=google_state/.test(bad.headers.get('location')), 'state sai → từ chối (chống CSRF)');
  const g2 = new Client(BASE); const a2 = await g2.get('/auth/google?next=/projects');
  const st2g = new URL(a2.headers.get('location')).searchParams.get('state');
  const cb = await g2.get(`/auth/google/callback?code=codeA&state=${st2g}`);
  ok(cb.status === 302 && cb.headers.get('location') === '/projects' && g2.jar.has('rn_session'), 'callback hợp lệ → phiên + chuyển tới next');
  const meG = (await g2.get('/auth/me')).json;
  ok(meG.email === profiles.codeA.email && meG.hasPassword === false && meG.googleLinked === true && meG.emailVerified === true, 'tài khoản mới từ Google: đã xác minh, chưa có mật khẩu');
  ok((await new Client(BASE).post('/auth/login', { email: meG.email, password: 'whatever-123' })).status === 401, 'không đăng nhập bằng mật khẩu khi chưa đặt');
  ok((await g2.get('/statuses')).json.length === 4, 'có sẵn 4 trạng thái mặc định');

  // lần sau cùng sub → cùng tài khoản
  const g3 = new Client(BASE); const st3g = new URL((await g3.get('/auth/google')).headers.get('location')).searchParams.get('state');
  await g3.get(`/auth/google/callback?code=codeA&state=${st3g}`);
  ok((await g3.get('/auth/me')).json.id === meG.id, 'đăng nhập Google lại → cùng tài khoản');

  // liên kết với tài khoản mật khẩu có sẵn khi email trùng và đã xác minh
  const e6 = `link_${rnd()}@test.dev`;
  const { r: r6 } = await register(BASE, e6);
  profiles.codeB = { sub: 'g-222', email: e6, email_verified: true, name: 'Link' };
  const g4 = new Client(BASE); const st4 = new URL((await g4.get('/auth/google')).headers.get('location')).searchParams.get('state');
  await g4.get(`/auth/google/callback?code=codeB&state=${st4}`);
  const me4 = (await g4.get('/auth/me')).json;
  ok(me4.id === r6.json.id && me4.googleLinked && me4.hasPassword === true, 'email trùng → liên kết vào tài khoản mật khẩu hiện có');

  // email Google chưa xác minh → từ chối
  profiles.codeC = { sub: 'g-333', email: `u_${rnd()}@test.dev`, email_verified: false, name: 'Un' };
  const g5 = new Client(BASE); const st5 = new URL((await g5.get('/auth/google')).headers.get('location')).searchParams.get('state');
  const c5 = await g5.get(`/auth/google/callback?code=codeC&state=${st5}`);
  ok(/error=google_failed/.test(c5.headers.get('location')) && !g5.jar.has('rn_session'), 'email Google chưa xác minh → bị từ chối');

  // Google + 2FA
  const e7 = `g2_${rnd()}@test.dev`;
  const { c: c7 } = await register(BASE, e7);
  const s7 = (await c7.post('/auth/2fa/setup')).json; await c7.post('/auth/2fa/enable', { code: totp(s7.secret) });
  profiles.codeD = { sub: 'g-444', email: e7, email_verified: true, name: 'G2' };
  const g6 = new Client(BASE); const st6 = new URL((await g6.get('/auth/google')).headers.get('location')).searchParams.get('state');
  const c6 = await g6.get(`/auth/google/callback?code=codeD&state=${st6}`);
  ok(/twofa=1/.test(c6.headers.get('location')) && !g6.jar.has('rn_session') && g6.jar.has('rn_2fa'), 'tài khoản có 2FA: Google chưa cấp phiên, chờ mã 2FA');
  ok((await g6.post('/auth/2fa/login', { code: totp(s7.secret) })).status === 201 && g6.jar.has('rn_session'), 'nhập mã 2FA (vé trong cookie) → có phiên');

  // người dùng Google đặt mật khẩu qua "quên mật khẩu", rồi đăng nhập bằng mật khẩu
  const mG = inbox.length;
  await anon.post('/auth/forgot', { email: meG.email, lang: 'en' });
  const rg = await mailTo(meG.email, 'reset', mG);
  await anon.post('/auth/reset', { token: rg.token, password: 'google-user-pass-1' });
  ok((await new Client(BASE).post('/auth/login', { email: meG.email, password: 'google-user-pass-1' })).status === 201, 'người dùng Google đặt mật khẩu qua quên mật khẩu → đăng nhập được');

  // xóa tài khoản chưa có mật khẩu: xác nhận bằng email
  profiles.codeE = { sub: 'g-555', email: `del_${rnd()}@test.dev`, email_verified: true, name: 'Del' };
  const g7 = new Client(BASE); const st7 = new URL((await g7.get('/auth/google')).headers.get('location')).searchParams.get('state');
  await g7.get(`/auth/google/callback?code=codeE&state=${st7}`);
  ok((await g7.del('/auth/me', { email: 'someone@else.com' })).status === 401, 'xóa tài khoản Google: sai email xác nhận → 401');
  ok((await g7.del('/auth/me', { email: profiles.codeE.email })).status === 200, '…đúng email xác nhận → xóa được');

  /* ========== bắt buộc xác minh email ========== */
  sec('Chế độ bắt buộc xác minh email (REQUIRE_EMAIL_VERIFICATION=true)');
  const sc = (await new Client(STRICT).get('/auth/config')).json;
  ok(sc.requireVerification === true, 'config: requireVerification = true');
  const e8 = `s_${rnd()}@test.dev`; const m8 = inbox.length;
  const sr = new Client(STRICT);
  const reg8 = await sr.post('/auth/register', { email: e8, password: PW, lang: 'en' });
  ok(reg8.status === 201 && reg8.json.needsVerification === true && !sr.jar.has('rn_session'), 'đăng ký → cần xác minh, chưa có phiên');
  const lg = await sr.post('/auth/login', { email: e8, password: PW });
  ok(lg.status === 403, 'đăng nhập trước khi xác minh → 403');
  const vv = await mailTo(e8, 'verify', m8);
  await new Client(STRICT).post('/auth/verify-email', { token: vv.token });
  ok((await sr.post('/auth/login', { email: e8, password: PW })).status === 201 && sr.jar.has('rn_session'), 'sau khi xác minh → đăng nhập được');

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  smtp.close(); google.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); smtp.close(); google.close(); process.exit(2); });
