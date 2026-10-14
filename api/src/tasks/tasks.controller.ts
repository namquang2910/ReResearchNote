import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth';
import { TasksService } from './tasks.service';
import * as D from './dto';

@Controller()
export class TasksController {
  constructor(private s: TasksService) {}

  @Post('projects/:projectId/tasks/bulk')
  bulk(@CurrentUser() u: AuthUser, @Param('projectId') pid: string, @Body() dto: D.BulkTasksDto) { return this.s.bulkCreate(u.id, pid, dto); }
  @Post('projects/:projectId/tasks')
  create(@CurrentUser() u: AuthUser, @Param('projectId') pid: string, @Body() dto: D.CreateTaskDto) { return this.s.create(u.id, pid, dto); }
  @Get('tasks/:id/logs')
  logs(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('metricId') metricId?: string, @Query('offset') offset?: string, @Query('limit') limit?: string) {
    return this.s.logsPage(u.id, id, metricId || undefined, parseInt(offset ?? '0', 10) || 0, parseInt(limit ?? '50', 10) || 50);
  }
  @Get('tasks/:id') detail(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.detail(u.id, id); }
  @Patch('tasks/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.UpdateTaskDto) { return this.s.update(u.id, id, dto); }
  @Delete('tasks/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.remove(u.id, id); }

  @Put('tasks/:id/labels') setLabels(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.SetLabelsDto) { return this.s.setLabels(u.id, id, dto.ids); }
  @Post('tasks/:id/deps') addDep(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.AddDepDto) { return this.s.addDep(u.id, id, dto.dependsOnId); }
  @Delete('tasks/:id/deps/:depId') removeDep(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('depId') depId: string) { return this.s.removeDep(u.id, id, depId); }

  // logs | changes | commits | comments | notes
  @Post('tasks/:id/:kind') addItem(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('kind') kind: string, @Body() body: any) { return this.s.addItem(u.id, id, kind, body); }
  @Patch('items/:kind/:id') updateItem(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Param('id') id: string, @Body() body: any) { return this.s.updateItem(u.id, kind, id, body); }
  @Delete('items/:kind/:id') removeItem(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Param('id') id: string) { return this.s.removeItem(u.id, kind, id); }
}
