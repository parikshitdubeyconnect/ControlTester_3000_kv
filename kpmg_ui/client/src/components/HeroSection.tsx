import type { LucideIcon } from "lucide-react";

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

// AppLayout now renders the TraceNavBar globally for every page.
// HeroSection is kept as a no-op for backward compatibility so pages still
// importing/using <HeroSection ... /> don't break. If a page needs to render
// its own page-level action bar, do it inline rather than via this component.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function HeroSection(_props: HeroSectionProps) {
  return null;
}
