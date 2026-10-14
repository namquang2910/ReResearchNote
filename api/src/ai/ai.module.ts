import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import Anthropic from '@anthropic-ai/sdk';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../prisma/prisma.module';
import { StatusesService } from '../statuses/statuses.service';
import { DraftTask, extractDate, iso, parseByRules, RuleCtx } from './rules';

type Provider = 'anthropic' | 'ollama' | 'none';

const ollamaHost = () => (process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, '');
const ollamaModel = () => process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
const anthropicModel = () => process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';
const dailyLimit = () => Math.max(0, parseInt(process.env.AI_DAILY_LIMIT ?? '20', 10) || 0);
const today = () => new Date().toISOString().slice(0, 10);

export class ParseTasksDto {
  @IsString() projectId: string;
  @IsString() @MinLength(1) @MaxLength(8000) text: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsIn(['ai', 'rules']) mode?: 'ai' | 'rules';
}

const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string' },
          due: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'status', 'due', 'labels', 'dependsOn'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
};

@Injectable()
export class AiService {
  private anthropic?: Anthropic;

  constructor(private prisma: PrismaService, private statuses: StatusesService, private access: AccessService) {}

  private async ollamaReachable() {
    try { return (await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
  }

  async provider(): Promise<Provider> {
    const want = (process.env.AI_PROVIDER ?? 'auto').toLowerCase();
    if (want === 'none') return 'none';
    if (want === 'anthropic') return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none';
    if (want === 'ollama') return 'ollama';
    // auto
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    return (await this.ollamaReachable()) ? 'ollama' : 'none';
  }

  private client() {
    this.anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
    return this.anthropic;
  }

  private async usage(userId: string) {
    const row = await this.prisma.aiUsage.findUnique({ where: { userId_day: { userId, day: today() } } });
    return { used: row?.count ?? 0, limit: dailyLimit() };
  }

  async info(userId: string) {
    const provider = await this.provider();
    if (provider === 'anthropic') {
      return { provider, available: true, models: [anthropicModel()], default: anthropicModel(), quota: await this.usage(userId) };
    }
    if (provider === 'ollama') {
      try {
        const j: any = await (await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(3000) })).json();
        const list = (j.models ?? []).map((m: any) => m.name as string).filter((n: string) => !/embed/i.test(n));
        return { provider, available: true, models: list, default: list.includes(ollamaModel()) ? ollamaModel() : list[0] ?? ollamaModel(), quota: null };
      } catch { /* rơi xuống không khả dụng */ }
    }
    return { provider: 'none' as Provider, available: false, models: [] as string[], default: '', quota: null };
  }

  /** Tăng bộ đếm; nếu vượt hạn mức thì hoàn lại và trả false. */
  private async consume(userId: string) {
    const limit = dailyLimit();
    const row = await this.prisma.aiUsage.upsert({
      where: { userId_day: { userId, day: today() } },
      create: { userId, day: today(), count: 1 },
      update: { count: { increment: 1 } },
    });
    if (row.count > limit) {
      await this.prisma.aiUsage.update({ where: { id: row.id }, data: { count: { decrement: 1 } } });
      return false;
    }
    return true;
  }
  private async refund(userId: string) {
    await this.prisma.aiUsage.updateMany({ where: { userId, day: today(), count: { gt: 0 } }, data: { count: { decrement: 1 } } });
  }

  async parse(userId: string, dto: ParseTasksDto) {
    await this.access.project(userId, dto.projectId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: dto.projectId },
      include: { labels: true, metrics: { orderBy: { order: 'asc' } }, tasks: { select: { title: true, status: true } } },
    });
    const statuses = await this.statuses.list(userId);
    const now = new Date();
    const ctx: RuleCtx = {
      today: now,
      todoKey: statuses.find((s) => s.kind === 'todo')?.key ?? 'todo',
      runningKey: statuses.find((s) => s.kind === 'running')?.key,
      blockedKey: statuses.find((s) => s.kind === 'blocked')?.key,
      doneKey: statuses.find((s) => s.kind === 'done')?.key ?? 'done',
      taskTitles: project.tasks.map((t) => t.title),
    };
    const text = dto.text.trim();
    if (text.length > 8000) throw new BadRequestException('Văn bản quá dài (tối đa 8000 ký tự)');
    const keys = statuses.map((s) => s.key);

    const viaRules = (note?: string) => ({
      source: 'rules' as const, model: null as string | null, note, quota: null as { used: number; limit: number } | null,
      tasks: this.normalize(parseByRules(text, ctx), ctx, keys),
    });
    if (dto.mode === 'rules') return viaRules();

    const provider = await this.provider();
    if (provider === 'none') return viaRules('AI chưa được cấu hình trên máy chủ — đã dùng bộ tách theo luật đơn giản.');

    let charged = false;
    if (provider === 'anthropic') {
      if (!(await this.consume(userId))) {
        return viaRules(`Bạn đã dùng hết ${dailyLimit()} lượt AI hôm nay — đã dùng bộ tách theo luật đơn giản.`);
      }
      charged = true;
    }

    const weekday = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][now.getDay()];
    const system = this.systemPrompt(ctx, statuses, project.labels.map((l) => l.name));
    const user = [
      `Today: ${iso(now)} (${weekday}).`,
      `Project: ${project.title}${project.description ? ' - ' + project.description : ''}`,
      `Existing tasks: ${project.tasks.slice(0, 60).map((t) => `"${t.title}"`).join(', ') || '(none)'}`,
      '', 'Text:', text,
    ].join('\n');

    try {
      const raw = provider === 'anthropic' ? await this.callAnthropic(system, user) : await this.callOllama(system, user, dto.model || (await this.info(userId)).default);
      const parsed = JSON.parse(raw || '{}');
      const tasks = this.normalize(Array.isArray(parsed.tasks) ? parsed.tasks : [], ctx, keys);
      if (!tasks.length) {
        if (charged) await this.refund(userId);
        return viaRules('AI không tách được task nào, đã dùng bộ tách theo dòng.');
      }
      return {
        source: 'ai' as const, model: provider === 'anthropic' ? anthropicModel() : dto.model || ollamaModel(),
        note: undefined as string | undefined, tasks, quota: provider === 'anthropic' ? await this.usage(userId) : null,
      };
    } catch (e: any) {
      if (charged) await this.refund(userId);
      const msg = String(e?.message ?? e);
      const why = e?.name === 'TimeoutError' || /timed? ?out/i.test(msg) ? 'AI phản hồi quá lâu'
        : /fetch failed|ECONNREFUSED/i.test(msg + String(e?.cause ?? '')) ? 'Không kết nối được Ollama (đã chạy `ollama serve` chưa?)'
        : `Lỗi AI: ${msg.slice(0, 160)}`;
      return viaRules(`${why} — đã dùng bộ tách theo luật đơn giản.`);
    }
  }

  private systemPrompt(ctx: RuleCtx, statuses: { key: string; name: string }[], labelNames: string[]) {
    return [
      'You turn free-form research notes (meeting notes, to-do lists, chat) into a list of tasks. Reply with JSON only.',
      'Rules:',
      '- One actionable thing = one task. Do not invent tasks that are not in the text. Do not merge unrelated things.',
      '- title: short, imperative, 3-10 words. IMPORTANT: write it in the SAME language as the input text. If the text is Vietnamese the title MUST be Vietnamese. Never translate. Do not put the deadline or the owner in the title.',
      '- description: extra detail from the text (numbers, owner, constraints) or an empty string.',
      `- status: one of these keys, default "${ctx.todoKey}": ${statuses.map((s) => `"${s.key}" (${s.name})`).join(', ')}.`,
      '- due: copy the EXACT words from the text that give this task\'s deadline (for example "thứ sáu", "ngày mai", "tuần sau", "25/12", "in 3 days"). Do NOT convert to a date. Empty string if the text gives no deadline for this task. A phrase about when a meeting happened is not a deadline.',
      `- labels: reuse existing labels when relevant: ${labelNames.map((l) => `"${l}"`).join(', ') || '(none exist)'}. Only invent a new label if the text explicitly tags the task (like #tag). Usually empty. At most 3.`,
      '- dependsOn: titles of tasks that must finish first, ONLY when the text explicitly says order or dependency ("sau đó", "khi ... xong thì", "then", "after"). Use the exact title of a task from this list or from an earlier new task. Otherwise an empty array.',
    ].join('\n');
  }

  private async callAnthropic(system: string, user: string): Promise<string> {
    const res: any = await this.client().messages.create({
      model: anthropicModel(),
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    } as any);
    if (res.stop_reason === 'refusal') throw new Error('AI từ chối yêu cầu này');
    if (res.stop_reason === 'max_tokens') throw new Error('Kết quả AI bị cắt do quá dài');
    return (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  private async callOllama(system: string, user: string, model: string): Promise<string> {
    const res = await fetch(`${ollamaHost()}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model, stream: false, format: SCHEMA, options: { temperature: 0.1, num_predict: 2048 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as any).message?.content ?? '';
  }

  /** Quy đổi cụm từ chỉ hạn (hoặc ISO) thành YYYY-MM-DD ở server — model nhỏ tính ngày không đáng tin. */
  private resolveDue(phrase: string, base: Date): string | null {
    const p = phrase.trim();
    if (!p) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    const { date } = extractDate(p, base);
    return date ? iso(date) : null;
  }

  private normalize(raw: any[], ctx: RuleCtx, keys: string[]): DraftTask[] {
    const strs = (v: any) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : []);
    return raw
      .map((t): DraftTask => ({
        title: String(t?.title ?? '').trim().slice(0, 200),
        description: String(t?.description ?? '').trim().slice(0, 2000),
        status: keys.includes(t?.status) ? t.status : ctx.todoKey,
        dueDate: this.resolveDue(String(t?.due ?? t?.dueDate ?? ''), ctx.today),
        labels: [...new Set(strs(t?.labels))].slice(0, 5),
        dependsOn: [...new Set(strs(t?.dependsOn))].slice(0, 8),
      }))
      .filter((t) => t.title.length > 0)
      .slice(0, 40);
  }
}

@Controller('ai')
export class AiController {
  constructor(private s: AiService) {}
  @Get('models') models(@CurrentUser() u: AuthUser) { return this.s.info(u.id); }

  /** Giới hạn tốc độ riêng: gọi LLM tốn tiền/tài nguyên. */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('parse-tasks') parse(@CurrentUser() u: AuthUser, @Body() dto: ParseTasksDto) { return this.s.parse(u.id, dto); }
}

@Module({ controllers: [AiController], providers: [AiService] })
export class AiModule {}
