/**
 * i18n tối giản: khóa chính là chuỗi tiếng Việt gốc, `en` là bảng dịch sang tiếng Anh.
 * Chuỗi chưa có bản dịch sẽ hiện nguyên văn (không bao giờ vỡ giao diện).
 * Dùng `{tên}` để chèn biến: t('Đã tạo {n} task', { n: 3 }).
 */
import { EN } from './en';

export type Lang = 'vi' | 'en';
let current: Lang = 'vi';

export const getLang = (): Lang => current;
/** Gọi bởi LangProvider trước khi render cây con, để `t` luôn đọc đúng ngôn ngữ hiện tại. */
export const setCurrentLang = (l: Lang) => { current = l; };
export const dateLocale = () => (current === 'en' ? 'en-US' : 'vi-VN');

export function t(s: string, vars?: Record<string, string | number>): string {
  let out = current === 'en' ? EN[s] ?? s : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** Thông báo do backend trả về (tiếng Việt) — dịch khớp nguyên văn hoặc theo mẫu. */
export function tServer(msg: string): string {
  if (!msg || current === 'vi') return msg;
  if (EN[msg]) return EN[msg];
  let m: RegExpMatchArray | null;
  if ((m = msg.match(/^Trạng thái "(.+)" không tồn tại$/))) return `Status "${m[1]}" doesn't exist`;
  if ((m = msg.match(/^Có (\d+) task đang dùng trạng thái này, hãy chọn trạng thái để chuyển sang$/))) return `${m[1]} tasks use this status — choose a status to move them to`;
  if ((m = msg.match(/^Lỗi Ollama: (.*) — đã dùng bộ tách theo luật đơn giản\.$/))) return `Ollama error: ${m[1]} — used the simple rule-based splitter.`;
  if ((m = msg.match(/^(.*) — đã dùng bộ tách theo luật đơn giản\.$/))) return `${tServer(m[1])} — used the simple rule-based splitter.`;
  if ((m = msg.match(/^Unknown resource "(.+)"$/))) return `Unknown resource "${m[1]}"`;
  if ((m = msg.match(/^Bạn đã dùng hết (\d+) lượt AI hôm nay$/))) return `You've used all ${m[1]} AI requests for today`;
  if ((m = msg.match(/^Lỗi AI: (.*)$/))) return `AI error: ${m[1]}`;
  if ((m = msg.match(/^Tối đa (\d+) ký tự$/))) return `At most ${m[1]} characters`;
  if (msg.includes(', ')) return msg.split(', ').map((p) => EN[p] ?? p).join(', '); // nhiều lỗi validate gộp lại
  return msg;
}
