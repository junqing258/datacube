import { useEffect, useRef, type ReactNode } from 'react';

export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="dc-page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="dc-table-scroll">
      <table className="dc-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>暂无记录。</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={className ? `dc-dialog ${className}` : 'dc-dialog'}
      aria-labelledby="dialog-title"
      onCancel={onClose}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="dc-btn" aria-label="关闭" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
