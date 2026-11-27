import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const target =
  process.env.BUSINESS_SQLITE_PATH ?? join(process.cwd(), 'prisma', 'sample-business.db');

function day(offset: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

let seed = 20261126;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

const channels = ['微信小程序', '平台电商', '直播渠道', '其他渠道'];

rmSync(target, { force: true });
const database = new DatabaseSync(target);
database.exec(`
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    order_no TEXT NOT NULL UNIQUE,
    paid_at TEXT NOT NULL,
    paid_amount REAL NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid',
    is_test INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE refunds (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    refund_amount REAL NOT NULL,
    status TEXT NOT NULL,
    success_at TEXT
  );
`);

const insertOrder = database.prepare(
  'INSERT INTO orders (order_no, paid_at, paid_amount, channel, status, is_test) VALUES (?, ?, ?, ?, ?, ?)',
);
const insertRefund = database.prepare(
  'INSERT INTO refunds (order_id, refund_amount, status, success_at) VALUES (?, ?, ?, ?)',
);

let orderId = 0;
let refundId = 0;
for (let offset = -44; offset <= 0; offset++) {
  const paidAt = day(offset);
  const count = 6 + Math.floor(random() * 5);
  for (let index = 0; index < count; index++) {
    orderId++;
    const amount = Math.round((60 + random() * 900) * 100) / 100;
    insertOrder.run(
      `${paidAt.replaceAll('-', '')}-${String(orderId).padStart(4, '0')}`,
      paidAt,
      amount,
      channels[Math.floor(random() * channels.length)],
      index === 0 && random() < 0.3 ? 'unpaid' : 'paid',
      random() < 0.05 ? 1 : 0,
    );
    // Some orders have a successful refund; a few settle after the paid day.
    if (random() < 0.22) {
      refundId++;
      const succeeded = random() < 0.8;
      const successOffset = offset + Math.floor(random() * 4);
      insertRefund.run(
        orderId,
        Math.round(amount * (0.1 + random() * 0.5) * 100) / 100,
        succeeded ? 'succeeded' : 'pending',
        succeeded ? day(Math.min(successOffset, 0)) : null,
      );
    }
  }
}

database.exec(`
  CREATE VIEW sales_daily AS
  SELECT o.paid_at AS day,
         COUNT(*) AS order_count,
         ROUND(SUM(o.paid_amount), 2) AS paid_amount,
         ROUND(SUM(COALESCE(r.amount, 0)), 2) AS refund_amount,
         ROUND(SUM(o.paid_amount) - SUM(COALESCE(r.amount, 0)), 2) AS net_amount
  FROM orders o
  LEFT JOIN (
    SELECT order_id, SUM(refund_amount) AS amount
    FROM refunds
    WHERE status = 'succeeded'
    GROUP BY order_id
  ) r ON r.order_id = o.id
  WHERE o.status = 'paid' AND o.is_test = 0
  GROUP BY o.paid_at
  ORDER BY day;

  CREATE VIEW channel_sales_daily AS
  SELECT o.paid_at AS day,
         o.channel AS channel,
         COUNT(*) AS order_count,
         ROUND(SUM(o.paid_amount), 2) AS paid_amount,
         ROUND(SUM(COALESCE(r.amount, 0)), 2) AS refund_amount,
         ROUND(SUM(o.paid_amount) - SUM(COALESCE(r.amount, 0)), 2) AS net_amount
  FROM orders o
  LEFT JOIN (
    SELECT order_id, SUM(refund_amount) AS amount
    FROM refunds
    WHERE status = 'succeeded'
    GROUP BY order_id
  ) r ON r.order_id = o.id
  WHERE o.status = 'paid' AND o.is_test = 0
  GROUP BY o.paid_at, o.channel
  ORDER BY day, channel;

  CREATE VIEW sales_snapshot AS
  SELECT MAX(paid_at) AS data_as_of FROM orders WHERE status = 'paid' AND is_test = 0;
`);

const orders = database.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number };
const days = database.prepare('SELECT COUNT(*) AS count FROM sales_daily').get() as {
  count: number;
};
database.close();
console.log(`已生成示例业务库 ${target}`);
console.log(`订单 ${orders.count} 条，销售日汇总 ${days.count} 天。`);
