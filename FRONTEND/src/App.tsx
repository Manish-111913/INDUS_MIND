/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { Login } from './components/auth/Login';
import { SignUp } from './components/auth/SignUp';
import { ForgotPassword } from './components/auth/ForgotPassword';
import { ResetPassword } from './components/auth/ResetPassword';
import { AppShell } from './components/layout/AppShell';
import { RoleDashboard } from './components/dashboard/RoleDashboard';
import { ExpertCopilot } from './components/copilot/ExpertCopilot';
import { DocumentsLibrary } from './components/views/documents/DocumentsLibrary';
import { SearchResults } from './components/views/SearchResults';
import { 
  KnowledgeGraphExplorer, 
  Equipment360, 
  MaintenanceHub, 
  ComplianceHub, 
  AuditLogs,
  LessonsLearnedHub,
  QualityHub,
  NotificationsHub,
  AnalyticsHub
} from './components/views/FeatureViews';
import { AdminSuite } from './components/views/admin/AdminSuite';
import { ProfileSettings } from './components/views/profile/ProfileSettings';
import { ImportWizard } from './components/views/data/ImportWizard';
import { SparePartsModule } from './components/views/maintenance/SparePartsModule';
import { ShiftLogbookModule } from './components/views/maintenance/ShiftLogbookModule';
import { LandingPage } from './components/views/LandingPage';
import { I18nProvider } from './lib/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function MainAppContent() {
  const { isAuthenticated, checkSession } = useAuthStore();
  const [currentHash, setCurrentHash] = useState(() => window.location.hash || '#landing');
  const [initialChecking, setInitialChecking] = useState(true);

  // 1. Listen to URL Hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const newHash = window.location.hash || '#landing';
      setCurrentHash(newHash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 2. Perform Startup Session Verification
  useEffect(() => {
    checkSession().finally(() => {
      setInitialChecking(false);
    });
  }, [checkSession]);

  // 2b. Apply the persisted theme globally (works on landing/login pages too, not just
  // inside the AppShell). The CSS keys off the `.dark` class on <html>.
  useEffect(() => {
    const applyStoredTheme = () => {
      const stored =
        localStorage.getItem('appearance.theme') ||
        localStorage.getItem('indusmind_theme') ||
        'system';
      const isDark =
        stored === 'dark' ||
        (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    };

    applyStoredTheme();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener('storage', applyStoredTheme);
    window.addEventListener('indusmind-theme-change', applyStoredTheme);
    mediaQuery.addEventListener('change', applyStoredTheme);
    return () => {
      window.removeEventListener('storage', applyStoredTheme);
      window.removeEventListener('indusmind-theme-change', applyStoredTheme);
      mediaQuery.removeEventListener('change', applyStoredTheme);
    };
  }, []);

  // 3. Simple Hash Navigation Trigger
  const handleRouteChange = (newHash: string) => {
    window.location.hash = newHash;
  };

  // 4. Global Auth Guards based on Session State
  useEffect(() => {
    if (initialChecking) return;

    const authExemptRoutes = ['#login', '#register', '#forgot-password', '#reset-password', '#landing', '', '#'];
    
    if (!isAuthenticated && !authExemptRoutes.includes(currentHash)) {
      // Force non-authenticated users to login
      window.location.hash = '#login';
    } else if (isAuthenticated && (currentHash === '#login' || currentHash === '' || currentHash === '#' || currentHash === '#landing')) {
      // Direct authenticated users to home dashboard
      window.location.hash = '#dashboard';
    }
  }, [isAuthenticated, currentHash, initialChecking]);

  // No bootstrap loading spinner — render straight through while the session
  // check runs in the background (the auth guard above handles redirects once
  // `initialChecking` clears).

  // 5. Route Mapping Table
  const renderActiveRoute = () => {
    const route = currentHash.split('?')[0].split('/')[0]; // Simple match first-level hash (e.g. #admin/audit-log)

    switch (route) {
      case '':
      case '#':
      case '#landing':
        return <LandingPage />;
      case '#login':
        return <Login />;
      case '#register':
        return <SignUp />;
      case '#forgot-password':
        return <ForgotPassword />;
      case '#reset-password':
        return <ResetPassword />;
      case '#dashboard':
        return <RoleDashboard />;
      case '#copilot':
        return <ExpertCopilot />;
      case '#search':
        return <SearchResults />;
      case '#documents':
        return <DocumentsLibrary />;
      case '#knowledge-graph':
        return <KnowledgeGraphExplorer />;
      case '#equipment':
        return <Equipment360 />;
      case '#maintenance':
        return <MaintenanceHub />;
      case '#parts':
        return <SparePartsModule />;
      case '#compliance':
        return <ComplianceHub />;
      case '#lessons-learned':
        return <LessonsLearnedHub />;
      case '#quality':
        return <QualityHub />;
      case '#logbook':
        return <ShiftLogbookModule />;
      case '#notifications':
        return <NotificationsHub />;
      case '#analytics':
        return <AnalyticsHub />;
      case '#data':
        return <ImportWizard currentHash={currentHash} />;
      case '#admin':
        return <AdminSuite currentHash={currentHash} onRouteChange={handleRouteChange} />;
      case '#audit-log':
        return <AuditLogs />;
      case '#profile':
      case '#settings':
        return <ProfileSettings currentHash={currentHash} onRouteChange={handleRouteChange} />;
      default:
        return isAuthenticated ? <RoleDashboard /> : <LandingPage />;
    }
  };

  const isOutsideShell = ['#login', '#register', '#forgot-password', '#reset-password', '#landing', '', '#'].includes(currentHash);

  if (isOutsideShell) {
    // These full-page routes live outside the AppShell's internal scroll containers.
    // The global `body { overflow: hidden }` would otherwise clip long pages (landing,
    // sign-up), so give this wrapper its own vertical scroll.
    return <div className="font-sans h-screen overflow-y-auto bg-background-custom">{renderActiveRoute()}</div>;
  }

  return (
    <AppShell currentRoute={currentHash} onRouteChange={handleRouteChange}>
      {renderActiveRoute()}
    </AppShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <MainAppContent />
      </I18nProvider>
    </QueryClientProvider>
  );
}
