type MarketingPageShellProps = {
  sections?: number;
  itemsPerSection?: number;
};

const DEFAULT_SECTIONS = 3;
const DEFAULT_ITEMS = 3;

export default function MarketingPageShell({
  sections = DEFAULT_SECTIONS,
  itemsPerSection = DEFAULT_ITEMS,
}: MarketingPageShellProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8">
      <div className="space-y-3">
        <div className="h-8 w-2/3 rounded-full bg-white/[0.08]" />
        <div className="h-4 w-11/12 rounded-full bg-white/[0.08]" />
        <div className="h-4 w-5/6 rounded-full bg-white/[0.08]" />
      </div>
      <div className="space-y-4 pt-2">
        {Array.from({ length: sections }).map((_, sectionIndex) => (
          <div
            key={`marketing-shell-section-${sectionIndex}`}
            className="rounded-2xl border border-white/10 bg-black/40 p-4"
          >
            <div className="h-5 w-1/3 rounded-full bg-white/[0.08]" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: itemsPerSection }).map((__, itemIndex) => (
                <div
                  key={`marketing-shell-section-${sectionIndex}-item-${itemIndex}`}
                  className="h-3 w-full rounded-full bg-white/[0.08]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
