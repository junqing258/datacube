import type { DatabaseSync } from 'node:sqlite';

const warehouses = ['华东仓', '华南仓'];
const skus = Array.from({ length: 10 }, (_, index) => `SKU-${101 + index}`);

export function seedSampleInventory(database: DatabaseSync) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const date = (offset: number) =>
    new Date(Date.parse(today) + offset * 86_400_000).toISOString().slice(0, 10);
  let seed = 20261128;
  function quantity() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 14 + ((seed >>> 16) % 102);
  }

  database.exec(`
    CREATE TABLE stock_snapshots (
      day TEXT NOT NULL,
      snapshot_at TEXT NOT NULL,
      warehouse TEXT NOT NULL,
      sku TEXT NOT NULL,
      batch TEXT NOT NULL,
      expires_on TEXT NOT NULL,
      days_to_expiry INTEGER NOT NULL,
      available_qty INTEGER NOT NULL CHECK (available_qty >= 0),
      PRIMARY KEY (snapshot_at, warehouse, sku, batch)
    );
  `);
  const insert = database.prepare('INSERT INTO stock_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  for (let offset = -44; offset <= 0; offset++) {
    const day = date(offset);
    for (const hour of offset === 0 ? ['00:00'] : ['08:00', '18:00']) {
      for (const [warehouseIndex, warehouse] of warehouses.entries()) {
        for (const [skuIndex, sku] of skus.entries()) {
          const outOfStock =
            (skuIndex + 3 * warehouseIndex - offset) % 7 === 0 || (skuIndex === 7 && offset === 0);
          for (const lot of [0, 1]) {
            const daysToExpiry = (skuIndex * 3 + warehouseIndex * 5 - offset + lot * 9) % 14;
            const expiresOn = date(offset + daysToExpiry);
            const qty = quantity() + (1 - warehouseIndex) * 26;
            const available = outOfStock || (skuIndex % 3 === 0 && lot === 0) ? 0 : qty;
            insert.run(
              day,
              `${day} ${hour}`,
              warehouse,
              sku,
              `KC-${expiresOn.replaceAll('-', '')}-${lot + 1}`,
              expiresOn,
              daysToExpiry,
              available,
            );
          }
        }
      }
    }
  }
}
