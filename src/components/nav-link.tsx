"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Highlights the section you are actually in. Sits on the gradient header. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // /dashboard must not light up for every child route, but /dashboard/usage
  // should stay lit while on it.
  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-brand-deep shadow-sm"
          : "text-white/80 hover:bg-white/15 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
