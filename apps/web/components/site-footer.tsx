import Link from "next/link";

const footerLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/status", label: "Status" },
  { href: "/support", label: "Support" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-black/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10 pb-24 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-white/50">
          © {new Date().getFullYear()} Goguma Chat. All rights reserved.
        </p>
        <nav className="flex flex-wrap items-center gap-4">
          {footerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
