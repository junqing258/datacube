export interface CustomChart {
  id: string;
  name: string;
  kind: 'line' | 'bar';
  dataset: string;
  points: { label: string; value: number }[];
}
