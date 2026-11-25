import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../components/PageParts';
import generated from '../../../../docs/prototype/knowledge-data.js?raw';

interface Document {
  title: string;
  summary: string;
  source: string;
  html: string;
}

// The prototype generator produces a JSON object assigned to a JavaScript constant.
const documents = JSON.parse(
  generated.slice(generated.indexOf('{'), generated.lastIndexOf('}') + 1),
) as Record<string, Record<string, Document>>;
const markdownFiles = import.meta.glob<string>('../../../../docs/knowledge/*/v*.md', {
  eager: true,
  query: '?url',
  import: 'default',
});

function sortedVersions(versions: Record<string, Document> = {}) {
  return Object.keys(versions).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
}

export function KnowledgePage() {
  const { topic, version } = useParams();
  const [query] = useSearchParams();

  if (!topic) {
    return (
      <>
        <PageHeading title="业务知识" description="查阅已部署的指标口径、使用规则和数据来源。" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 min-[1250px]:grid-cols-3">
          {Object.entries(documents).map(([id, versions]) => {
            const latest = sortedVersions(versions)[0];
            const doc = versions[latest];
            return (
              <article key={id} className="dc-page-card flex flex-col items-start gap-3">
                <span className="dc-tag">{latest}</span>
                <h2>{doc.title}</h2>
                <p className="mb-1 text-muted">{doc.summary}</p>
                <Link className="dc-btn mt-auto" to={`/knowledge/${id}/${latest}`}>
                  阅读文档 →
                </Link>
              </article>
            );
          })}
        </div>
      </>
    );
  }

  const versions = Object.hasOwn(documents, topic) ? documents[topic] : {};
  const available = sortedVersions(versions);
  const selected = version ?? available[0];
  const doc = available.includes(selected) ? versions[selected] : undefined;
  const queryString = query.size ? `?${query}` : '';
  const board = query.get('board');

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link to="/knowledge" className="dc-btn">
          ← 业务知识
        </Link>
        {board && (
          <Link to={`/dashboards?${new URLSearchParams({ board })}`} className="dc-btn">
            返回看板
          </Link>
        )}
      </div>
      <article className="dc-page-card dc-document max-w-4xl">
        {doc ? (
          <>
            <div className="dc-page-heading">
              <h1>{doc.title}</h1>
              <span className="dc-tag">{selected}</span>
            </div>
            {available.length > 1 && (
              <nav className="mt-3 flex gap-3" aria-label="文档版本">
                {available.map((item) => (
                  <Link
                    key={item}
                    className="dc-btn-text"
                    aria-current={item === selected ? 'page' : undefined}
                    to={`/knowledge/${topic}/${item}${queryString}`}
                  >
                    {item}
                  </Link>
                ))}
              </nav>
            )}
            {/* HTML comes from the repository's Markdown build, with raw HTML disabled. */}
            <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: doc.html }} />
            <p>
              <a
                className="dc-btn-text"
                href={markdownFiles[`../../../../docs/${doc.source}`]}
                download={`${topic}-${selected}.md`}
              >
                下载 Markdown 源文件
              </a>
            </p>
          </>
        ) : (
          <PageHeading
            title="口径版本暂不可用"
            description={`未找到 ${topic} ${version ?? ''}。请核对看板引用和部署版本。`}
          />
        )}
      </article>
    </>
  );
}
