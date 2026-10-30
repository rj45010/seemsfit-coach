export function PageHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
      <h1 className="display text-[44px] leading-[1.0] md:text-5xl">{title}</h1>
    </header>
  );
}
