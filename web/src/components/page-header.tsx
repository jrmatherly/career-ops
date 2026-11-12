/** The one page title: the nav label, a short description, actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <h1 className="font-display text-3xl tracking-tight text-landing">{title}</h1>
        {description && <p className="mt-1.5 max-w-prose text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
