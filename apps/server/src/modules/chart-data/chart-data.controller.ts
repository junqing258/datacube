import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import { ChartDataService } from './chart-data.service';
import { CurrentSession, CurrentSpace, type RequestSession } from '../auth/session.types';

@Controller('chart-data')
export class ChartDataController {
  constructor(private readonly chartData: ChartDataService) {}

  @Get('sources')
  @Header('Cache-Control', 'no-store')
  sources(@CurrentSpace() spaceId: string, @CurrentSession() session: RequestSession) {
    return this.chartData.list(spaceId, session.userId, session.role);
  }

  @Post('read')
  @Header('Cache-Control', 'no-store')
  read(
    @Body() body: unknown,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.chartData.read(spaceId, session.userId, session.role, body);
  }
}
