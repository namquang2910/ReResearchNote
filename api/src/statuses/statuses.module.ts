import { Body, Controller, Delete, Get, Global, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth';
import { CreateStatusDto, ReorderStatusesDto, StatusesService, UpdateStatusDto } from './statuses.service';

@Controller('statuses')
export class StatusesController {
  constructor(private s: StatusesService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.s.list(u.id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateStatusDto) { return this.s.create(u.id, dto); }
  @Post('reorder') reorder(@CurrentUser() u: AuthUser, @Body() dto: ReorderStatusesDto) { return this.s.reorder(u.id, dto.ids); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) { return this.s.update(u.id, id, dto); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('moveTo') moveTo?: string) { return this.s.remove(u.id, id, moveTo); }
}

@Global()
@Module({ controllers: [StatusesController], providers: [StatusesService], exports: [StatusesService] })
export class StatusesModule {}
