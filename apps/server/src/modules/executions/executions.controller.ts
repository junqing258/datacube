import { Body, Controller, Get, Header, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExecutionsService } from './executions.service';
import { CurrentSession, CurrentSpace, type RequestSession } from '../auth/session.types';

@Controller()
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post('charts/:id/executions')
  @HttpCode(202)
  create(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.executions.create(session, spaceId, id, body);
  }

  @Get('query-executions/:id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string, @CurrentSpace() spaceId: string) {
    return this.executions.get(spaceId, id);
  }

  @Get('query-executions/:id/result')
  @Header('Cache-Control', 'no-store')
  result(
    @Param('id') id: string,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.executions.result(session, spaceId, id);
  }

  @Get('query-executions/:id/result/download')
  async download(
    @Param('id') id: string,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
    @Res() res: Response,
  ) {
    const { columns, rows } = await this.executions.download(session, spaceId, id);
    const csv = this.executions.toCsv(columns, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="query-${encodeURIComponent(id)}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }
}
