import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { MapPin, Navigation, LogIn, LogOut, User, Fuel } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, clearAuth } = useAuth();

  const navItems = [
    { href: "/", label: "Mappa", icon: MapPin },
    { href: "/route", label: "Percorso", icon: Navigation },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" data-testid="link-home">
            <div className="flex items-center gap-2 cursor-pointer">
              <svg
                viewBox="0 0 32 32"
                width="28"
                height="28"
                fill="none"
                aria-label="Fuel GPS Logo"
                className="text-primary"
              >
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" />
                <path
                  d="M16 6 L20 20 L16 18 L12 20 Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
                <path d="M8 22 Q16 26 24 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <circle cx="16" cy="16" r="2" fill="currentColor" />
              </svg>
              <span className="font-bold text-lg tracking-tight text-foreground">Fuel</span>
              <Badge variant="outline" className="text-xs font-medium text-primary border-primary/40">
                GPS
              </Badge>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Button
                  variant={location === href ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon size={15} />
                  {label}
                </Button>
              </Link>
            ))}
          </nav>

          {/* Auth */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground">
                  <User size={14} />
                  {user.username}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAuth}
                  data-testid="button-logout"
                  className="gap-1"
                >
                  <LogOut size={14} />
                  <span className="hidden sm:inline">Esci</span>
                </Button>
              </>
            ) : (
              <Link href="/auth">
                <Button size="sm" variant="outline" className="gap-1" data-testid="button-login">
                  <LogIn size={14} />
                  <span className="hidden sm:inline">Accedi</span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile bottom nav */}
        <div className="sm:hidden flex border-t border-border">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex-1">
              <button
                className={`w-full flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                  location === href
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`mobile-nav-${label.toLowerCase()}`}
              >
                <Icon size={18} />
                {label}
              </button>
            </Link>
          ))}
          {!user ? (
            <Link href="/auth" className="flex-1">
              <button
                className={`w-full flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground`}
                data-testid="mobile-nav-auth"
              >
                <LogIn size={18} />
                Accedi
              </button>
            </Link>
          ) : (
            <button
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={clearAuth}
              data-testid="mobile-nav-logout"
            >
              <LogOut size={18} />
              Esci
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border py-3 px-4 text-center text-xs text-muted-foreground">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
