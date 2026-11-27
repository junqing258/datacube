import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { CurrentSession, CurrentSpace, type RequestSession } from '../auth/session.types';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentSpace() spaceId: string, @CurrentSession() session: RequestSession) {
    return this.dashboards.list(spaceId, session);
  }

  @Post()
  create(
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.create(session, spaceId, body);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(
    @Param('id') id: string,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.detail(spaceId, session, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.update(spaceId, session, id, body);
  }

  @Post(':id/cards')
  addCard(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.addCard(spaceId, session, id, body);
  }

  @Patch(':id/cards/:cardId')
  updateCard(
    @Param('id') id: string,
    @Param('cardId') cardId: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.updateCard(spaceId, session, id, cardId, body);
  }

  @Delete(':id/cards/:cardId')
  removeCard(
    @Param('id') id: string,
    @Param('cardId') cardId: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.removeCard(spaceId, session, id, cardId, body);
  }

  @Patch(':id/card-layout')
  layout(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.layout(spaceId, session, id, body);
  }

  @Post(':id/copies')
  copy(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.copy(spaceId, session, id, body);
  }

  @Put(':id/favorite')
  favorite(
    @Param('id') id: string,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.favorite(spaceId, session, id, true);
  }

  @Delete(':id/favorite')
  unfavorite(
    @Param('id') id: string,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.dashboards.favorite(spaceId, session, id, false);
  }
}
