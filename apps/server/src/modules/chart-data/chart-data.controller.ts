import { Body, Controller, Get, Header, Headers, Post } from '@nestjs/common';
import { ChartDataService } from './chart-data.service';

@Controller('chart-data')
export class ChartDataController {
  constructor(private readonly chartData: ChartDataService) {}

  @Get('sources')
  @Header('Cache-Control', 'no-store')
  sources(@Headers('authorization') authorization?: string) {
    this.chartData.authorize(authorization);
    return this.chartData.list();
  }

  @Post('read')
  @Header('Cache-Control', 'no-store')
  read(@Body() body: unknown, @Headers('authorization') authorization?: string) {
    this.chartData.authorize(authorization);
    return this.chartData.read(body);
  }
}
