"use client";

import { useState, memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, LogOut, Settings, FolderKey, Key, LockOpen, Menu, X, Users, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VaultProvider } from "./vault-provider";
import { useVaultStore } from "@/stores/vault-store";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { SearchCommand } from "./search-command";
import { KeyboardShortcutsHelp } from "./keyboard-shortcuts-help";

interface DashboardShellProps {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
  projects?: Array<{ id: string; name: string }>;
  pendingInviteCount?: number;
}

export function DashboardShell({ children, user, projects = [], pendingInviteCount = 0 }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Mobile header */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hover:bg-primary/10"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
            <Lock className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold">SecretBox</span>
        </div>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        user={user}
        projects={projects}
        pendingInviteCount={pendingInviteCount}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-16 md:pt-0">
        <VaultProvider>
          <div className="container mx-auto p-4 md:p-6 lg:p-8">{children}</div>
        </VaultProvider>
      </main>

      {/* Global keyboard shortcuts help */}
      <KeyboardShortcutsHelp />
    </div>
  );
}

const Sidebar = memo(function Sidebar({
  user,
  projects,
  pendingInviteCount,
  isOpen,
  onClose,
}: {
  user: { name?: string | null; email?: string | null };
  projects: Array<{ id: string; name: string }>;
  pendingInviteCount: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const isUnlocked = useVaultStore((state) => state.isUnlocked);
  const lock = useVaultStore((state) => state.lock);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 border-r bg-background shadow-lg transition-transform duration-300 md:static md:translate-x-0 md:shadow-none",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between gap-2 border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2 transition-transform hover:scale-105">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary">
              <Lock className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">SecretBox</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden hover:bg-destructive/10 hover:text-destructive"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="border-b p-4">
          <SearchCommand projects={projects} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          <NavLink
            href="/dashboard"
            icon={<FolderKey className="h-4 w-4" />}
            isActive={pathname === "/dashboard"}
            onClick={onClose}
            iconBg="bg-primary/10 text-primary"
          >
            Projects
          </NavLink>
          <NavLink
            href="/dashboard/globals"
            icon={<Key className="h-4 w-4" />}
            isActive={pathname === "/dashboard/globals"}
            onClick={onClose}
            iconBg="bg-purple-500/10 text-purple-600 dark:text-purple-400"
          >
            Global Variables
          </NavLink>
          <NavLink
            href="/dashboard/teams"
            icon={<Users className="h-4 w-4" />}
            isActive={pathname?.startsWith("/dashboard/teams")}
            onClick={onClose}
            iconBg="bg-teal-500/10 text-teal-600 dark:text-teal-400"
          >
            Teams
          </NavLink>
          <NavLink
            href="/dashboard/invites"
            icon={<Bell className="h-4 w-4" />}
            isActive={pathname === "/dashboard/invites"}
            onClick={onClose}
            iconBg="bg-orange-500/10 text-orange-600 dark:text-orange-400"
            badge={pendingInviteCount > 0 ? pendingInviteCount : undefined}
          >
            Invitations
          </NavLink>
          <NavLink
            href="/dashboard/settings"
            icon={<Settings className="h-4 w-4" />}
            isActive={pathname?.startsWith("/dashboard/settings")}
            onClick={onClose}
            iconBg="bg-muted text-muted-foreground"
          >
            Settings
          </NavLink>
        </nav>

        {/* Vault status */}
        {isUnlocked && (
          <div className="border-t p-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 group hover:border-green-500/50 hover:bg-green-500/5"
              onClick={() => lock()}
            >
              <LockOpen className="h-4 w-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">Vault Unlocked</span>
              <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono md:inline-block">⌘L</kbd>
            </Button>
          </div>
        )}

        {/* User */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 text-sm font-semibold text-primary">
              {user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
});

function NavLink({
  href,
  icon,
  children,
  isActive,
  onClick,
  iconBg,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  iconBg?: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-1"
      )}
    >
      <div className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-transform group-hover:scale-110",
        isActive ? "bg-white/20" : iconBg
      )}>
        {icon}
      </div>
      <span className="flex-1">{children}</span>
      {badge !== undefined && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
