/** Sinh iCalendar (RFC 5545) cho các task có hạn chót. Thuần hàm, không phụ thuộc framework. */

export interface IcsTask {
  id: string;
  title: string;
  description: string;
  statusName: string;
  done: boolean;
  dueDate: Date;
  updatedAt: Date;
  projectTitle: string;
  labels: string[];
  url?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Gập dòng ở 75 byte UTF-8, không cắt giữa ký tự. */
export function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0, limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && end > start + 1 && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // ký tự cách đầu dòng tiếp theo chiếm 1 byte
  }
  return parts.join('\r\n ');
}

const p2 = (n: number) => String(n).padStart(2, '0');
/** Ngày theo giờ địa phương của server — hạn chót là "ngày", không phải thời điểm. */
const dateOnly = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;

export function buildIcs(calName: string, tasks: IcsTask[], now = new Date()): string {
  const L: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ReSearch Notes//Tasks//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-CALDESC:Hạn chót task từ ReSearch Notes',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const t of tasks) {
    const start = new Date(t.dueDate.getFullYear(), t.dueDate.getMonth(), t.dueDate.getDate());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    const desc = [`Trạng thái: ${t.statusName}`, `Dự án: ${t.projectTitle}`, t.description && `\n${t.description}`, t.url && `\n${t.url}`]
      .filter(Boolean).join('\n');
    L.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@research-notes`,
      `DTSTAMP:${utcStamp(now)}`,
      `LAST-MODIFIED:${utcStamp(t.updatedAt)}`,
      `DTSTART;VALUE=DATE:${dateOnly(start)}`,
      `DTEND;VALUE=DATE:${dateOnly(end)}`,
      `SUMMARY:${esc((t.done ? '✓ ' : '') + `[${t.projectTitle}] ${t.title}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      `CATEGORIES:${[t.projectTitle, ...t.labels].map(esc).join(',')}`,
      `TRANSP:TRANSPARENT`,
      'STATUS:CONFIRMED',
    );
    if (t.url) L.push(`URL:${t.url}`);
    if (!t.done) {
      // nhắc lúc 9:00 sáng ngày đến hạn
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(t.title)}`, 'TRIGGER;RELATED=START:PT9H', 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
