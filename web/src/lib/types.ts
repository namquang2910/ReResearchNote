/** key của trạng thái (tùy chỉnh được) */
export type Status = string;
export type Better = 'high' | 'low';

export interface Metric { id: string; projectId: string; name: string; unit: string; better: Better; order: number }
export interface Label { id: string; projectId: string; name: string; color: string }
export interface Log { id: string; taskId: string; metricId: string; step: number; value: number; std: number | null; createdAt: string }

export interface TaskLite {
  id: string; projectId: string; title: string; description: string; status: Status; createdAt: string;
  dueDate: string | null;
  labelIds: string[]; dependsOnIds: string[]; logs: Log[];
  counts: { changes: number; commits: number; comments: number; notes: number };
}
export interface Project {
  id: string; title: string; description: string; favorite: boolean; color: string;
  metrics: Metric[]; labels: Label[]; tasks: TaskLite[];
}
export interface ProjectSummary {
  id: string; title: string; description: string; favorite: boolean; color: string; updatedAt: string;
  taskCount: number; doneCount: number; runningCount: number;
}
export interface TaskRef { id: string; title: string; status: Status }
export interface TaskDetail {
  id: string; projectId: string; title: string; description: string; status: Status; createdAt: string;
  dueDate: string | null;
  labelIds: string[]; dependsOn: TaskRef[]; dependents: TaskRef[];
  logs: Log[];
  changes: { id: string; text: string; createdAt: string }[];
  commits: { id: string; hash: string; message: string; createdAt: string }[];
  comments: { id: string; text: string; createdAt: string }[];
  notes: { id: string; title: string; body: string; updatedAt: string; createdAt: string }[];
}
export interface ProjectNote { id: string; title: string; body: string; updatedAt: string; task: TaskRef }

export interface ProjectRef { id: string; title: string; color: string }
/** task của mọi dự án (GET /experiments) */
export interface ExpTask {
  id: string; projectId: string; title: string; description: string; status: Status;
  dueDate: string | null; createdAt: string; updatedAt: string;
  labels: { id: string; name: string; color: string }[];
  dependsOnIds: string[]; logs: Log[];
  project: ProjectRef & { metrics: Metric[] };
}
export interface GlobalNote { id: string; title: string; body: string; updatedAt: string; task: TaskRef & { project: ProjectRef } }
export interface SearchResult {
  projects: { id: string; title: string; description: string; color: string }[];
  tasks: { id: string; title: string; status: Status; description: string; project: ProjectRef }[];
  notes: { id: string; title: string; body: string; task: { id: string; title: string; project: ProjectRef } }[];
}

/** mục thư viện = nhãn/metric duy nhất tổng hợp từ mọi dự án */
export interface LibraryItem {
  id: string; type: 'label' | 'metric'; name: string;
  color: string | null; unit: string | null; better: string | null;
  usedIn: number; projects: string[];
}

export interface DayActivity {
  date: string; total: number; created: number; completed: number; logs: number; notes: number; comments: number; commits: number; changes: number;
}
export interface ProfileProject {
  id: string; title: string; color: string; total: number; done: number; running: number;
  doneThisWeek: number; doneLastWeek: number; activity: Record<string, number>;
}
export interface ProfileStats {
  from: string; to: string; days: DayActivity[];
  totals: Record<'created' | 'completed' | 'logs' | 'notes' | 'comments' | 'commits' | 'changes', number>;
  activeDays: number;
  streak: { current: number; longest: number };
  thisWeek: { completed: number; activity: number };
  lastWeek: { completed: number; activity: number };
  onTime: { done: number; onTime: number };
  byWeekday: number[];
  projects: ProfileProject[];
}
