import {
  BarChart3,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Settings,
  ShieldCheck,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  /** i18n key in the `common` namespace, or a literal label */
  labelKey: string;
  fallback: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

/** Main sections, in sidebar order. */
export const primaryNav: NavItem[] = [
  { to: '/dashboard', labelKey: 'navigation.dashboard', fallback: 'Dashboard', icon: LayoutDashboard },
  { to: '/time-entries', labelKey: 'navigation.timeTracking', fallback: 'Time Tracking', icon: Timer },
  { to: '/projects', labelKey: 'navigation.projects', fallback: 'Projects', icon: FolderKanban },
  { to: '/clients', labelKey: 'navigation.clients', fallback: 'Clients', icon: Users },
  { to: '/finances', labelKey: 'navigation.finances', fallback: 'Finances', icon: Wallet },
  { to: '/reports', labelKey: 'navigation.reports', fallback: 'Reports', icon: BarChart3 },
];

/** Secondary destinations at the bottom of the sidebar. */
export const secondaryNav: NavItem[] = [
  { to: '/email/compose', labelKey: 'navigation.sendEmail', fallback: 'Send Email', icon: Mail },
  { to: '/config', labelKey: 'navigation.settings', fallback: 'Settings', icon: Settings },
  { to: '/system-admin', labelKey: 'navigation.systemAdmin', fallback: 'System Admin', icon: ShieldCheck, adminOnly: true },
];

/** Section a path belongs to — used for the page title in the top bar. */
export function findNavItem(pathname: string): NavItem | undefined {
  return [...primaryNav, ...secondaryNav].find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`)
  );
}
