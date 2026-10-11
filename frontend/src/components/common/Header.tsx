import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, LogIn } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { BrandLogo } from '../layout/BrandLogo'
import { ThemeToggle } from '../layout/ThemeToggle'

/**
 * Header of the public pages (landing, login, registration).
 *
 * Signed-in pages use the sidebar shell instead (components/layout/AppShell).
 *
 * @component
 * @returns {JSX.Element} Public header with brand, theme toggle and sign-in / dashboard link
 */
export default function Header() {
  const { t } = useTranslation('common')
  const { isAuthenticated } = useAuth()

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/70 backdrop-blur-md dark:border-gray-800/70 dark:bg-gray-950/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          to={isAuthenticated ? '/dashboard' : '/'}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          aria-label="OpenTYME"
        >
          <BrandLogo />
        </Link>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-500"
            >
              {t('navigation.dashboard')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-900/[0.05] hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
              aria-label={t('buttons.login')}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>{t('tooltips.login')}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
