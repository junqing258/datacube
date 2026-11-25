import { useState, type FormEvent } from 'react';
import { Dialog } from '../components/PageParts';
import { type CustomChart } from '../data/customCharts';

export function NewChartDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (chart: CustomChart) => void;
}) {
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name')).trim();
    if (!name) {
      setError('请输入图表名称。');
      return;
    }

    const points: CustomChart['points'] = [];
    const rows = String(fields.get('points')).split(/\r?\n/);
    for (const [index, row] of rows.entries()) {
      if (!row.trim()) continue;
      const [label, rawValue, ...extra] = row.split(/[,，]/).map((cell) => cell.trim());
      const value = Number(rawValue);
      if (!label || !rawValue || extra.length || !Number.isFinite(value)) {
        setError(`第 ${index + 1} 行格式有误，请输入标签和一个有效数值。`);
        return;
      }
      points.push({ label, value });
    }
    if (!points.length) {
      setError('请至少输入一行数据。');
      return;
    }

    onCreate({
      id: `chart-${crypto.randomUUID()}`,
      name,
      kind: fields.get('kind') === 'bar' ? 'bar' : 'line',
      dataset: String(fields.get('dataset')).trim() || '手动录入',
      points,
    });
  }

  return (
    <Dialog title="新建图表" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="dc-field">
          图表名称
          <input className="dc-control" name="name" required maxLength={80} />
        </label>
        <label className="dc-field">
          图表类型
          <select className="dc-control" name="kind">
            <option value="line">折线图</option>
            <option value="bar">条形图</option>
          </select>
        </label>
        <label className="dc-field">
          数据来源（选填）
          <input className="dc-control" name="dataset" maxLength={120} />
        </label>
        <label className="dc-field">
          图表数据
          <textarea
            className="dc-control"
            name="points"
            rows={5}
            required
            aria-describedby="chart-data-help"
          />
          <span id="chart-data-help" className="text-muted">
            每行输入一个标签和一个数值，用逗号分隔，例如「周一, 120」。
          </span>
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="dc-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="dc-btn dc-btn-primary">
            创建并添加
          </button>
        </div>
      </form>
    </Dialog>
  );
}
