import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ChartDataModule } from './modules/chart-data/chart-data.module';
import { ChartsModule } from './modules/charts/charts.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { DatasetsModule } from './modules/datasets/datasets.module';
import { ExecutionsModule } from './modules/executions/executions.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    DatasetsModule,
    ChartDataModule,
    ChartsModule,
    DashboardsModule,
    ExecutionsModule,
  ],
})
export class AppModule {}
