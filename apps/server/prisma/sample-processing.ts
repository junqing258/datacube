import type { DatabaseSync } from 'node:sqlite';

const warehouses = ['华东仓', '华南仓', '华北仓'];

export function seedSampleProcessing(database: DatabaseSync) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const day = (offset: number) =>
    new Date(Date.parse(today) + offset * 86_400_000).toISOString().slice(0, 10);
  let seed = 20261127;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  }

  database.exec(`
    CREATE TABLE production_orders (
      warehouse TEXT NOT NULL,
      batch TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      input_kg INTEGER NOT NULL,
      waste_kg INTEGER NOT NULL,
      qualified_kg INTEGER NOT NULL
    );
    CREATE TABLE warehouse_receipts (
      warehouse TEXT NOT NULL,
      batch TEXT NOT NULL,
      status TEXT NOT NULL,
      confirmed_at TEXT,
      received_kg INTEGER NOT NULL
    );
    CREATE TABLE processing_batches (
      warehouse TEXT NOT NULL,
      batch TEXT NOT NULL,
      day TEXT NOT NULL,
      completed_at TEXT,
      confirmed_at TEXT,
      input_kg INTEGER,
      waste_kg INTEGER,
      qualified_kg INTEGER,
      received_kg INTEGER,
      gap_kg INTEGER,
      receipt_status TEXT NOT NULL,
      PRIMARY KEY (warehouse, batch)
    );
  `);

  const production = database.prepare('INSERT INTO production_orders VALUES (?, ?, ?, ?, ?, ?)');
  const receipt = database.prepare('INSERT INTO warehouse_receipts VALUES (?, ?, ?, ?, ?)');
  for (let offset = -44; offset <= 0; offset++) {
    const completed = day(offset);
    const receivedDay = day(Math.min(0, offset + 1));
    for (const [index, warehouse] of warehouses.entries()) {
      const batch = `JG-${completed.replaceAll('-', '')}`;
      const scenario = (-offset * warehouses.length + index) % 23;
      const input = scenario === 2 ? 0 : 180 + Math.floor(random() * 850);
      const waste = Math.round(input * (0.015 + index * 0.012 + random() * 0.055));
      const qualified = input - waste;

      if (scenario !== 1) {
        const firstInput = Math.floor(input * 0.55);
        const firstWaste = Math.floor(waste * 0.55);
        production.run(
          warehouse,
          batch,
          `${completed} 10:00`,
          firstInput,
          firstWaste,
          firstInput - firstWaste,
        );
        production.run(
          warehouse,
          batch,
          `${completed} 14:30`,
          input - firstInput,
          waste - firstWaste,
          qualified - (firstInput - firstWaste),
        );
      }
      if (scenario === 0) {
        receipt.run(warehouse, batch, 'pending', null, qualified);
        continue;
      }
      const gap =
        scenario === 3 || scenario === 4
          ? -8 - Math.floor(random() * 30)
          : scenario < 9 && scenario !== 2
            ? 5 + Math.floor(random() * 40)
            : 0;
      const received = qualified - gap;
      const firstReceipt = Math.floor(received * 0.6);
      receipt.run(warehouse, batch, 'confirmed', `${completed} 16:20`, firstReceipt);
      receipt.run(warehouse, batch, 'confirmed', `${receivedDay} 17:40`, received - firstReceipt);
    }
  }

  database.exec(`
    INSERT INTO processing_batches
    WITH erp AS (
      SELECT warehouse, batch, MAX(completed_at) AS completed_at,
             SUM(input_kg) AS input_kg, SUM(waste_kg) AS waste_kg,
             SUM(qualified_kg) AS qualified_kg
      FROM production_orders
      GROUP BY warehouse, batch
    ),
    wms AS (
      SELECT warehouse, batch, MAX(confirmed_at) AS confirmed_at, SUM(received_kg) AS received_kg
      FROM warehouse_receipts
      WHERE status = 'confirmed'
      GROUP BY warehouse, batch
    ),
    batch_keys AS (
      SELECT warehouse, batch FROM erp
      UNION
      SELECT warehouse, batch FROM wms
    )
    SELECT k.warehouse, k.batch, SUBSTR(COALESCE(e.completed_at, w.confirmed_at), 1, 10),
           e.completed_at, w.confirmed_at, e.input_kg, e.waste_kg, e.qualified_kg, w.received_kg,
           e.qualified_kg - w.received_kg,
           CASE
             WHEN e.batch IS NULL THEN '缺 ERP 完工'
             WHEN w.batch IS NULL THEN '缺 WMS 确认'
             WHEN e.qualified_kg > w.received_kg THEN '入库少于产出'
             WHEN e.qualified_kg < w.received_kg THEN '入库多于产出'
             ELSE '重量一致'
           END
    FROM batch_keys k
    LEFT JOIN erp e ON e.warehouse = k.warehouse AND e.batch = k.batch
    LEFT JOIN wms w ON w.warehouse = k.warehouse AND w.batch = k.batch;
  `);
}
