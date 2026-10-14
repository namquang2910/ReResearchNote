import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth';
import { ProjectsService } from './projects.service';
import * as D from './dto';

@Controller()
export class ProjectsController {
  constructor(private s: ProjectsService) {}

  @Get('projects') list(@CurrentUser() u: AuthUser) { return this.s.list(u.id); }
  @Post('projects') create(@CurrentUser() u: AuthUser, @Body() dto: D.CreateProjectDto) { return this.s.create(u.id, dto); }
  @Post('projects/sample') sample(@CurrentUser() u: AuthUser, @Query('lang') lang?: string) { return this.s.sample(u.id, lang === 'en' ? 'en' : 'vi'); }
  @Get('projects/:id') overview(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.overview(u.id, id); }
  @Get('projects/:id/notes') notes(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.s.notes(u.id, id, cursor, limit ? parseInt(limit, 10) : undefined); }
  @Patch('projects/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.UpdateProjectDto) { return this.s.update(u.id, id, dto); }
  @Delete('projects/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.remove(u.id, id); }

  @Post('projects/:id/metrics') addMetric(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.CreateMetricDto) { return this.s.addMetric(u.id, id, dto); }
  @Post('projects/:id/metrics/reorder') reorder(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.ReorderDto) { return this.s.reorderMetrics(u.id, id, dto.ids); }
  @Patch('metrics/:id') updateMetric(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.UpdateMetricDto) { return this.s.updateMetric(u.id, id, dto); }
  @Delete('metrics/:id') removeMetric(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.removeMetric(u.id, id); }

  @Post('projects/:id/labels') addLabel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.CreateLabelDto) { return this.s.addLabel(u.id, id, dto); }
  @Patch('labels/:id') updateLabel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: D.UpdateLabelDto) { return this.s.updateLabel(u.id, id, dto); }
  @Delete('labels/:id') removeLabel(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.removeLabel(u.id, id); }
}
