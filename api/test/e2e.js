/* E2E: chạy với API đã khởi động:  BASE=http://localhost:4001 node test/e2e.js
 * Kiểm tra đăng ký/đăng nhập, cô lập dữ liệu giữa người dùng, token lịch công khai, rate limit và xóa tài khoản. */
const BASE = process.env.BASE || 'http://localhost:4001';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗ FAIL'} ${m}`); };
const sec = (t) => console.log(`\n${t}`);

class Client {
  cookie = '';
  async call(method, path, body, headers = {}) {
    const res = await fetch(BASE + '/api' + path, {
      method, redirect: 'manual',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) { const c = sc.split(';')[0]; this.cookie = c.endsWith('=') ? '' : c; }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }
  get = (p) => this.call('GET', p);
  post = (p, b = {}) => this.call('POST', p, b);
  patch = (p, b) => this.call('PATCH', p, b);
  put = (p, b) => this.call('PUT', p, b);
  del = (p, b) => this.call('DELETE', p, b);
}
const rnd = () => Math.random().toString(36).slice(2, 8);
const pw = 'correct-horse-9';

(async () => {
  const A = new Client(), B = new Client(), anon = new Client();
  const emailA = `a_${rnd()}@test.dev`, emailB = `b_${rnd()}@test.dev`;

  sec('Sức khỏe & truy cập ẩn danh');
  ok((await anon.get('/health')).json.ok === true, 'GET /health công khai, DB sống');
  for (const p of ['/projects', '/experiments', '/statuses', '/notes', '/profile/stats', '/library', '/calendar/feeds', '/auth/me'])
    ok((await anon.get(p)).status === 401, `ẩn danh GET ${p} → 401`);
  ok((await anon.get('/calendar/feed/nope.ics')).status === 404, 'feed .ics sai token → 404 (công khai nhưng không lộ gì)');

  sec('Đăng ký / đăng nhập');
  ok((await anon.post('/auth/register', { email: 'not-an-email', password: pw })).status === 400, 'email sai định dạng → 400');
  ok((await anon.post('/auth/register', { email: emailA, password: 'short' })).status === 400, 'mật khẩu < 8 ký tự → 400');
  const ra = await A.post('/auth/register', { email: emailA, password: pw, name: 'Alice' });
  ok(ra.status === 201 && ra.json.email === emailA && !('passwordHash' in ra.json), 'đăng ký A thành công, không lộ passwordHash');
  const setCookie = ra.headers.get('set-cookie') || '';
  ok(/HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), 'cookie phiên: HttpOnly + SameSite=Lax');
  ok((await anon.post('/auth/register', { email: emailA.toUpperCase(), password: pw })).status === 409, 'đăng ký trùng email (khác hoa/thường) → 409');
  ok((await B.post('/auth/register', { email: emailB, password: pw, name: 'Bob' })).status === 201, 'đăng ký B thành công');
  ok((await anon.post('/auth/login', { email: emailA, password: 'wrong-password' })).status === 401, 'sai mật khẩu → 401');
  const A2 = new Client();
  ok((await A2.post('/auth/login', { email: emailA, password: pw })).status === 201, 'đăng nhập đúng');
  ok((await A2.get('/auth/me')).json.name === 'Alice', '/auth/me trả đúng user');
  const st = (await A.get('/statuses')).json;
  ok(st.length === 4 && st.every((s) => s.key), 'người mới có 4 trạng thái mặc định');

  sec('Dữ liệu của A');
  const proj = (await A.post('/projects', { title: 'Dự án của A', metrics: ['Accuracy'] })).json;
  ok(!!proj.id, 'A tạo dự án');
  const pj = (await A.get(`/projects/${proj.id}`)).json;
  const metricId = pj.metrics[0].id;
  const label = (await A.post(`/projects/${proj.id}/labels`, { name: 'secret-label' })).json;
  const task = (await A.post(`/projects/${proj.id}/tasks`, { title: 'Task bí mật' })).json;
  const task2 = (await A.post(`/projects/${proj.id}/tasks`, { title: 'Task 2' })).json;
  const log = (await A.post(`/tasks/${task.id}/logs`, { metricId, value: 0.9, std: 0.01 })).json;
  const note = (await A.post(`/tasks/${task.id}/notes`, { title: 'n', body: 'secret body' })).json;
  ok(log.value === 0.9 && log.std === 0.01 && !!note.id, 'A ghi log (kèm std) và note');
  const feed = (await A.post('/calendar/feeds', { name: 'Feed A' })).json;
  await A.patch(`/tasks/${task.id}`, { dueDate: new Date().toISOString() });
  ok((await A.get('/profile/stats')).json.projects.length === 1, 'thống kê profile của A có đúng 1 dự án');

  sec('Cô lập: B không thấy / không sửa được dữ liệu của A (phải 404)');
  const notFound = async (label, r) => ok(r.status === 404, `${label} → ${r.status}`);
  await notFound('B GET dự án của A', await B.get(`/projects/${proj.id}`));
  await notFound('B PATCH dự án của A', await B.patch(`/projects/${proj.id}`, { title: 'hacked' }));
  await notFound('B DELETE dự án của A', await B.del(`/projects/${proj.id}`));
  await notFound('B GET notes dự án của A', await B.get(`/projects/${proj.id}/notes`));
  await notFound('B GET task của A', await B.get(`/tasks/${task.id}`));
  await notFound('B PATCH task của A', await B.patch(`/tasks/${task.id}`, { title: 'hacked' }));
  await notFound('B DELETE task của A', await B.del(`/tasks/${task.id}`));
  await notFound('B tạo task trong dự án của A', await B.post(`/projects/${proj.id}/tasks`, { title: 'x' }));
  await notFound('B bulk-create vào dự án của A', await B.post(`/projects/${proj.id}/tasks/bulk`, { tasks: [{ title: 'x' }] }));
  await notFound('B thêm metric vào dự án của A', await B.post(`/projects/${proj.id}/metrics`, { name: 'x' }));
  await notFound('B sửa metric của A', await B.patch(`/metrics/${metricId}`, { name: 'x' }));
  await notFound('B xóa metric của A', await B.del(`/metrics/${metricId}`));
  await notFound('B sửa label của A', await B.patch(`/labels/${label.id}`, { name: 'x' }));
  await notFound('B xóa label của A', await B.del(`/labels/${label.id}`));
  await notFound('B thêm log vào task của A', await B.post(`/tasks/${task.id}/logs`, { metricId, value: 1 }));
  await notFound('B sửa note của A', await B.patch(`/items/notes/${note.id}`, { body: 'hacked' }));
  await notFound('B xóa log của A', await B.del(`/items/logs/${log.id}`));
  await notFound('B gắn phụ thuộc vào task của A', await B.post(`/tasks/${task.id}/deps`, { dependsOnId: task2.id }));
  await notFound('B đặt nhãn cho task của A', await B.put(`/tasks/${task.id}/labels`, { ids: [] }));
  await notFound('B sửa feed của A', await B.patch(`/calendar/feeds/${feed.id}`, { name: 'x' }));
  await notFound('B tạo lại link feed của A', await B.post(`/calendar/feeds/${feed.id}/regenerate`));
  await notFound('B xóa feed của A', await B.del(`/calendar/feeds/${feed.id}`));
  await notFound('B tạo feed cho dự án của A', await B.post('/calendar/feeds', { projectId: proj.id }));
  await notFound('B dùng AI trên dự án của A', await B.post('/ai/parse-tasks', { projectId: proj.id, text: 'x', mode: 'rules' }));
  ok((await B.get('/projects')).json.length === 0, 'B: danh sách dự án rỗng');
  ok((await B.get('/experiments')).json.length === 0, 'B: /experiments rỗng');
  ok((await B.get('/notes')).json.length === 0, 'B: /notes rỗng');
  ok((await B.get('/library')).json.length === 0, 'B: thư viện rỗng');
  ok((await B.get('/calendar/feeds')).json.feeds.length === 0, 'B: không có feed');
  const s = (await B.get('/search?q=secret')).json;
  ok(s.projects.length + s.tasks.length + s.notes.length === 0, 'B: tìm "secret" không ra gì của A');
  ok((await B.get('/profile/stats')).json.totals.logs === 0, 'B: thống kê không lẫn dữ liệu A');

  sec('Cô lập qua tham chiếu chéo');
  const bProj = (await B.post('/projects', { title: 'Dự án của B' })).json;
  const bTask = (await B.post(`/projects/${bProj.id}/tasks`, { title: 'Task B' })).json;
  await notFound('B ghi log vào task của mình nhưng metric của A', await B.post(`/tasks/${bTask.id}/logs`, { metricId, value: 1 }));
  await notFound('B gắn phụ thuộc task mình → task của A', await B.post(`/tasks/${bTask.id}/deps`, { dependsOnId: task.id }));
  const bStatus = (await B.post('/statuses', { name: 'Chỉ của B', kind: 'running' })).json;
  ok(!(await A.get('/statuses')).json.some((x) => x.id === bStatus.id), 'trạng thái tùy chỉnh của B không hiện ở A');
  await notFound('A sửa trạng thái của B', await A.patch(`/statuses/${bStatus.id}`, { name: 'x' }));
  const aCustom = (await A.post('/statuses', { name: 'Chỉ của A', kind: 'running' })).json;
  ok((await B.patch(`/tasks/${bTask.id}`, { status: aCustom.key })).status === 400, 'B đặt task sang status tùy chỉnh của A (không tồn tại ở B) → 400');
  const lbA = (await A.post(`/projects/${proj.id}/labels`, { name: 'second' })).json;
  await B.put(`/tasks/${bTask.id}/labels`, { ids: [label.id, lbA.id] });
  ok((await B.get(`/tasks/${bTask.id}`)).json.labelIds.length === 0, 'B gắn nhãn của A vào task của mình → bị bỏ qua');

  sec('Feed lịch công khai theo token');
  const feeds = (await A.get('/calendar/feeds')).json.feeds;
  const ics = await anon.call('GET', feeds[0].path.replace(/^\/api/, ''));
  ok(ics.status === 200 && typeof ics.json === 'string' && ics.json.includes('BEGIN:VCALENDAR') && ics.json.includes('Task bí mật'), 'ẩn danh có token đọc được feed của A');
  const bIcs = (await B.post('/calendar/feeds', { name: 'B feed' })).json;
  const bText = (await anon.call('GET', `/calendar/feed/${bIcs.token}.ics`)).json;
  ok(typeof bText === 'string' && !bText.includes('Task bí mật'), 'feed của B không chứa task của A');
  const newTok = (await A.post(`/calendar/feeds/${feeds[0].id}/regenerate`)).json.token;
  ok((await anon.call('GET', `/calendar/feed/${feeds[0].token}.ics`)).status === 404 && newTok !== feeds[0].token, 'tạo lại link → token cũ chết');

  sec('Tính năng cốt lõi vẫn đúng với nhiều người dùng');
  const done = (await A.get('/statuses')).json.find((x) => x.kind === 'done').key;
  await A.patch(`/tasks/${task2.id}`, { status: done });
  const stats = (await A.get('/profile/stats')).json;
  ok(stats.thisWeek.completed >= 1 && stats.streak.current >= 1, 'hoàn thành task → thống kê Profile của A tăng');
  ok((await B.get('/profile/stats')).json.thisWeek.completed === 0, '…và của B vẫn 0');
  const cyc = await A.post(`/tasks/${task.id}/deps`, { dependsOnId: task2.id });
  const cyc2 = await A.post(`/tasks/${task2.id}/deps`, { dependsOnId: task.id });
  ok(cyc.status === 201 && cyc2.status === 400, 'chặn vòng phụ thuộc');
  const sample = (await B.post('/projects/sample?lang=en')).json;
  const bs = (await B.get(`/projects/${sample.id}`)).json;
  ok(bs.tasks.length === 4 && bs.tasks.some((t) => t.dependsOnIds.length) && bs.metrics.length === 3, 'dự án mẫu cho người mới');
  const exp = (await A.get('/auth/export')).json;
  ok(exp.projects.length === 1 && exp.user.email === emailA && !JSON.stringify(exp).includes(emailB), 'xuất dữ liệu: chỉ của A');

  sec('Đổi mật khẩu / xóa tài khoản');
  ok((await A.post('/auth/password', { current: 'wrong', next: 'new-password-1' })).status === 401, 'đổi mật khẩu sai mật khẩu cũ → 401');
  ok((await A.post('/auth/password', { current: pw, next: 'new-password-1' })).status === 201, 'đổi mật khẩu thành công');
  ok((await anon.post('/auth/login', { email: emailA, password: pw })).status === 401, 'mật khẩu cũ không còn dùng được');
  ok((await A.del('/auth/me', { password: 'nope' })).status === 401, 'xóa tài khoản sai mật khẩu → 401');
  ok((await A.del('/auth/me', { password: 'new-password-1' })).status === 200, 'xóa tài khoản thành công');
  const stale = new Client(); stale.cookie = A2.cookie;
  ok((await stale.get('/projects')).status === 401, 'phiên của tài khoản đã xóa mất hiệu lực');
  ok((await anon.call('GET', `/calendar/feed/${newTok}.ics`)).status === 404, 'feed của tài khoản đã xóa → 404');
  ok((await B.get(`/projects/${bProj.id}`)).status === 200, 'dữ liệu của B không bị ảnh hưởng');

  sec('Đăng xuất & giới hạn tốc độ');
  const L = new Client(); await L.post('/auth/login', { email: emailB, password: pw });
  ok((await L.get('/projects')).status === 200, 'đã đăng nhập');
  await L.post('/auth/logout');
  ok((await L.get('/projects')).status === 401, 'đăng xuất xong → 401');
  let limited = 0;
  for (let i = 0; i < 14; i++) if ((await anon.post('/auth/login', { email: emailB, password: 'bad-bad-bad' })).status === 429) limited++;
  ok(limited > 0, `đăng nhập sai liên tục bị chặn tốc độ (429 x${limited})`);

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
