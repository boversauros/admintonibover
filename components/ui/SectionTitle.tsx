import { ReactNode } from "react";
import { Heading } from "./Heading";

interface SectionTitleProps {
  className?: string;
  children: ReactNode;
}

export function SectionTitle({ className = "", children }: SectionTitleProps) {
  return (
    <Heading as="h2" size="xl" variant="secondary" italic className={className}>
      {children}
    </Heading>
  );
}
