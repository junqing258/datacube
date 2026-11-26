import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChartDataController } from './modules/chart-data/chart-data.controller';
import { ChartDataService } from './modules/chart-data/chart-data.service';
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
    HealthModule,
  ],
  controllers: [ChartDataController],
  providers: [ChartDataService],
})
export class AppModule {}
