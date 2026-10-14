/* Kiểm tra đường AI "anthropic" với server giả lập.
 *   node test/ai.js   (tự khởi động mock ở :4900; API phải chạy với
 *   AI_PROVIDER=anthropic ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4900 AI_DAILY_LIMIT=2) */
const http = require('http');
const BASE = process.env.BASE || 'http://localhost:4002';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗ FAIL'} ${m}`); };

let mode = 'ok', last = null;
const mock = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    last = { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') };
    if (mode === 'error') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } })); }
    const text = JSON.stringify({ tasks: [
      { title: 'Chuẩn bị dataset', description: '', status: 'todo', due: 'thứ sáu', labels: ['data'], dependsOn: [] },
      { title: 'Train model', description: 'bản 1B', status: 'todo', due: '', labels: [], dependsOn: ['Chuẩn bị dataset'] },
    ] });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: last.body.model, content: [{ type: 'text', text }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }));
  });
}).listen(4900);

async function call(cookie, method, path, body) {
  const r = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  return { status: r.status, json: await r.json().catch(() => null), cookie: sc ? sc.split(';')[0] : cookie };
}

(async () => {
  const email = `ai_${Math.random().toString(36).slice(2, 8)}@test.dev`;
  const reg = await call('', 'POST', '/auth/register', { email, password: 'correct-horse-9' });
  const c = reg.cookie;
  const p = (await call(c, 'POST', '/projects', { title: 'AI test' })).json;

  const info = (await call(c, 'GET', '/ai/models')).json;
  ok(info.provider === 'anthropic' && info.available && info.quota.limit === 2 && info.quota.used === 0, `/ai/models: provider=anthropic, quota 0/${info.quota?.limit}`);

  const r1 = (await call(c, 'POST', '/ai/parse-tasks', { projectId: p.id, text: 'chuẩn bị dataset thứ sáu rồi train model 1B' })).json;
  ok(r1.source === 'ai' && r1.tasks.length === 2, 'lượt 1: dùng AI, tách 2 task');
  ok(r1.tasks[0].dueDate && /^\d{4}-\d{2}-\d{2}$/.test(r1.tasks[0].dueDate), `cụm "thứ sáu" được server quy đổi thành ngày (${r1.tasks[0].dueDate})`);
  ok(r1.tasks[1].dependsOn[0] === 'Chuẩn bị dataset', 'giữ phụ thuộc theo tiêu đề');
  ok(r1.quota.used === 1, 'quota 1/2');
  ok(last.url.startsWith('/v1/messages') && last.headers['x-api-key'] === 'test', 'gọi đúng endpoint /v1/messages với API key');
  ok(last.body.model === 'claude-opus-5-5', `model mặc định = ${last.body.model}`);
  ok(last.body.output_config?.effort === 'low' && last.body.output_config?.format?.type === 'json_schema', 'dùng structured output + effort thấp');
  ok(last.body.output_config.format.schema.additionalProperties === false, 'schema có additionalProperties:false');
  ok(!('temperature' in last.body) && !('thinking' in last.body) && !('tool_choice' in last.body), 'không gửi tham số bị loại bỏ ở model mới (temperature/thinking/tool_choice)');
  ok(/Project: AI test/.test(last.body.messages[0].content) && /SAME language/.test(last.body.system), 'prompt có ngữ cảnh dự án và quy tắc ngôn ngữ');

  await call(c, 'POST', '/ai/parse-tasks', { projectId: p.id, text: 'x việc' });
  const r3 = (await call(c, 'POST', '/ai/parse-tasks', { projectId: p.id, text: '- Việc A\n- Việc B hạn mai' })).json;
  ok(r3.source === 'rules' && /hết 2 lượt/.test(r3.note) && r3.tasks.length === 2, 'vượt hạn mức → tự dùng bộ tách theo luật, kèm thông báo');
  ok((await call(c, 'GET', '/ai/models')).json.quota.used === 2, 'bộ đếm dừng ở 2/2 (không bị vượt)');

  // lỗi từ nhà cung cấp → dự phòng + hoàn lại lượt
  const c2 = (await call('', 'POST', '/auth/register', { email: `ai2_${Math.random().toString(36).slice(2, 8)}@test.dev`, password: 'correct-horse-9' })).cookie;
  const p2 = (await call(c2, 'POST', '/projects', { title: 'AI err' })).json;
  mode = 'error';
  const r4 = (await call(c2, 'POST', '/ai/parse-tasks', { projectId: p2.id, text: '- Một việc' })).json;
  ok(r4.source === 'rules' && /Lỗi AI/.test(r4.note), 'nhà cung cấp lỗi → dự phòng theo luật');
  ok((await call(c2, 'GET', '/ai/models')).json.quota.used === 0, 'lượt AI được hoàn lại khi lỗi');
  ok((await call(c2, 'POST', '/ai/parse-tasks', { projectId: p2.id, text: '- Một việc', mode: 'rules' })).json.quota == null, 'chế độ "không AI" không tốn lượt');

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  mock.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); mock.close(); process.exit(2); });
