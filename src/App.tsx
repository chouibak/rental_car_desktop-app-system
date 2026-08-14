import { NavLink, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  IconBell,
  IconCar,
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconFile,
  IconCalendar,
  IconChart,
  IconPanelLeft,
  IconReceipt,
  IconSettings,
  IconSteering,
  IconUsers,
  IconWallet,
} from './components/icons'
import { useLang } from './context/LangContext'
import { useAuth } from './context/AuthContext'
import DashboardPage from './pages/DashboardPage'
import CarDetailPage from './pages/CarDetailPage'
import CarFormPage from './pages/CarFormPage'
import CarsPage from './pages/CarsPage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import CustomerFormPage from './pages/CustomerFormPage'
import ReservationsPage from './pages/ReservationsPage'
import ReservationFormPage from './pages/ReservationFormPage'
import ReservationDetailPage from './pages/ReservationDetailPage'
import ContractsPage from './pages/ContractsPage'
import ContractDetailPage from './pages/ContractDetailPage'
import ContractFormPage from './pages/ContractFormPage'
import PaymentsPage from './pages/PaymentsPage'
import RevenuePage from './pages/RevenuePage'
import ExpensesPage from './pages/ExpensesPage'
import ExpenseFormPage from './pages/ExpenseFormPage'
import ChauffeursPage from './pages/ChauffeursPage'
import ChauffeurFormPage from './pages/ChauffeurFormPage'
import ChauffeurDetailPage from './pages/ChauffeurDetailPage'
import SettingsPage from './pages/SettingsPage'
import NotificationsPage from './pages/NotificationsPage'
import { NotificationBell } from './components/NotificationBell'
import { LicenseTrialProvider } from './components/LicenseTrialBanner'

const navIcons = {
  '/': IconDashboard,
  '/cars': IconCar,
  '/customers': IconUsers,
  '/chauffeurs': IconSteering,
  '/reservations': IconCalendar,
  '/contracts': IconFile,
  '/payments': IconWallet,
  '/revenue': IconChart,
  '/expenses': IconReceipt,
  '/notifications': IconBell,
  '/settings': IconSettings,
} as const

function agencyInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'RC'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export default function App() {
  const { t, lang, setLang, dir } = useLang()
  const { username, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebar-open') !== 'false')
  const [agencyName, setAgencyName] = useState(t.appName)
  const [agencyLogoUrl, setAgencyLogoUrl] = useState('')

  useEffect(() => {
    localStorage.setItem('sidebar-open', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    const loadAgencyBranding = async () => {
      const settings = await window.api.getSettings()
      setAgencyName(settings.company_name?.trim() || t.appName)
      if (settings.company_logo) {
        setAgencyLogoUrl(await window.api.getCompanyLogoUrl(settings.company_logo))
      } else {
        setAgencyLogoUrl('')
      }
    }

    loadAgencyBranding()
    window.addEventListener('agency-settings-updated', loadAgencyBranding)
    return () => window.removeEventListener('agency-settings-updated', loadAgencyBranding)
  }, [t.appName])

  const links = [
    { to: '/', label: t.dashboard },
    { to: '/cars', label: t.cars },
    { to: '/customers', label: t.customers },
    { to: '/chauffeurs', label: t.chauffeurs },
    { to: '/reservations', label: t.reservations },
    { to: '/contracts', label: t.contracts },
    { to: '/payments', label: t.payments },
    { to: '/revenue', label: t.revenue },
    { to: '/expenses', label: t.expenses },
    { to: '/notifications', label: t.notifications },
    { to: '/settings', label: t.settings },
  ]

  return (
    <LicenseTrialProvider>
    <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`} dir={dir}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <div className={`brand-badge${agencyLogoUrl ? ' brand-badge--logo' : ''}`}>
              {agencyLogoUrl ? <img src={agencyLogoUrl} alt={agencyName} /> : agencyInitials(agencyName)}
            </div>
            <span className="sidebar-brand-name" title={agencyName}>
              {agencyName}
            </span>
          </div>
          <div className="sidebar-brand-tools">
            <NotificationBell tone="sidebar" />
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label={t.hideSidebar}
              title={t.hideSidebar}
            >
              {dir === 'rtl' ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
            </button>
          </div>
        </div>

        <nav className="nav">
          {links.map((l) => {
            const Icon = navIcons[l.to as keyof typeof navIcons]
            return (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon size={18} />
                {l.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-session">
            <p className="sidebar-user">{t.authLoggedInAs.replace('{user}', username)}</p>
            <button type="button" className="sidebar-logout" onClick={() => logout()}>
              {t.authLogout}
            </button>
          </div>
          <div className="lang-switch">
            <button type="button" className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>
              FR
            </button>
            <button type="button" className={lang === 'ar' ? 'active' : ''} onClick={() => setLang('ar')}>
              ع
            </button>
          </div>
        </div>
      </aside>
      {!sidebarOpen ? (
        <button
          type="button"
          className="sidebar-open-fab"
          onClick={() => setSidebarOpen(true)}
          aria-label={t.showSidebar}
          title={t.showSidebar}
        >
          <IconPanelLeft size={18} />
        </button>
      ) : null}
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cars" element={<CarsPage />} />
          <Route path="/cars/new" element={<CarFormPage />} />
          <Route path="/cars/:id/edit" element={<CarFormPage />} />
          <Route path="/cars/:id" element={<CarDetailPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/new" element={<CustomerFormPage />} />
          <Route path="/customers/:id/edit" element={<CustomerFormPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/chauffeurs" element={<ChauffeursPage />} />
          <Route path="/chauffeurs/new" element={<ChauffeurFormPage />} />
          <Route path="/chauffeurs/:id/edit" element={<ChauffeurFormPage />} />
          <Route path="/chauffeurs/:id" element={<ChauffeurDetailPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/reservations/new" element={<ReservationFormPage />} />
          <Route path="/reservations/:id/edit" element={<ReservationFormPage />} />
          <Route path="/reservations/:id" element={<ReservationDetailPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/contracts/new" element={<ContractFormPage />} />
          <Route path="/contracts/:id/edit" element={<ContractFormPage />} />
          <Route path="/contracts/:id" element={<ContractDetailPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/revenue" element={<RevenuePage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/expenses/new" element={<ExpenseFormPage />} />
          <Route path="/expenses/:id/edit" element={<ExpenseFormPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
    </LicenseTrialProvider>
  )
}
