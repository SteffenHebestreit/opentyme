import {
  BarChart3,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Settings,
  ShieldCheck,
  Timer,
  UserRound,
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

/** Pages reached from inside a section (template editor → settings). */
const sectionAliases: Record<string, string> = {
  '/email-templates': '/config',
};

const profileItem: NavItem = { to: '/profile', labelKey: 'navigation.profile', fallback: 'Profile', icon: UserRound };

/** Section a path belongs to — used for the page title in the top bar. */
export function findNavItem(pathname: string): NavItem | undefined {
  const matches = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const alias = Object.keys(sectionAliases).find(matches);
  const target = alias ? sectionAliases[alias] : pathname;
  return [...primaryNav, ...secondaryNav, profileItem].find(
    (item) => target === item.to || target.startsWith(`${item.to}/`)
  );
}
