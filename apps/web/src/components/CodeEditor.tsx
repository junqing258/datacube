import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { sql, SQLite } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import { parseMixed } from '@lezer/common';
import { basicSetup } from 'codemirror';
import { useEffect, useRef, useState } from 'react';

const javascriptWithSql = javascriptLanguage.configure({
  wrap: parseMixed((node, input) => {
    if (node.name !== 'String' && node.name !== 'TemplateString') return null;

    const literal = node.node;
    const property = literal.parent;
    const key = property?.firstChild;
    if (property?.name !== 'Property' || !key || key.from === node.from) return null;
    const name = input.read(key.from, key.to);
    if (!['query', '"query"', "'query'"].includes(name) || literal.getChild('Interpolation')) {
      return null;
    }

    const delimiter = input.read(node.from, node.from + 1);
    if (node.to - node.from <= 2 || input.read(node.to - 1, node.to) !== delimiter) return null;

    return {
      parser: SQLite.language.parser,
      overlay: [{ from: node.from + 1, to: node.to - 1 }],
    };
  }),
});

const javascriptSupport = javascript();
const languages = {
  javascript: javascriptSupport,
  'javascript-sql': [javascriptWithSql, javascriptSupport.support],
  json: json(),
  sql: sql({ dialect: SQLite }),
};

export default function CodeEditor({
  language,
  initialCode,
  onChange,
  label,
}: {
  language: keyof typeof languages;
  initialCode: string;
  onChange: (code: string) => void;
  label: string;
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
        languages[language],
        EditorView.contentAttributes.of({
          'aria-label': label,
        }),
        EditorView.theme({
          '&': { fontSize: '13px', height: 'var(--dc-code-editor-height)' },
          '.cm-scroller': { overflow: 'auto' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });

    return () => editor.destroy();
  }, [doc, label, language, onChange]);

  return (
    <div
      ref={container}
      className="dc-code-editor min-w-0 overflow-hidden rounded-input border border-field-border"
    />
  );
}
