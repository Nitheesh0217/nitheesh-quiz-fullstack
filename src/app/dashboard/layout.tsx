'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { ThemeToggle } from '../../components/ThemeToggle';
import { 
  GraduationCap, 
  Home, 
  BookOpen, 
  ClipboardList, 
  Award, 
  Users, 
  School, 
  LogOut, 
  Menu,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChatWidget } from '../../components/ChatWidget';
import { type Breadcrumb, DashboardLayoutContext } from './DashboardLayoutContext';

// Helper to generate deterministic initials background color
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 45%)`;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [title, setTitleState] = useState('Dashboard');
  const [breadcrumbs, setBreadcrumbsState] = useState<Breadcrumb[]>([]);
  const [action, setActionState] = useState<React.ReactNode>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const avatarColor = getAvatarColor(user.name);

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: Home, roles: ['admin', 'teacher', 'student'] },
    { label: 'Classes', href: '/dashboard/classes', icon: BookOpen, roles: ['teacher'] },
    { label: 'Assignments', href: '/dashboard/assignments', icon: ClipboardList, roles: ['teacher'] },
    { label: 'Grades', href: '/dashboard/student/grades', icon: Award, roles: ['student'] },
    { label: 'Users', href: '#users-section', icon: Users, roles: ['admin'] },
    { label: 'Schools', href: '#schools-section', icon: School, roles: ['admin'] },
  ].filter((item) => item.roles.includes(user.role));

  const isActive = (item: typeof navItems[0]) => {
    if (item.href.startsWith('#')) {
      return false;
    }
    if (item.href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/dashboard/';
    }
    return pathname.startsWith(item.href);
  };

  const handleNavClick = (href: string, e: React.MouseEvent) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      setIsMobileOpen(false);

      const targetId = href.replace('#', '');
      const scrollToTarget = () => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      };

      // These sections only exist on the admin dashboard (both /dashboard
      // and /dashboard/admin render it - the admin lands on the latter
      // after login, so both must be treated as "already there").
      if (pathname === '/dashboard' || pathname === '/dashboard/admin') {
        scrollToTarget();
      } else {
        router.push('/dashboard/admin' + href);
        // The dashboard's data (stats, users, schools) loads asynchronously
        // and grows the page height as it arrives, so a single early scroll
        // can land short once more content pushes the target further down.
        // Retry a few times as the page fills in.
        [150, 400, 800, 1500].forEach((delay) => setTimeout(scrollToTarget, delay));
      }
      return;
    }

    setIsMobileOpen(false);
    router.push(href);
  };

  const sidebarContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full bg-surface dark:bg-dark-surface border-r border-border dark:border-dark-border py-6 justify-between select-none overflow-hidden">
      <div className="space-y-7">
        {/* Logo */}
        <button
          type="button"
          onClick={() => { setIsMobileOpen(false); router.push('/dashboard'); }}
          className={`flex items-center gap-3 hover:opacity-80 transition-opacity ${collapsed ? 'justify-center px-2' : 'px-6'}`}
          aria-label="Go to dashboard home"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white shadow-sm shrink-0">
            <GraduationCap className="h-5 w-5" />
          </div>
          {!collapsed && <span className="font-extrabold text-lg tracking-tight text-text-primary whitespace-nowrap">Concentrate</span>}
        </button>

        {/* Navigation */}
        <nav className={`space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleNavClick(item.href, e)}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 relative group ${
                  collapsed ? 'justify-center' : ''
                } ${
                  active 
                    ? 'bg-primary-soft text-primary dark:bg-primary/10' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-neutral-50 dark:hover:bg-dark-bg'
                }`}
              >
                {active && !collapsed && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary rounded-r" />
                )}
                <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary' : 'text-text-tertiary group-hover:text-text-secondary'}`} />
                {!collapsed && item.label}
              </a>
            );
          })}
        </nav>
      </div>

      {/* Bottom: User dropdown + collapse toggle */}
      <div className={`space-y-2 ${collapsed ? 'px-2' : 'px-3'}`}>
        {/* Collapse toggle button */}
        <button
          onClick={() => setIsSidebarCollapsed(prev => !prev)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold text-text-tertiary hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-dark-bg transition-all ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed
            ? <PanelLeftOpen className="h-4 w-4" />
            : <><PanelLeftClose className="h-4 w-4" /><span>Collapse</span></>}
        </button>

        {/* User profile dropdown card */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className={`flex items-center gap-3 p-2 rounded-xl border border-border dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg transition-colors w-full text-left focus:outline-none focus:ring-2 focus:ring-primary/20 select-none ${collapsed ? 'justify-center' : ''}`}>
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-text-primary truncate">{user.name}</p>
                  <p className="text-[10px] text-text-tertiary font-medium capitalize mt-0.5">{user.role}</p>
                </div>
              )}
              {!collapsed && <ChevronDown className="h-4 w-4 text-text-tertiary shrink-0" />}
            </button>
          </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
            <DropdownMenu.Content 
              className="z-50 min-w-[208px] bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl p-1.5 shadow-lg animate-scaleIn select-none"
              sideOffset={8}
              align={collapsed ? 'center' : 'end'}
            >
              <div className="px-2 py-1.5 border-b border-border dark:border-dark-border/40 mb-1">
                <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Account</p>
                <p className="text-xs font-medium text-text-secondary truncate mt-0.5">{user.email}</p>
              </div>

              <div className="flex items-center justify-between px-2 py-2 text-xs font-semibold text-text-secondary">
                <span>Theme</span>
                <ThemeToggle />
              </div>

              <DropdownMenu.Item 
                onClick={logout}
                className="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-danger rounded-lg hover:bg-danger-soft hover:text-danger focus:bg-danger-soft focus:text-danger focus:outline-none transition-colors cursor-pointer mt-1"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );

  return (
    <DashboardLayoutContext.Provider value={{
      title,
      setTitle: setTitleState,
      breadcrumbs,
      setBreadcrumbs: setBreadcrumbsState,
      action,
      setAction: setActionState,
      isFocusMode,
      setIsFocusMode,
    }}>
      <div className="flex min-h-screen bg-background">
        {/* Desktop Sidebar — collapses to icon rail or fully hidden in focus mode */}
        <aside className={`hidden lg:block shrink-0 h-screen sticky top-0 overflow-hidden transition-all duration-300 ${
          isFocusMode ? 'w-0' : isSidebarCollapsed ? 'w-[64px]' : 'w-[240px]'
        }`}>
          {sidebarContent(isSidebarCollapsed)}
        </aside>

        {/* Content area wrapper */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border dark:border-dark-border select-none">
            <div className="h-16 px-6 max-w-[1200px] mx-auto flex items-center justify-between gap-4">
              {/* Left: Hamburger (mobile) + Breadcrumbs */}
              <div className="flex items-center gap-4 min-w-0">
                <Dialog.Root open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                  <Dialog.Trigger asChild>
                    <button className="lg:hidden p-2 rounded-lg border border-border dark:border-dark-border hover:bg-surface dark:hover:bg-dark-surface text-text-secondary focus:outline-none">
                      <Menu className="h-5 w-5" />
                      <span className="sr-only">Open menu</span>
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" />
                    <Dialog.Content className="fixed inset-y-0 left-0 w-[240px] z-50 animate-slideInRight">
                      <div className="h-full relative">
                        {sidebarContent(false)}
                        <Dialog.Close asChild>
                          <button className="absolute top-4 right-4 text-text-tertiary hover:text-text-primary p-1 bg-surface dark:bg-dark-surface rounded-lg border border-border dark:border-dark-border">
                            <X className="h-4 w-4" />
                          </button>
                        </Dialog.Close>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>

                <div className="min-w-0">
                  {breadcrumbs.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                      {breadcrumbs.map((crumb, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="text-text-tertiary">/</span>}
                          {crumb.href ? (
                            <a 
                              href={crumb.href} 
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(crumb.href!);
                              }}
                              className="hover:text-text-primary transition-colors truncate"
                            >
                              {crumb.label}
                            </a>
                          ) : (
                            <span className="text-text-primary font-semibold truncate">{crumb.label}</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <h1 className="text-sm sm:text-base font-bold text-text-primary truncate">
                      {title}
                    </h1>
                  )}
                </div>
              </div>

              {/* Right: Custom Action */}
              {action && (
                <div className="shrink-0 flex items-center">
                  {action}
                </div>
              )}
            </div>
          </header>

          {/* Main page content */}
          <main className="flex-1 max-w-[1200px] mx-auto px-6 py-6 w-full">
            {children}
          </main>
          <ChatWidget />
        </div>
      </div>
    </DashboardLayoutContext.Provider>
  );
}
