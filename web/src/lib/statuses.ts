'use client';
import { t } from './i18n';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type StatusKind = 'todo' | 'running' | 'blocked' | 'done';
export interface StatusDef { id: string; key: string; name: string; color: string; kind: StatusKind; order: number; /** tên gốc lưu trong DB (chưa dịch) */ rawName?: string }

/** Chuỗi gốc (tiếng Việt); dùng t(KIND_LABEL[k]) khi hiển thị. */
export const KIND_LABEL: Record<StatusKind, string> = {
  todo: 'Chưa làm', running: 'Đang chạy', blocked: 'Bị chặn', done: 'Hoàn thành',
};

const DEFAULTS: StatusDef[] = [
  { id: 'd1', key: 'todo', name: 'Chưa làm', color: '#94a3b8', kind: 'todo', order: 0 },
  { id: 'd2', key: 'running', name: 'Đang chạy', color: '#3b82f6', kind: 'running', order: 1 },
  { id: 'd3', key: 'blocked', name: 'Bị chặn', color: '#ef4444', kind: 'blocked', order: 2 },
  { id: 'd4', key: 'done', name: 'Hoàn thành', color: '#22c55e', kind: 'done', order: 3 },
];
const KIND_PRIORITY: StatusKind[] = ['running', 'todo', 'blocked', 'done'];

/** Trạng thái tùy chỉnh (dùng chung mọi dự án). `key` là giá trị lưu ở task.status. */
export function useStatuses() {
  const { data } = useQuery({ queryKey: ['statuses'], queryFn: () => api.get<StatusDef[]>('/statuses'), staleTime: 60_000 });
  // tên trạng thái mặc định được dịch theo ngôn ngữ; trạng thái do người dùng tự đặt giữ nguyên
  const list = useMemo(() => (data ?? DEFAULTS).map((s) => ({ ...s, rawName: s.name, name: t(s.name) })), [data]);
  return useMemo(() => {
    const map = new Map(list.map((s) => [s.key, s]));
    const meta = (key: string): StatusDef => map.get(key) ?? { id: '', key, name: key, rawName: key, color: '#94a3b8', kind: 'todo', order: 999 };
    return {
      list,
      /** nhóm theo loại: đang chạy → chưa làm → bị chặn → hoàn thành, trong từng loại theo thứ tự */
      grouped: [...list].sort((a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind) || a.order - b.order),
      meta,
      isDone: (key: string) => meta(key).kind === 'done',
      isRunning: (key: string) => meta(key).kind === 'running',
      isTodo: (key: string) => meta(key).kind === 'todo',
      todoKey: list.find((s) => s.kind === 'todo')?.key ?? 'todo',
      doneKey: list.find((s) => s.kind === 'done')?.key ?? 'done',
      indexOf: (key: string) => list.findIndex((s) => s.key === key),
    };
  }, [list]);
}
