import { Link } from 'react-router-dom';

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h1 className="font-display text-[clamp(30px,3.5vw,44px)] font-normal leading-[1.18] tracking-[-0.035em]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] text-body">{description}</p>
      <section className="dc-card mt-7 max-w-[920px] p-6">
        <h2 className="text-[21px] font-semibold leading-[1.35]">页面建设中</h2>
        <p className="mt-2 text-sm text-muted">该页面尚未实现，当前版本先交付首页样式。</p>
        <Link to="/" className="dc-btn dc-btn-primary mt-5">
          返回首页
        </Link>
      </section>
    </>
  );
}
