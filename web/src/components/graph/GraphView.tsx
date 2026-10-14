'use client';
import { t } from '@/lib/i18n';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider,
  useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { Network } from 'lucide-react';
import { useProjectCtx } from '@/lib/hooks';
import type { Label, TaskLite } from '@/lib/types';
import { useStatuses } from '@/lib/statuses';
import { chainOf, cn, lastLog, num } from '@/lib/utils';
import { Empty, Segmented } from '../ui';
import { StatusIcon } from '../task-bits';

type Mode = 'LR' | 'TB' | 'network';
interface NData extends Record<string, unknown> {
  task: TaskLite; labels: Label[]; sub: string; radius: number; selected: boolean; dim: boolean;
}

const W = 224, H = 70;
const radiusOf = (deg: number) => 10 + Math.min(10, deg * 2.5);

/* ---------- nodes ---------- */
function TaskNode({ data, sourcePosition, targetPosition }: NodeProps<Node<NData>>) {
  const { task, labels, sub, selected, dim } = data;
  const st = useStatuses();
  const c = st.meta(task.status).color;
  return (
    <div style={{ width: W, height: H }}
      className={cn('relative flex flex-col justify-center rounded-xl border bg-card pl-5 pr-3 shadow-card transition',
        selected ? 'border-primary ring-2 ring-primary/40' : 'hover:border-primary/60', dim && 'opacity-25')}>
      <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full" style={{ background: c }} />
      <Handle type="target" position={targetPosition ?? Position.Left} />
      <div className="flex items-center gap-2">
        <span className="relative flex h-4 w-4 flex-none items-center justify-center">
          {st.isRunning(task.status) && <span className="absolute inset-0 animate-ring rounded-full" style={{ background: c + '66' }} />}
          <StatusIcon status={task.status} size={15} />
        </span>
        <span className="truncate text-[13px] font-semibold">{task.title}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-6">
        <span className="truncate text-[11px] text-muted-fg">{sub}</span>
        <span className="ml-auto flex flex-none gap-1">
          {labels.slice(0, 4).map((l) => <span key={l.id} className="h-2 w-2 rounded-full" style={{ background: l.color }} title={l.name} />)}
        </span>
      </div>
      <Handle type="source" position={sourcePosition ?? Position.Right} />
    </div>
  );
}

function DotNode({ data }: NodeProps<Node<NData>>) {
  const { task, radius, selected, dim } = data;
  const st = useStatuses();
  const c = st.meta(task.status).color;
  const d = radius * 2;
  return (
    <div style={{ width: d, height: d }} className={cn('relative transition', dim && 'opacity-20')}>
      {st.isRunning(task.status) && <span className="absolute inset-0 animate-ring rounded-full" style={{ background: c + '88' }} />}
      <div className={cn('relative h-full w-full rounded-full border-2 border-card shadow-card', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-card')} style={{ background: c }} />
      <span className="pointer-events-none absolute left-1/2 top-full mt-1.5 w-40 -translate-x-1/2 truncate text-center text-xs font-medium">{task.title}</span>
      <Handle type="target" position={Position.Top} isConnectable={false} style={{ left: '50%', top: '50%' }} />
      <Handle type="source" position={Position.Top} isConnectable={false} style={{ left: '50%', top: '50%' }} />
    </div>
  );
}
const nodeTypes = { task: TaskNode, dot: DotNode };

/* ---------- layout ---------- */
function layout(tasks: TaskLite[], mode: Mode): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  const dir = mode === 'TB' ? 'TB' : 'LR';
  g.setGraph({ rankdir: dir, nodesep: dir === 'LR' ? 30 : 40, ranksep: 100, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(tasks.map((t) => t.id));
  tasks.forEach((t) => g.setNode(t.id, { width: W, height: H }));
  tasks.forEach((t) => t.dependsOnIds.filter((d) => ids.has(d)).forEach((d) => g.setEdge(d, t.id)));
  dagre.layout(g);
  const flow: Record<string, { x: number; y: number }> = {};
  tasks.forEach((t) => { const n = g.node(t.id); flow[t.id] = { x: n.x - W / 2, y: n.y - H / 2 }; });
  if (mode !== 'network') return flow;

  // mạng lưới: xuất phát từ bố cục dagre rồi để lực đẩy/kéo ổn định
  const deg = new Map<string, number>();
  tasks.forEach((t) => t.dependsOnIds.forEach((d) => { deg.set(t.id, (deg.get(t.id) ?? 0) + 1); deg.set(d, (deg.get(d) ?? 0) + 1); }));
  const nodes = tasks.map((t) => ({ id: t.id, x: flow[t.id].x * 0.6, y: flow[t.id].y * 1.1, r: radiusOf(deg.get(t.id) ?? 0) }));
  const links = tasks.flatMap((t) => t.dependsOnIds.filter((d) => ids.has(d)).map((d) => ({ source: d, target: t.id })));
  const sim = forceSimulation(nodes as any)
    .force('link', forceLink(links).id((n: any) => n.id).distance(130).strength(0.5))
    .force('charge', forceManyBody().strength(-420))
    .force('center', forceCenter(0, 0))
    .force('x', forceX(0).strength(0.04)).force('y', forceY(0).strength(0.06))
    .force('collide', forceCollide((n: any) => n.r + 34))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
  const out: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n) => { out[n.id] = { x: n.x - n.r, y: n.y - n.r }; });
  return out;
}

/* ---------- view ---------- */
function Inner() {
  const { project, taskId, openTask, actions } = useProjectCtx();
  const { fitView } = useReactFlow();
  const st = useStatuses();
  const [mode, setMode] = useState<Mode>('LR');
  const [hover, setHover] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NData>>([]);
  const sig = useRef('');
  const tasks = project.tasks;

  useEffect(() => {
    const s = mode + tasks.map((t) => `${t.id}:${t.dependsOnIds.join('.')}`).join('|');
    const relayout = s !== sig.current;
    sig.current = s;
    const pos = relayout ? layout(tasks, mode) : null;
    const deg = new Map<string, number>();
    tasks.forEach((t) => t.dependsOnIds.forEach((d) => { deg.set(t.id, (deg.get(t.id) ?? 0) + 1); deg.set(d, (deg.get(d) ?? 0) + 1); }));
    const m0 = project.metrics.find((m) => tasks.some((t) => lastLog(t.logs, m.id)));
    setNodes((prev) => tasks.map((t) => {
      const l = m0 ? lastLog(t.logs, m0.id) : null;
      return {
        id: t.id,
        deletable: false,
        type: mode === 'network' ? 'dot' : 'task',
        position: pos ? pos[t.id] : prev.find((n) => n.id === t.id)?.position ?? { x: 0, y: 0 },
        sourcePosition: mode === 'TB' ? Position.Bottom : Position.Right,
        targetPosition: mode === 'TB' ? Position.Top : Position.Left,
        data: {
          task: t,
          labels: t.labelIds.map((id) => project.labels.find((x) => x.id === id)).filter(Boolean) as Label[],
          sub: st.meta(t.status).name + (l && m0 ? ` · ${m0.name} ${num(l.value)}` : ''),
          radius: radiusOf(deg.get(t.id) ?? 0), selected: false, dim: false,
        },
      };
    }));
    if (relayout) setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 60);
  }, [tasks, mode, project.metrics, project.labels, setNodes, fitView]);

  // drawer mở/đóng làm đổi bề rộng khung nhìn -> vừa khung lại
  const drawerOpen = !!taskId;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(() => fitView({ padding: 0.18, duration: 300 }), 120);
    return () => clearTimeout(t);
  }, [drawerOpen, fitView]);

  const focus = hover ?? null;
  const chain = useMemo(() => (focus ? chainOf(focus, tasks) : null), [focus, tasks]);

  const shown = useMemo(() => nodes.map((n) => ({
    ...n, data: { ...n.data, selected: n.id === taskId, dim: !!chain && !chain.has(n.id) },
  })), [nodes, taskId, chain]);

  const edges: Edge[] = useMemo(() => tasks.flatMap((t) => t.dependsOnIds.map((d) => {
    const on = !!chain && chain.has(d) && chain.has(t.id);
    const color = on ? '#6366f1' : '#94a3b8';
    return {
      id: `${d}->${t.id}`, source: d, target: t.id,
      type: mode === 'network' ? 'straight' : 'default',
      animated: st.isRunning(t.status),
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      style: { stroke: color, strokeWidth: on ? 2.4 : 1.6, opacity: chain && !on ? 0.12 : 1 },
      zIndex: on ? 10 : 0,
    } as Edge;
  })), [tasks, chain, mode, st]);

  const onConnect = (c: Connection) => c.source && c.target && actions.addDep(c.target, c.source);

  if (!tasks.length)
    return <div className="p-8"><Empty icon={<Network size={24} />} title={t("Chưa có task để vẽ graph")} hint={t("Thêm task ở tab Tasks, sau đó khai báo phụ thuộc để thấy đồ thị.")} /></div>;

  return (
    <ReactFlow
      nodes={shown} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
      onConnect={onConnect} isValidConnection={(c) => c.source !== c.target}
      onEdgesDelete={(es) => es.forEach((e) => actions.removeDep(e.target, e.source))}
      onNodeClick={(_, n) => openTask(n.id)}
      onNodeMouseEnter={(_, n) => setHover(n.id)} onNodeMouseLeave={() => setHover(null)}
      onPaneClick={() => openTask(null)}
      minZoom={0.2} maxZoom={2} fitView proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="hsl(var(--border))" />
      <Controls showInteractive={false} position="top-right" />
      {tasks.length > 12 && <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => st.meta((n.data as NData).task.status).color} maskColor="hsl(var(--bg) / .7)" />}
      <Panel position="top-left">
        <div className="flex items-center gap-3">
          <Segmented<Mode> value={mode} onChange={setMode}
            options={[{ value: 'LR', label: t("Luồng →") }, { value: 'TB', label: t("Luồng ↓") }, { value: 'network', label: t("Mạng lưới") }]} />
          <button onClick={() => fitView({ padding: 0.18, duration: 350 })} className="rounded-lg border bg-card px-3 py-1.5 text-xs font-medium shadow-card hover:bg-muted">{t("Vừa khung")}</button>
        </div>
      </Panel>
      <Panel position="bottom-left">
        <div className="max-w-md rounded-xl border bg-card px-3.5 py-2.5 text-xs shadow-card">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {st.list.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
            ))}
          </div>
          <p className="mt-1.5 text-muted-fg">{t("Mũi tên A → B nghĩa là B phụ thuộc A. Kéo từ chấm bên phải node này sang node kia để tạo phụ thuộc; chọn đường nối rồi nhấn Backspace để xóa.")}</p>
        </div>
      </Panel>
    </ReactFlow>
  );
}

export default function GraphView() {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider><Inner /></ReactFlowProvider>
    </div>
  );
}
