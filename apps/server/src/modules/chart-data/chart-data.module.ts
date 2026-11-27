import { Module } from '@nestjs/common';
import { DatasetsModule } from '../datasets/datasets.module';
import { ChartDataController } from './chart-data.controller';
import { ChartDataService } from './chart-data.service';

@Module({
  imports: [DatasetsModule],
  controllers: [ChartDataController],
  providers: [ChartDataService],
})
export class ChartDataModule {}
