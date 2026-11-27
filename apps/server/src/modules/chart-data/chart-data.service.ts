import { Injectable } from '@nestjs/common';
import { DatasetsService } from '../datasets/datasets.service';

/**
 * Browser-side JS chart transforms still read data through this route.
 * The access token was replaced by the browser session; the dataset catalog
 * and permissions now come from the platform database.
 */
@Injectable()
export class ChartDataService {
  constructor(private readonly datasets: DatasetsService) {}

  list(spaceId: string, userId: string, role: string | null) {
    return this.datasets.list(spaceId, userId, role);
  }

  read(spaceId: string, userId: string, role: string | null, body: unknown) {
    return this.datasets.read(spaceId, userId, role, body);
  }
}
