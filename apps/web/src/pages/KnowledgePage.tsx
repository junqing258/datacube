import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calculator,
  Database,
  Download,
  GitMerge,
  Search,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DataTable, PageHeading } from '../components/PageParts';
import { knowledgeTopics, readKnowledgeTopic, type KnowledgeTopic } from '../data/knowledgeCatalog';

const groups = {
  overview: { label: '主题', icon: BookOpen },
  metrics: { label: '指标', icon: Calculator },
  datasets: { label: '数据集', icon: Database },
  relationships: { label: '关联', icon: GitMerge },
};

const views = [
  { key: 'overview', label: '主题概览' },
  { key: 'metrics', label: '指标口径' },
  { key: 'datasets', label: '数据模型' },
  { key: 'relationships', label: '业务关联' },
  { key: 'document', label: '业务文档' },
] as const;

type Group = keyof typeof groups;
type View = (typeof views)[number]['key'];

interface CatalogEntry {
  topic: KnowledgeTopic;
  group: Group;
  id?: string;
  name: string;
  summary: string;
  aliases?: string[];
  keywords?: string[];
}

const entries = knowledgeTopics.flatMap<CatalogEntry>((topic) => [
  {
    topic,
    group: 'overview',
    name: topic.title,
    summary: topic.summary,
    keywords: [topic.html.replace(/<[^>]+>/g, ' '), ...(topic.catalog?.terms.flat() ?? [])],
  },
  ...(topic.catalog?.metrics.map<CatalogEntry>((metric) => ({
    topic,
    group: 'metrics',
    id: metric.id,
    name: metric.name,
    summary: metric.formula,
    aliases: metric.aliases,
    keywords: [metric.dimensions, metric.time, ...metric.rules],
  })) ?? []),
  ...(topic.catalog?.datasets.map<CatalogEntry>((dataset) => ({
    topic,
    group: 'datasets',
    id: dataset.id,
    name: dataset.name,
    summary: `${dataset.source} · ${dataset.grain}`,
    keywords: [dataset.key, dataset.time, ...dataset.fields.flat()],
  })) ?? []),
  ...(topic.catalog?.relationships.map<CatalogEntry>((relation) => ({
    topic,
    group: 'relationships',
    id: relation.id,
    name: relation.name,
    summary: `${relation.key} · ${relation.method}`,
    keywords: [relation.from, relation.to, relation.rule],
  })) ?? []),
]);

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function matchEntry(entry: CatalogEntry, query: string, words: string[]) {
  const names = [entry.name, ...(entry.aliases ?? [])].map(normalize);
  if (names.includes(query)) return 4;
  if (names.some((name) => name.includes(query) || query.includes(name))) return 3;
  const searchable = normalize([entry.summary, ...(entry.keywords ?? [])].join(' '));
  if (searchable.includes(query)) return 2;
  return words.every(
    (word) => searchable.includes(word) || names.some((name) => name.includes(word)),
  )
    ? 1
    : 0;
}

function topicLink(topic: KnowledgeTopic, params: URLSearchParams, view?: View, item?: string) {
  const next = new URLSearchParams(params);
  next.delete('view');
  next.delete('item');
  if (view && view !== 'overview') next.set('view', view);
  if (item) next.set('item', item);
  return `/knowledge/${topic.topic}/${topic.version}${next.size ? `?${next}` : ''}`;
}

function KnowledgeIndex() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const selected = params.get('type');
  const query = normalize(search);
  const group =
    selected && Object.hasOwn(groups, selected)
      ? (selected as Group)
      : query || selected === 'all'
        ? undefined
        : 'overview';
  const words = search
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalize)
    .filter(Boolean);
  const scoped = entries.filter((entry) => !group || entry.group === group);
  const visible = query
    ? scoped
        .map((entry) => ({ entry, score: matchEntry(entry, query, words) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ entry }) => entry)
    : scoped;

  function updateFilter(key: 'q' | 'type', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageHeading title="业务知识" description="查找业务术语、指标口径、数据字段和关联规则。" />
      <section className="dc-page-card mt-6" aria-label="知识检索">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            className="dc-control min-h-12 w-full pl-11 pr-12 [&::-webkit-search-cancel-button]:hidden"
            type="search"
            aria-label="搜索业务知识"
            placeholder="输入指标、字段或问法，例如：本月净销售额"
            value={search}
            onChange={(event) => updateFilter('q', event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-input text-muted hover:bg-surface-warm"
              aria-label="清空搜索"
              onClick={() => updateFilter('q', '')}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="知识类型">
          <button
            type="button"
            className={`dc-btn min-h-8 px-3 py-1.5 ${!group ? 'dc-btn-primary' : ''}`}
            aria-pressed={!group}
            onClick={() => updateFilter('type', 'all')}
          >
            全部
          </button>
          {(Object.keys(groups) as Group[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`dc-btn min-h-8 px-3 py-1.5 ${group === key ? 'dc-btn-primary' : ''}`}
              aria-pressed={group === key}
              onClick={() => updateFilter('type', key)}
            >
              {groups[key].label}
            </button>
          ))}
        </div>
      </section>
      <section className="mt-7" aria-labelledby="knowledge-results">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="knowledge-results" className="text-xl font-semibold">
            {query
              ? '搜索结果'
              : group === 'overview'
                ? '知识主题'
                : group
                  ? groups[group].label
                  : '全部知识'}
          </h2>
          <p className="text-sm text-muted" role="status">
            {visible.length} 项
          </p>
        </div>
        {visible.length ? (
          <ul className="grid gap-3 min-[1050px]:grid-cols-2">
            {visible.map(({ topic, group, id, name, summary }) => {
              const { label, icon: Icon } = groups[group];
              return (
                <li key={`${topic.topic}/${group}/${id ?? ''}`}>
                  <Link
                    to={topicLink(topic, params, group, id)}
                    className="group dc-page-card flex h-full items-start gap-3.5 transition-colors hover:border-field-border hover:bg-surface-tint"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-card bg-primary-soft text-primary">
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted">
                        {group === 'overview'
                          ? (topic.catalog?.owner ?? label)
                          : `${label} · ${topic.title}`}{' '}
                        · {topic.version}
                      </div>
                      <h3 className="mt-1 group-hover:text-link">{name}</h3>
                      <p className="mt-1.5 text-sm text-muted">{summary}</p>
                      {group === 'overview' && topic.catalog && (
                        <p className="mt-3 break-words text-xs font-medium text-body">
                          {topic.catalog.metrics.map((metric) => metric.name).join(' · ')}
                        </p>
                      )}
                    </div>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 text-muted group-hover:text-link"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="dc-page-card py-10 text-center">
            <h3>未找到匹配的知识</h3>
            <p className="mt-1.5 text-muted">试试指标别名或字段名，或切换知识类型。</p>
          </div>
        )}
      </section>
    </>
  );
}

function Facts({ values }: { values: [label: string, value: string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{label}</dt>
          <dd className="mt-1 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TopicContent({
  topic,
  view,
  params,
}: {
  topic: KnowledgeTopic;
  view: View;
  params: URLSearchParams;
}) {
  const { catalog } = topic;
  if (view === 'document' || !catalog) {
    return (
      <article className="dc-page-card dc-document max-w-4xl">
        {/* Raw HTML is disabled in the repository Markdown build. */}
        <div
          className="overflow-x-auto [&>p:first-child]:mt-0"
          dangerouslySetInnerHTML={{ __html: topic.html }}
        />
      </article>
    );
  }

  if (view === 'overview') {
    return (
      <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="dc-page-card">
          <h2>业务流程与术语</h2>
          <p className="mt-3 text-body">{catalog.workflow}</p>
          <dl className="mt-4 divide-y divide-hairline-soft border-t border-hairline-soft">
            {catalog.terms.map(([term, meaning]) => (
              <div key={term} className="py-3 last:pb-0">
                <dt className="font-semibold">{term}</dt>
                <dd className="mt-0.5 text-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="dc-page-card">
          <h2>主题指标</h2>
          <ul className="mt-3 divide-y divide-hairline-soft">
            {catalog.metrics.map((metric) => (
              <li key={metric.id} className="py-3 first:pt-0">
                <Link className="dc-btn-text" to={topicLink(topic, params, 'metrics', metric.id)}>
                  {metric.name} <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
                <p className="mt-1 text-sm text-muted">{metric.formula}</p>
              </li>
            ))}
          </ul>
          <Link className="dc-btn-text mt-3" to={topicLink(topic, params, 'document')}>
            查看常见问题与样例
          </Link>
        </section>
      </div>
    );
  }

  const { datasets } = catalog;
  const selected = catalog[view].find((entry) => entry.id === params.get('item'));
  const show = (id: string) => !selected || selected.id === id;

  function datasetLinks(ids: string[]) {
    return (
      <ul
        className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-hairline-soft pt-4"
        aria-label="相关数据集"
      >
        {datasets
          .filter(({ id }) => ids.includes(id))
          .map((dataset) => (
            <li key={dataset.id}>
              <Link className="dc-btn-text" to={topicLink(topic, params, 'datasets', dataset.id)}>
                <Database className="size-3.5" aria-hidden="true" /> {dataset.name}
              </Link>
            </li>
          ))}
      </ul>
    );
  }

  return (
    <div className="grid max-w-5xl gap-4">
      {selected && catalog[view].length > 1 && (
        <Link className="dc-btn-text justify-self-start" to={topicLink(topic, params, view)}>
          <ArrowLeft className="size-3.5" aria-hidden="true" /> 查看全部{groups[view].label}
        </Link>
      )}
      {view === 'metrics' &&
        catalog.metrics
          .filter(({ id }) => show(id))
          .map((metric) => (
            <section key={metric.id} className="dc-page-card">
              <h2>{metric.name}</h2>
              {metric.aliases && (
                <p className="mt-1 text-sm text-muted">别名 · {metric.aliases.join('、')}</p>
              )}
              <p className="mb-4 mt-3 rounded-input bg-surface-tint px-4 py-3 font-medium">
                {metric.formula}
              </p>
              <Facts
                values={[
                  ['单位', metric.unit],
                  ['支持维度', metric.dimensions],
                  ['时间口径', metric.time],
                ]}
              />
              <ul className="mt-4 list-disc space-y-1 pl-5 text-body">
                {metric.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              {datasetLinks(metric.datasets)}
            </section>
          ))}
      {view === 'datasets' &&
        catalog.datasets
          .filter(({ id }) => show(id))
          .map((dataset) => (
            <section key={dataset.id} className="dc-page-card">
              <h2 className="mb-3">{dataset.name}</h2>
              <Facts
                values={[
                  ['数据来源', dataset.source],
                  ['行粒度', dataset.grain],
                  ['唯一键或业务键', dataset.key],
                  ['时间字段', dataset.time],
                ]}
              />
              <DataTable
                headers={['示例字段', '业务含义', '类型或单位']}
                rows={dataset.fields.map(([field, meaning, type]) => [
                  <code className="break-all rounded-input bg-surface-soft px-1.5 py-0.5 font-mono">
                    {field}
                  </code>,
                  meaning,
                  type,
                ])}
              />
            </section>
          ))}
      {view === 'relationships' &&
        catalog.relationships
          .filter(({ id }) => show(id))
          .map((relation) => (
            <section key={relation.id} className="dc-page-card">
              <div className="flex flex-wrap items-center gap-2">
                <h2>{relation.name}</h2>
                <span className="dc-tag">{relation.method}</span>
              </div>
              <div className="my-4 flex flex-wrap items-center gap-2 rounded-input bg-surface-tint px-4 py-3 font-medium">
                <span>{relation.from}</span>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-label="关联至" />
                <span>{relation.to}</span>
              </div>
              <Facts
                values={[
                  ['关联键', relation.key],
                  ['匹配基数', relation.cardinality],
                  ['查询规则', relation.rule],
                ]}
              />
              {datasetLinks(relation.datasets)}
            </section>
          ))}
    </div>
  );
}

export function KnowledgePage() {
  const { topic: topicId, version } = useParams();
  const [params] = useSearchParams();
  const requestedView = params.get('view');
  const requestedItem = params.get('item');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [topicId, version, requestedView, requestedItem]);

  if (!topicId) return <KnowledgeIndex />;

  const topic = readKnowledgeTopic(topicId, version);
  const board = params.get('board');
  const returnParams = new URLSearchParams(params);
  returnParams.delete('board');
  returnParams.delete('view');
  returnParams.delete('item');
  const availableViews = topic?.catalog ? views : views.filter(({ key }) => key === 'document');
  const view =
    availableViews.find(({ key }) => key === requestedView)?.key ?? availableViews[0].key;

  return (
    <>
      <nav aria-label="返回链接" className="mb-5 flex flex-wrap items-center gap-4">
        <Link
          to={`/knowledge${returnParams.size ? `?${returnParams}` : ''}`}
          className="dc-btn-text"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> 业务知识
        </Link>
        {board && (
          <Link to={`/dashboards?${new URLSearchParams({ board })}`} className="dc-btn-text">
            返回看板
          </Link>
        )}
      </nav>
      {topic ? (
        <>
          <PageHeading title={topic.title} description={topic.summary}>
            {topic.downloadUrl && (
              <a
                className="dc-btn"
                href={topic.downloadUrl}
                download={`${topic.topic}-${topic.version}.md`}
              >
                <Download className="size-4" aria-hidden="true" /> 下载 Markdown
              </a>
            )}
          </PageHeading>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            <nav aria-label="文档版本" className="flex flex-wrap items-center gap-2">
              {topic.versions.map((item) =>
                item === topic.version ? (
                  <span key={item} className="dc-tag" aria-current="page">
                    {item}
                  </span>
                ) : (
                  <Link
                    key={item}
                    className="dc-btn-text"
                    to={topicLink({ ...topic, version: item }, params, view)}
                  >
                    {item}
                  </Link>
                ),
              )}
            </nav>
            {topic.catalog && <span>{topic.catalog.owner} · 演示数据映射</span>}
          </div>
          {availableViews.length > 1 && (
            <nav
              aria-label="知识详情"
              className="mb-5 mt-5 flex flex-wrap gap-x-2 border-b border-hairline sm:gap-x-5"
            >
              {availableViews.map(({ key, label }) => (
                <Link
                  key={key}
                  to={topicLink(topic, params, key)}
                  aria-current={key === view ? 'page' : undefined}
                  className={`border-b-2 px-1 py-2.5 font-medium ${key === view ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
          <div className={availableViews.length === 1 ? 'mt-5' : undefined}>
            <TopicContent topic={topic} view={view} params={params} />
          </div>
        </>
      ) : (
        <div className="dc-page-card max-w-4xl">
          <PageHeading
            title="口径版本暂不可用"
            description={`未找到 ${topicId} ${version ?? ''}。请核对看板引用和部署版本。`}
          />
        </div>
      )}
    </>
  );
}
