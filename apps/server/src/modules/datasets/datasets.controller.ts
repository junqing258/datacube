import { Controller, Get, Header, Param } from '@nestjs/common';
import { DatasetsService } from './datasets.service';
import { CurrentSession, CurrentSpace, type RequestSession } from '../auth/session.types';

@Controller('datasets')
export class DatasetsController {
  constructor(private readonly datasets: DatasetsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentSpace() spaceId: string, @CurrentSession() session: RequestSession) {
    return this.datasets.list(spaceId, session.userId, session.role);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(
    @Param('id') id: string,
    @CurrentSpace() spaceId: string,
    @CurrentSession() session: RequestSession,
  ) {
    return this.datasets.detail(spaceId, session.userId, session.role, id);
  }
}
