#!/usr/bin/env node
/**
 * Nhập dữ liệu từ bản SQLite cũ (v1, một người dùng) vào Postgres, gán cho một tài khoản.
 *
 *   node scripts/import-sqlite.js --db prisma/old.db --email you@example.com --password '********' [--name "Tên"]
 *
 * - Nếu email chưa tồn tại: tạo tài khoản mới với mật khẩu đã cho.
 * - Giữ nguyên id, thời gian, phụ thuộc, nhãn. An toàn chạy lại (bỏ qua bản ghi đã có).
 */
require('../dist/env');
const { DatabaseSync } = require('node:sqlite');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const dbPath = arg('db'), email = arg('email')?.toLowerCase(), password = arg('password'), name = arg('name') ?? '';
if (!dbPath || !email) { console.error('Cần --db <file.db> và --email <email> (và --password nếu tạo tài khoản mới)'); process.exit(1); }

const toDate = (v) => (v == null ? null : typeof v === 'number' || /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(v));
const prisma = new PrismaClient();
const db = new DatabaseSync(dbPath, { readOnly: true });
const all = (t) => { try { return db.prepare(`SELECT * FROM "${t}"`).all(); } catch { return []; } };

(async () => {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    if (!password || password.length < 8) { console.error('Tài khoản chưa tồn tại: cần --password (>= 8 ký tự)'); process.exit(1); }
    user = await prisma.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 10) } });
    console.log('Đã tạo tài khoản', email);
  }
  const ownerId = user.id;
  const n = {};

  // trạng thái (mất khóa unique toàn cục → theo chủ sở hữu)
  const statuses = all('Status');
  if (statuses.length) {
    await prisma.status.createMany({ data: statuses.map((s) => ({ ownerId, key: s.key, name: s.name, color: s.color, kind: s.kind, order: s.order })), skipDuplicates: true });
  } else {
    await prisma.status.createMany({ data: [['todo', 'Chưa làm', '#94a3b8'], ['running', 'Đang chạy', '#3b82f6'], ['blocked', 'Bị chặn', '#ef4444'], ['done', 'Hoàn thành', '#22c55e']]
      .map(([key, name, color], order) => ({ ownerId, key, name, color, kind: key, order })), skipDuplicates: true });
  }
  n.statuses = statuses.length;

  const projects = all('Project');
  await prisma.project.createMany({ skipDuplicates: true, data: projects.map((p) => ({
    id: p.id, ownerId, title: p.title, description: p.description ?? '', favorite: !!p.favorite, color: p.color ?? '#6366f1',
    createdAt: toDate(p.createdAt), updatedAt: toDate(p.updatedAt) })) });
  n.projects = projects.length;

  const metrics = all('Metric');
  await prisma.metric.createMany({ skipDuplicates: true, data: metrics.map((m) => ({ id: m.id, projectId: m.projectId, name: m.name, unit: m.unit ?? '', better: m.better, order: m.order })) });
  const labels = all('Label');
  await prisma.label.createMany({ skipDuplicates: true, data: labels.map((l) => ({ id: l.id, projectId: l.projectId, name: l.name, color: l.color })) });

  const tasks = all('Task');
  await prisma.task.createMany({ skipDuplicates: true, data: tasks.map((t) => ({
    id: t.id, projectId: t.projectId, title: t.title, description: t.description ?? '', status: t.status,
    dueDate: toDate(t.dueDate), completedAt: toDate(t.completedAt), createdAt: toDate(t.createdAt), updatedAt: toDate(t.updatedAt) })) });
  n.tasks = tasks.length;

  // quan hệ nhiều-nhiều ngầm của Prisma: _LabelToTask (A = label, B = task)
  for (const r of all('_LabelToTask')) {
    await prisma.task.update({ where: { id: r.B }, data: { labels: { connect: { id: r.A } } } }).catch(() => {});
  }
  // _TaskDeps (A = task làm trước, B = task phụ thuộc vào A) — đã đối chiếu với dữ liệu thật
  for (const r of all('_TaskDeps')) {
    await prisma.task.update({ where: { id: r.B }, data: { dependsOn: { connect: { id: r.A } } } }).catch(() => {});
  }

  const rows = (t, f) => { const r = all(t); n[t] = r.length; return r.map(f); };
  await prisma.metricLog.createMany({ skipDuplicates: true, data: rows('MetricLog', (l) => ({ id: l.id, taskId: l.taskId, metricId: l.metricId, step: l.step, value: l.value, std: l.std ?? null, createdAt: toDate(l.createdAt) })) });
  await prisma.change.createMany({ skipDuplicates: true, data: rows('Change', (c) => ({ id: c.id, taskId: c.taskId, text: c.text, createdAt: toDate(c.createdAt) })) });
  await prisma.commit.createMany({ skipDuplicates: true, data: rows('Commit', (c) => ({ id: c.id, taskId: c.taskId, hash: c.hash, message: c.message ?? '', createdAt: toDate(c.createdAt) })) });
  await prisma.comment.createMany({ skipDuplicates: true, data: rows('Comment', (c) => ({ id: c.id, taskId: c.taskId, text: c.text, createdAt: toDate(c.createdAt) })) });
  await prisma.note.createMany({ skipDuplicates: true, data: rows('Note', (c) => ({ id: c.id, taskId: c.taskId, title: c.title ?? '', body: c.body ?? '', createdAt: toDate(c.createdAt), updatedAt: toDate(c.updatedAt) })) });
  await prisma.calendarFeed.createMany({ skipDuplicates: true, data: rows('CalendarFeed', (f) => ({ id: f.id, token: f.token, ownerId, name: f.name, projectId: f.projectId ?? null, includeDone: !!f.includeDone, createdAt: toDate(f.createdAt) })) });

  console.log('Đã nhập cho', email, JSON.stringify(n));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
