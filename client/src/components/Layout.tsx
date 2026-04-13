import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Map,
  Navigation,
  Settings,
  LogIn,
  LogOut,
  User,
  Sun,
  Moon,
  Fuel,
  Info,
} from "lucide-react";
import { useState, useEffect } from "react";

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    setDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-8 w-8"
      aria-label={dark ? "Modalità chiara" : "Modalità scura"}
      data-testid="button-theme-toggle"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, clearAuth } = useAuth();

  const navItems = [
    { href: "/", label: "Mappa", icon: Map },
    { href: "/route", label: "Percorso", icon: Navigation },
    { href: "/settings", label: "Veicoli", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top navbar */}
      <header className="flex-shrink-0 h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-3 gap-3 z-50">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-2 flex-shrink-0">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Fuel size={16} className="text-primary-foreground" />
          </div>
          <span className="font-bold text-sm tracking-tight hidden sm:block">
            FuelGPS
          </span>
        </Link>

        {/* Nav tabs */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Right side */}
        <ThemeToggle />

        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {user.username}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={clearAuth}
              data-testid="button-logout"
            >
              <LogOut size={15} />
            </Button>
          </div>
        ) : (
          <Link href="/auth">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              data-testid="button-login"
            >
              <LogIn size={13} />
              <span className="hidden sm:inline">Accedi</span>
            </Button>
          </Link>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
