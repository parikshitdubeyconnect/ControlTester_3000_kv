import type { LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { LogOut, Moon, Sun, ChevronRight, Home } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "./ThemeProvider";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

export default function HeroSection({ title, subtitle, icon: Icon, actions, breadcrumbs }: HeroSectionProps) {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = () => {
    logout();
    setLocation("/login");
  };

  const crumbs: BreadcrumbItem[] = breadcrumbs ?? [
    { label: "Home", path: "/landing" },
    { label: title },
  ];

  return (
    <div className="hero-section flex-shrink-0 animate-panel-in">
      {/* ── Breadcrumb / nav bar ── */}
      <div className="flex items-center justify-between px-7 py-2.5 border-b border-white/8">
        <nav className="flex items-center gap-1.5 text-[11px] font-medium text-white/50">
          <button
            onClick={() => setLocation("/landing")}
            className="flex items-center gap-1 hover:text-white/80 transition-colors"
          >
            <Home className="h-3 w-3" />
          </button>
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 opacity-40" />
              {crumb.path ? (
                <button
                  onClick={() => setLocation(crumb.path!)}
                  className="hover:text-white/80 transition-colors"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-white/80">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Title / icon row ── */}
      <div className="relative z-10 flex items-center gap-4 px-7 py-5">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/12 bg-white/10 shadow-[0_16px_32px_-24px_rgba(0,0,0,0.4)] flex-shrink-0">
            <Icon className="text-[#00B8F5] flex-shrink-0" style={{ width: 18, height: 18 }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="kpmg-on-dark-label text-[10px] font-bold uppercase tracking-[0.34em] mb-1">
            TRACE workspace
          </p>
          <h1 className="text-[24px] font-bold tracking-[0.01em] text-white leading-tight">{title}</h1>
          {subtitle && (
            <p className="kpmg-on-dark-copy text-[12.5px] mt-1.5 leading-6 max-w-3xl">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
