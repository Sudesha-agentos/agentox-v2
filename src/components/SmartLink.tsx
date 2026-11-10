import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Router link for in-app paths; a plain anchor when the target is another origin. */
export function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
