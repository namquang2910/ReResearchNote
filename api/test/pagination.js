/* Tóm tắt log phía server + phân trang bản ghi/ note.   BASE=http://localhost:4001 node test/pagination.js */
const BASE = process.env.BASE || 'http://localhost:4001';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗ FAIL'} ${m}`); };
const sec = (t) => console.log(`\n${t}`);

let cookie = '';
async function call(method, path, body) {
  const r = await fetch(BASE + '/api' + path, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, json: await r.json().catch(() => null) };
}
const rnd = () => Math.random().toString(36).slice(2, 8);

(async () => {
  await call('POST', '/auth/register', { email: `pg_${rnd()}@test.dev`, password: 'correct-horse-9' });
  const p = (await call('POST', '/projects', { title: 'Paging', metrics: ['Accuracy', 'Loss'] })).json;
  const ov0 = (await call('GET', `/projects/${p.id}`)).json;
  const acc = ov0.metrics.find((m) => m.name === 'Accuracy').id;   // higher is better
  const loss = ov0.metrics.find((m) => m.name === 'Loss').id;      // lower is better
  const task = (await call('POST', `/projects/${p.id}/tasks`, { title: 'Many logs' })).json;
  const small = (await call('POST', `/projects/${p.id}/tasks`, { title: 'Few logs' })).json;

  sec('Tạo 1000 log cho một task (500 Accuracy + 500 Loss) và 3 log cho task khác');
  const N = 500;
  // đỉnh Accuracy cố ý ở giữa dãy (không phải điểm cuối) để chứng minh "tốt nhất" được giữ lại
  const accVal = (i) => (i === 137 ? 0.99 : 0.5 + (i % 17) / 100);
  const lossVal = (i) => (i === 311 ? 0.001 : 1 + (i % 13) / 10);
  for (let i = 1; i <= N; i++) {
    await call('POST', `/tasks/${task.id}/logs`, { metricId: acc, step: i, value: accVal(i), std: 0.01 });
    await call('POST', `/tasks/${task.id}/logs`, { metricId: loss, step: i, value: lossVal(i) });
  }
  for (let i = 1; i <= 3; i++) await call('POST', `/tasks/${small.id}/logs`, { metricId: acc, value: i / 10 });

  sec('Danh sách dự án: log được tóm tắt nhưng số liệu vẫn chính xác');
  const t0 = Date.now();
  const ov = (await call('GET', `/projects/${p.id}`)).json;
  const ms = Date.now() - t0;
  const big = ov.tasks.find((t) => t.id === task.id);
  const sm = ov.tasks.find((t) => t.id === small.id);
  const accLogs = big.logs.filter((l) => l.metricId === acc);
  const lossLogs = big.logs.filter((l) => l.metricId === loss);
  ok(big.logs.length < 120, `trả về ${big.logs.length} điểm thay vì 1000 (${ms} ms)`);
  ok(big.logCounts[acc] === N && big.logCounts[loss] === N, 'logCounts giữ đúng tổng số log thật (500/500)');
  ok(accLogs.some((l) => l.value === 0.99), 'giữ điểm TỐT NHẤT của Accuracy (0.99 ở giữa dãy)');
  ok(lossLogs.some((l) => l.value === 0.001), 'giữ điểm TỐT NHẤT của Loss (thấp nhất, hướng "low")');
  ok(accLogs.some((l) => l.step === 1) && accLogs.some((l) => l.step === N), 'giữ điểm đầu và điểm cuối');
  ok(accLogs.every((l, i, a) => i === 0 || l.step >= a[i - 1].step), 'các điểm theo thứ tự step');
  ok(Math.max(...accLogs.map((l) => l.value)) === 0.99 && Math.min(...lossLogs.map((l) => l.value)) === 0.001, 'best/last tính từ dữ liệu tóm tắt = giá trị thật');
  ok(sm.logs.length === 3 && sm.logCounts[acc] === 3, 'task ít log được giữ nguyên (không lấy mẫu)');

  sec('/experiments cũng được tóm tắt');
  const ex = (await call('GET', '/experiments')).json.find((t) => t.id === task.id);
  ok(ex.logs.length < 100 && ex.logCounts[acc] === N && ex.logs.some((l) => l.value === 0.99), 'experiments: tóm tắt + đúng số lượng + giữ best');

  sec('Chi tiết task');
  const det = (await call('GET', `/tasks/${task.id}`)).json;
  const dAcc = det.logs.filter((l) => l.metricId === acc);
  ok(dAcc.length <= 160 && dAcc.length > 40 && det.logCounts[acc] === N, `chi tiết: ${dAcc.length} điểm/metric cho biểu đồ, logCounts=${det.logCounts[acc]}`);
  ok(dAcc.some((l) => l.value === 0.99), 'chi tiết vẫn giữ điểm tốt nhất');

  sec('Phân trang bản ghi: GET /tasks/:id/logs');
  const p1 = (await call('GET', `/tasks/${task.id}/logs?metricId=${acc}&limit=50`)).json;
  ok(p1.total === N && p1.items.length === 50 && p1.nextOffset === 50 && p1.items[0].step === 1, 'trang 1: 50 bản ghi, tổng 500, bắt đầu từ step 1');
  const seen = new Set(p1.items.map((x) => x.id));
  let off = p1.nextOffset, pages = 1, dup = 0;
  while (off != null) {
    const r = (await call('GET', `/tasks/${task.id}/logs?metricId=${acc}&limit=50&offset=${off}`)).json;
    r.items.forEach((x) => { seen.has(x.id) ? dup++ : seen.add(x.id); });
    off = r.nextOffset; pages++;
  }
  ok(pages === 10 && seen.size === N && dup === 0, `duyệt hết ${pages} trang: ${seen.size} bản ghi, không trùng`);
  ok((await call('GET', `/tasks/${task.id}/logs?limit=9999`)).json.items.length === 200, 'limit bị chặn trần 200');
  ok((await call('GET', `/tasks/${task.id}/logs`)).json.total === N * 2, 'không lọc metric → tổng 1000');

  sec('Phân trang note (keyset)');
  for (let i = 1; i <= 7; i++) await call('POST', `/tasks/${small.id}/notes`, { title: `Note ${i}`, body: 'x' });
  const n1 = (await call('GET', '/notes?limit=3')).json;
  ok(Array.isArray(n1.items) && n1.items.length === 3 && !!n1.nextCursor, 'trang 1: 3 note + nextCursor');
  const ids = n1.items.map((n) => n.id); let cur = n1.nextCursor, np = 1;
  while (cur) {
    const r = (await call('GET', `/notes?limit=3&cursor=${encodeURIComponent(cur)}`)).json;
    r.items.forEach((n) => ids.push(n.id)); cur = r.nextCursor; np++;
  }
  ok(ids.length === 7 && new Set(ids).size === 7 && np === 3, `duyệt ${np} trang: 7 note, không trùng/thiếu`);
  const pn = (await call('GET', `/projects/${p.id}/notes?limit=5`)).json;
  ok(pn.items.length === 5 && !!pn.nextCursor, 'notes theo dự án cũng phân trang');
  ok((await call('GET', '/notes?cursor=garbage|x')).json.items.length === 7, 'cursor hỏng bị bỏ qua (không lỗi)');

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
