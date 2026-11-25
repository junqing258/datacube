import { json } from '@codemirror/lang-json';
import { sql, SQLite } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef, useState } from 'react';

export default function CodeEditor({
  language,
  initialCode,
  onChange,
}: {
  language: 'sql' | 'json';
  initialCode: string;
  onChange: (code: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [doc] = useState(initialCode);

  useEffect(() => {
    if (!container.current) return;

    const editor = new EditorView({
      parent: container.current,
      doc,
      extensions: [
        basicSetup,
        language === 'sql' ? sql({ dialect: SQLite }) : json(),
        EditorView.contentAttributes.of({
          'aria-label': language === 'sql' ? 'SQL 查询' : 'API 请求配置',
          'aria-describedby': 'chart-code-help',
        }),
        EditorView.theme({
          '&': { fontSize: '13px' },
          '.cm-scroller': { minHeight: '7rem', maxHeight: '15rem', overflow: 'auto' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });

    return () => editor.destroy();
  }, [doc, language, onChange]);

  return (
    <div
      ref={container}
      className="min-w-0 overflow-hidden rounded-input border border-field-border"
    />
  );
}
