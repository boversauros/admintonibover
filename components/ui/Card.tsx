import { ReactNode } from "react";
import { Link } from "./Link";

interface CardProps {
  href: string;
  as?: "article" | "div";
  className?: string;
  "aria-label"?: string;
  image?: ReactNode;
  children: ReactNode;
}

export function Card({
  href,
  as: Wrapper = "div",
  className = "",
  "aria-label": ariaLabel,
  image,
  children,
}: CardProps) {
  const cardClasses = `space-y-4 ${className}`.trim();

  return (
    <Wrapper className={cardClasses}>
      <Link href={href} className="group block" aria-label={ariaLabel}>
        {image}
        {children}
      </Link>
    </Wrapper>
  );
}
