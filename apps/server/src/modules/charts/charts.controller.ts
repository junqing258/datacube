import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { CurrentSession, CurrentSpace, type RequestSession } from '../auth/session.types';

@Controller('charts')
export class ChartsController {
  constructor(private readonly charts: ChartsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentSpace() spaceId: string, @Query('archived') archived?: string) {
    return this.charts.list(spaceId, archived === '1' || archived === 'true');
  }

  @Post()
  create(
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.charts.create(session, spaceId, body);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @CurrentSpace() spaceId: string) {
    return this.charts.detail(spaceId, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.charts.update(session, spaceId, id, body);
  }
}
