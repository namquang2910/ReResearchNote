/** Bộ tách task theo luật (không cần AI) — dùng khi Ollama không chạy hoặc người dùng chọn "không AI". */

export interface DraftTask {
  title: string;
  description: string;
  status: string; // key trạng thái
  dueDate: string | null; // YYYY-MM-DD
  labels: string[];
  dependsOn: string[]; // tiêu đề task đã có hoặc task mới ở trước
}

export interface RuleCtx {
  today: Date;
  todoKey: string;
  runningKey?: string;
  blockedKey?: string;
  doneKey: string;
  taskTitles: string[];
}

const L = '(?<![\\p{L}\\d])';
const R = '(?![\\p{L}\\d])';
const re = (src: string) => new RegExp(`${L}(?:${src})${R}`, 'iu');

const WEEKDAYS: [RegExp, number][] = [
  [re('chủ\\s*nhật|cn|sunday'), 0],
  [re('thứ\\s*(?:hai|2)|t2|monday'), 1],
  [re('thứ\\s*(?:ba|3)|t3|tuesday'), 2],
  [re('thứ\\s*(?:tư|4)|t4|wednesday'), 3],
  [re('thứ\\s*(?:năm|5)|t5|thursday'), 4],
  [re('thứ\\s*(?:sáu|6)|t6|friday'), 5],
  [re('thứ\\s*(?:bảy|7)|t7|saturday'), 6],
];
const CONNECT = '(?:(?:hạn|deadline|due|by|trước|vào|đến|before)\\s*(?:là|:)?\\s*)?';

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Tìm một cụm ngày trong chuỗi; trả về ngày + chuỗi đã bỏ cụm đó. */
export function extractDate(text: string, today: Date): { date: Date | null; rest: string } {
  const take = (m: RegExpMatchArray | null, date: Date | null) =>
    m && date ? { date, rest: (text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length)) } : null;
  const c = (src: string) => new RegExp(`${L}${CONNECT}(?:${src})${R}`, 'iu');

  let m = text.match(c('(\\d{4})-(\\d{1,2})-(\\d{1,2})'));
  if (m) { const r = take(m, new Date(+m[1], +m[2] - 1, +m[3])); if (r) return r; }

  m = text.match(c('(\\d{1,2})[\\/.\\-](\\d{1,2})(?:[\\/.\\-](\\d{2,4}))?'));
  if (m) {
    const day = +m[1], mon = +m[2];
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      let y = m[3] ? +m[3] : today.getFullYear();
      if (y < 100) y += 2000;
      let d = new Date(y, mon - 1, day);
      if (!m[3] && d.getTime() < addDays(today, -30).getTime()) d = new Date(y + 1, mon - 1, day);
      const r = take(m, d); if (r) return r;
    }
  }
  m = text.match(c('(?:trong|in)\\s+(\\d+)\\s*(?:ngày|days?)(?:\\s*nữa)?|(\\d+)\\s*ngày\\s*nữa'));
  if (m) { const r = take(m, addDays(today, +(m[1] ?? m[2]))); if (r) return r; }

  const fixed: [string, number][] = [
    ['ngày\\s*kia|ngày\\s*mốt|mốt|day after tomorrow', 2],
    ['ngày\\s*mai|tomorrow|mai', 1],
    ['hôm\\s*nay|today|tối nay|sáng nay', 0],
    ['tuần\\s*sau|tuần\\s*tới|next week', 7],
  ];
  for (const [src, n] of fixed) {
    m = text.match(c(src));
    if (m) { const r = take(m, addDays(today, n)); if (r) return r; }
  }
  for (const [rx, wd] of WEEKDAYS) {
    m = text.match(new RegExp(`${L}${CONNECT}(?:${rx.source.slice(rx.source.indexOf('(?:') )})`, 'iu')) ?? text.match(rx);
    if (m) {
      let diff = (wd - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      const r = take(m, addDays(today, diff)); if (r) return r;
    }
  }
  return { date: null, rest: text };
}

const STATUS_HINTS: { rx: RegExp; pick: (c: RuleCtx) => string | undefined }[] = [
  { rx: /[\(\[]\s*(?:x|✓|✔|done|xong|hoàn thành)\s*[\)\]]/iu, pick: (c) => c.doneKey },
  { rx: /[\(\[]\s*(?:đang chạy|đang làm|running|wip|in progress)\s*[\)\]]/iu, pick: (c) => c.runningKey },
  { rx: /[\(\[]\s*(?:bị chặn|blocked|chờ|waiting)\s*[\)\]]/iu, pick: (c) => c.blockedKey },
];

const clean = (s: string) => s.replace(/\s{2,}/g, ' ').replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, '').trim();

export function parseByRules(text: string, ctx: RuleCtx): DraftTask[] {
  const out: DraftTask[] = [];
  const known = () => [...ctx.taskTitles, ...out.map((t) => t.title)];
  const lines = text.split(/\r?\n/).flatMap((l) => l.split(/;\s*/));

  for (const raw of lines) {
    let line = raw.replace(/^\s*(?:[-*•▪◦]|\d+[.)]|\[[ xX]?\])\s*/, '').trim();
    if (line.length < 2) continue;
    const checked = /^\s*\[[xX]\]/.test(raw);
    const parts = line.split(/\s*(?:->|→|=>)\s*/).filter(Boolean);

    let prev: string | null = null;
    for (let part of parts) {
      let status = checked ? ctx.doneKey : ctx.todoKey;
      for (const h of STATUS_HINTS) {
        const m = part.match(h.rx);
        if (m) { status = h.pick(ctx) ?? status; part = part.replace(m[0], ' '); }
      }
      const labels = [...part.matchAll(/(?<![\p{L}\d])#([\p{L}\d_-]+)/gu)].map((m) => m[1]);
      part = part.replace(/(?<![\p{L}\d])#[\p{L}\d_-]+/gu, ' ');

      const { date, rest } = extractDate(part, ctx.today);
      part = rest;

      const dependsOn: string[] = [];
      const dm = part.match(/[,\s]*(?:sau khi|sau|after|phụ thuộc|depends on)\s+(.+)$/iu);
      if (dm) {
        const needle = clean(dm[1]).toLowerCase();
        const hit = known().find((t) => t.toLowerCase() === needle) ?? known().find((t) => t.toLowerCase().includes(needle) || needle.includes(t.toLowerCase()));
        if (hit) { dependsOn.push(hit); part = part.slice(0, dm.index); }
      }
      if (prev) dependsOn.push(prev);

      const title = clean(part);
      if (title.length < 2) continue;
      out.push({ title, description: '', status, dueDate: date ? iso(date) : null, labels: [...new Set(labels)], dependsOn });
      prev = title;
    }
  }
  return out;
}
