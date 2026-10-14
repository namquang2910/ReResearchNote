/* Dịch vụ giả để thử giao diện thật khi chưa có SMTP / Google:
 *   node test/mock-services.js
 *   - SMTP :2525 — mọi email gửi tới được ghi vào /tmp/mock-mails.json
 *   - "Google" :4901 — /auth tự đồng ý và chuyển về redirect_uri; userinfo trả một hồ sơ cố định (đổi bằng MOCK_GOOGLE_EMAIL)
 * Chạy API với: SMTP_HOST=127.0.0.1 SMTP_PORT=2525 GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=secret
 *   GOOGLE_AUTH_URL=http://localhost:4901/auth GOOGLE_TOKEN_URL=http://localhost:4901/token GOOGLE_USERINFO_URL=http://localhost:4901/userinfo
 */
const net = require('net');
const http = require('http');
const fs = require('fs');
const OUT = '/tmp/mock-mails.json';
const mails = [];
const qp = (s) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

net.createServer((sock) => {
  sock.write('220 localhost ESMTP\r\n');
  let buf = '', data = false, to = [];
  sock.on('data', (c) => {
    buf += c.toString('latin1');
    for (;;) {
      if (data) {
        const i = buf.indexOf('\r\n.\r\n'); if (i < 0) break;
        const raw = buf.slice(0, i); buf = buf.slice(i + 5); data = false;
        const body = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n');
        mails.push({ to, subject: (raw.match(/^Subject:\s*(.+)$/im) || [])[1] || '', body: /quoted-printable/i.test(raw) ? qp(body) : body, at: new Date().toISOString() });
        fs.writeFileSync(OUT, JSON.stringify(mails, null, 1)); to = [];
        sock.write('250 OK\r\n'); continue;
      }
      const j = buf.indexOf('\r\n'); if (j < 0) break;
      const line = buf.slice(0, j); buf = buf.slice(j + 2);
      const c4 = line.slice(0, 4).toUpperCase();
      if (c4 === 'EHLO' || c4 === 'HELO') sock.write('250-localhost\r\n250 8BITMIME\r\n');
      else if (c4 === 'RCPT') { to.push((line.match(/<(.+?)>/) || [])[1]); sock.write('250 OK\r\n'); }
      else if (c4 === 'DATA') { data = true; sock.write('354 go\r\n'); }
      else if (c4 === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 OK\r\n');
    }
  });
}).listen(2525, '127.0.0.1', () => console.log('mock SMTP on :2525 → ' + OUT));

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/auth') {
    res.writeHead(302, { location: `${u.searchParams.get('redirect_uri')}?code=mock-code&state=${u.searchParams.get('state')}` });
    return res.end();
  }
  if (u.pathname === '/token') { req.resume(); return req.on('end', () => json({ access_token: 'at_mock', token_type: 'Bearer' })); }
  if (u.pathname === '/userinfo')
    return json({ sub: 'g-mock-ui', email: process.env.MOCK_GOOGLE_EMAIL || 'google.ui@test.dev', email_verified: true, name: 'Google UI' });
  json({}, 404);
}).listen(4901, () => console.log('mock Google on :4901'));
