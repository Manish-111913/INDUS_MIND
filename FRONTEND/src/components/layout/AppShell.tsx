/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as Icons from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNavigationQuery } from '../../lib/api/navigation';
import { NavigationItem } from '../../types';
import { api } from '../../lib/api/client';
import { useNotificationStore } from '../../stores/notificationStore';
import { useI18n } from '../../lib/i18n';

// Helper to render lucide icons dynamically based on API string
export function renderIcon(iconName: string, className = "w-5 h-5") {
  const IconComponent = (Icons as any)[iconName];
  if (!IconComponent) return <Icons.HelpCircle className={className} />;
  return <IconComponent className={className} />;
}

interface AppShellProps {
  currentRoute: string;
  onRouteChange: (route: string) => void;
  children: React.ReactNode;
}

const ALL_PLANTS = [
  'Reliance Jamnagar Refinery - Sector A',
  'Reliance Jamnagar Refinery - Sector B',
  'Hazira Petrochemicals Complex - Unit 4',
  'KG-D6 Deepwater Gas Field Terminal'
];

export function AppShell({ currentRoute, onRouteChange, children }: AppShellProps) {
  const { user, logout, updatePlant } = useAuthStore();
  const { data: navItems = [], isLoading: navLoading } = useNavigationQuery();
  const { locale, t, setLocale } = useI18n();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('appearance.theme') as any) || (localStorage.getItem('indusmind_theme') as any) || 'system';
  });
  
  // UI states
  const [isPlantDropdownOpen, setIsPlantDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  // System Markdown Pages (N5)
  const [systemPageModal, setSystemPageModal] = useState<'privacy' | 'terms' | null>(null);
  const [systemPageContent, setSystemPageContent] = useState('');
  const [systemPageLoading, setSystemPageLoading] = useState(false);

  useEffect(() => {
    if (!systemPageModal) return;
    setSystemPageLoading(true);
    api.get<any>(`/content/${systemPageModal}`)
      .then(res => {
        setSystemPageContent(res.data?.content || '');
      })
      .catch(err => {
        console.error('Failed to load system page:', err);
        setSystemPageContent('Failed to load document.');
      })
      .finally(() => {
        setSystemPageLoading(false);
      });
  }, [systemPageModal]);

  // Support, Changelog & Guided Tour States (P17)
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [changelogData, setChangelogData] = useState<any[]>([]);
  const [loadingChangelog, setLoadingChangelog] = useState(false);
  
  const [tourActive, setTourActive] = useState(false);
  const [tourSteps, setTourSteps] = useState<any[]>([]);
  const [currentTourStepIdx, setCurrentTourStepIdx] = useState(0);
  const [tourElementRect, setTourElementRect] = useState<DOMRect | null>(null);

  // Search overlay states
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [suggestResults, setSuggestResults] = useState<{
    Documents: any[];
    Equipment: any[];
    WorkOrders: any[];
    Regulations: any[];
    Actions: any[];
  } | null>(null);
  const [isSuggestLoading, setIsSuggestLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('indusmind_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Debounce effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(commandSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [commandSearch]);

  // Fetch suggest results
  useEffect(() => {
    if (!isCommandOpen) return;
    setIsSuggestLoading(true);
    api.get<any>(`/search/suggest?q=${encodeURIComponent(debouncedSearch)}`)
      .then((res) => {
        setSuggestResults(res);
        setActiveIndex(0);
      })
      .catch((err) => {
        console.error('Search suggest error', err);
      })
      .finally(() => {
        setIsSuggestLoading(false);
      });
  }, [debouncedSearch, isCommandOpen]);

  const saveRecentSearch = (query: string) => {
    if (!query || !query.trim()) return;
    const trimmed = query.trim();
    const filtered = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, 5);
    setRecentSearches(filtered);
    localStorage.setItem('indusmind_recent_searches', JSON.stringify(filtered));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('indusmind_recent_searches');
  };

  // Helper to flatten search results for linear keyboard navigation
  const getFlattenedItems = () => {
    const items: any[] = [];
    
    // Recent Searches
    if (!commandSearch) {
      recentSearches.forEach((s) => {
        items.push({ id: `recent-${s}`, name: s, label: s, type: 'recent', route: `#search?q=${encodeURIComponent(s)}` });
      });
    }

    if (suggestResults) {
      const groups = ['Documents', 'Equipment', 'Work Orders', 'Regulations', 'Actions'] as const;
      groups.forEach((g) => {
        const groupItems = suggestResults[g] || [];
        groupItems.forEach((item: any) => {
          items.push({ ...item, groupName: g });
        });
      });
    }

    return items;
  };

  const flattened = getFlattenedItems();

  const handleSelectSuggestion = (item: any) => {
    saveRecentSearch(item.name || item.label);
    setIsCommandOpen(false);
    setCommandSearch('');
    onRouteChange(item.route || '#search?q=' + encodeURIComponent(item.name || item.label));
  };

  const handleSearchFreeText = (query: string) => {
    saveRecentSearch(query);
    setIsCommandOpen(false);
    setCommandSearch('');
    onRouteChange('#search?q=' + encodeURIComponent(query));
  };

  const commandInputRef = useRef<HTMLInputElement>(null);

  // Apply theme class
  useEffect(() => {
    const isDark = activeTheme === 'dark' || (activeTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('appearance.theme', activeTheme);
    localStorage.setItem('indusmind_theme', activeTheme);

    if (activeTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        if (e.matches) {
          document.documentElement.classList.add('dark');
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.setAttribute('data-theme', 'light');
        }
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [activeTheme]);

  // Sync theme changes across subviews (e.g. Settings page theme toggles)
  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('appearance.theme') || localStorage.getItem('indusmind_theme') || 'system';
      if (stored !== activeTheme) {
        setActiveTheme(stored as any);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeTheme]);

  // Fetch changelog from /changelog mock API
  const handleOpenChangelog = async () => {
    setIsChangelogOpen(true);
    setLoadingChangelog(true);
    try {
      const response = await api.get<any>('/changelog');
      if (response) {
        const data = Array.isArray(response) ? response : (response.data || []);
        setChangelogData(data);
      }
    } catch (err) {
      console.error("Failed to fetch changelogs:", err);
    } finally {
      setLoadingChangelog(false);
    }
  };

  const handleRestartTour = async () => {
    try {
      const response = await api.get<any>('/tours/main');
      if (response) {
        const data = Array.isArray(response) ? response : (response.data || []);
        setTourSteps(data);
        setCurrentTourStepIdx(0);
        setTourActive(true);
      }
    } catch (err) {
      console.error("Failed to load tour steps:", err);
    }
  };

  // Global custom event listener for starting tour (from onboarding card)
  useEffect(() => {
    const handleGlobalStartTour = () => {
      handleRestartTour();
    };
    window.addEventListener('indusmind-start-tour', handleGlobalStartTour);
    return () => {
      window.removeEventListener('indusmind-start-tour', handleGlobalStartTour);
    };
  }, []);

  // Monitor target elements for active tour steps
  useEffect(() => {
    if (!tourActive || tourSteps.length === 0) {
      setTourElementRect(null);
      return;
    }

    const activeStep = tourSteps[currentTourStepIdx];
    if (!activeStep) return;

    // Small delay to ensure any page transitions are complete
    const timeout = setTimeout(() => {
      const element = document.querySelector(activeStep.selector) as HTMLElement;
      if (element) {
        // Scroll into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Measure position
        const rect = element.getBoundingClientRect();
        setTourElementRect(rect);
        
        // Add temporary focal highlight border styling
        element.classList.add('indusmind-tour-highlight');
        
        // Listeners to recalculate on scroll/resize
        const recalc = () => {
          const updatedRect = element.getBoundingClientRect();
          setTourElementRect(updatedRect);
        };
        window.addEventListener('resize', recalc, { passive: true });
        window.addEventListener('scroll', recalc, { passive: true });

        return () => {
          element.classList.remove('indusmind-tour-highlight');
          window.removeEventListener('resize', recalc);
          window.removeEventListener('scroll', recalc);
        };
      } else {
        setTourElementRect(null);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [tourActive, currentTourStepIdx, tourSteps]);

  // Listen for global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Search Bar Toggle (Cmd+K / Ctrl+K)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      }
      
      // 2. Navigation Alt Shortcuts
      if (e.altKey) {
        if (e.key === '1' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          onRouteChange('#dashboard');
        } else if (e.key === '2' || e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          onRouteChange('#copilot');
        } else if (e.key === '3' || e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          onRouteChange('#maintenance');
        } else if (e.key === '4' || e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          onRouteChange('#reports');
        } else if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          setIsHelpOpen(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRouteChange]);

  useEffect(() => {
    if (isCommandOpen) {
      setTimeout(() => commandInputRef.current?.focus(), 100);
    }
  }, [isCommandOpen]);

  // Reactive Live Notifications Store
  const { 
    notifications, 
    activeToast, 
    dismissToast, 
    markAllAsRead, 
    markAsRead, 
    simulateIncomingEvent 
  } = useNotificationStore();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Real-time simulation interval: push mock events every 45 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      simulateIncomingEvent();
    }, 45000);
    return () => clearInterval(timer);
  }, [simulateIncomingEvent]);

  // Helper to format breadcrumbs
  const getBreadcrumbs = () => {
    const parts = currentRoute.replace('#', '').split('/');
    return ['INDUSMIND', user?.plant?.split(' - ')[1]?.toUpperCase() || 'CORE', ...parts.map(p => p.toUpperCase().replace('-', ' '))].filter(Boolean);
  };

  const handleLogout = () => {
    logout();
    window.location.hash = '#login';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background-custom text-text-primary">
      
      {/* 1. FIXED TOP BAR */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border-custom flex items-center justify-between px-4 z-40 shadow-sm">
        
        {/* Logo and Plant Switcher */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => onRouteChange('#dashboard')}>
            <div className="p-1.5 rounded bg-primary/10 text-primary border border-primary/20">
              <Icons.Bot className="w-5 h-5" />
            </div>
            <span className="font-display font-bold tracking-tight text-white hidden sm:inline-block">IndusMind</span>
          </div>

          <div className="h-4 w-[1px] bg-border-custom hidden md:block" />

          {/* Plant Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsPlantDropdownOpen(!isPlantDropdownOpen)}
              className="tour-step-plant flex items-center space-x-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded border border-border-custom bg-background-custom/60 hover:bg-surface-muted transition-colors cursor-pointer text-text-secondary"
            >
              <Icons.MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="max-w-[140px] sm:max-w-[200px] truncate">
                {user?.plant || 'Select Plant Node'}
              </span>
              <Icons.ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" />
            </button>

            {isPlantDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsPlantDropdownOpen(false)} />
                <div className="absolute left-0 mt-1.5 w-64 rounded bg-surface border border-border-custom shadow-xl z-20 font-sans text-xs">
                  <div className="p-2 border-b border-border-custom bg-surface-muted text-[10px] font-mono font-semibold tracking-wider text-text-muted uppercase">
                    Available Plant Nodes
                  </div>
                  <div className="p-1 max-h-60 overflow-y-auto">
                    {ALL_PLANTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          updatePlant(p);
                          setIsPlantDropdownOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between cursor-pointer ${
                          user?.plant === p ? 'text-primary font-semibold bg-primary/5' : 'text-text-secondary'
                        }`}
                      >
                        <span className="truncate">{p}</span>
                        {user?.plant === p && <Icons.Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Global Search & System Actions */}
        <div className="flex items-center space-x-3">
          
          {/* Global Search Input Trigger */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setIsCommandOpen(true)}
              className="tour-step-search w-48 lg:w-64 flex items-center justify-between px-3 py-1.5 text-xs font-sans text-text-muted bg-background-custom border border-border-custom rounded hover:border-primary/50 transition-all cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Icons.Search className="w-3.5 h-3.5 text-text-muted" />
                <span>Search tags, procedures...</span>
              </div>
              <span className="text-[10px] bg-surface-muted px-1.5 py-0.5 rounded font-mono border border-border-custom">
                ⌘K
              </span>
            </button>
          </div>

          {/* AI Copilot shortcut floating trigger */}
          <button
            onClick={() => onRouteChange('#copilot')}
            className="tour-step-copilot p-1.5 rounded bg-primary text-white hover:bg-primary-hover border border-primary/20 shadow shadow-primary/20 cursor-pointer flex items-center space-x-1"
            title="Launch Expert Copilot"
          >
            <Icons.Sparkles className="w-4 h-4 animate-pulse" />
            <span className="text-xs font-medium px-0.5 hidden lg:inline-block">Copilot Chat</span>
          </button>

          {/* Alerts Bell with Unread Badge */}
          <div className="relative">
            <button
              onClick={() => setIsNotifDropdownOpen(!isNotifDropdownOpen)}
              className="p-1.5 rounded border border-border-custom hover:bg-surface-muted transition-colors cursor-pointer relative text-text-secondary"
            >
              <Icons.Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-status-critical text-[9px] font-mono font-bold text-white flex items-center justify-center rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotifDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsNotifDropdownOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-80 rounded bg-surface border border-border-custom shadow-xl z-20 font-sans text-xs">
                  <div className="p-3 border-b border-border-custom flex items-center justify-between bg-surface-muted">
                    <span className="font-mono font-semibold text-text-primary tracking-wider text-[10px] uppercase">
                      HMI SYSTEM ALERTS [ACTIVE]
                    </span>
                    <button 
                      onClick={() => {
                        markAllAsRead();
                        setIsNotifDropdownOpen(false);
                      }}
                      className="text-[10px] text-primary cursor-pointer hover:underline bg-transparent border-0"
                    >
                      Dismiss All
                    </button>
                  </div>
                  <div className="divide-y divide-border-custom max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-text-muted">No active alerts.</div>
                    ) : (
                      notifications.slice(0, 10).map((notif) => (
                        <div key={notif.id} className={`p-3 hover:bg-background-custom/40 transition-colors ${!notif.isRead ? 'bg-primary/5' : ''}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                              notif.type === 'critical' ? 'bg-status-critical/10 text-status-critical border-status-critical/15' :
                              notif.type === 'warn' ? 'bg-status-warn/10 text-status-warn border-status-warn/15' :
                              'bg-status-info/10 text-status-info border-status-info/15'
                            }`}>
                              {notif.title}
                            </span>
                            <span className="text-[9px] font-mono text-text-muted">
                              {Date.now() - notif.timestamp < 60000 ? 'Just now' : `${Math.floor((Date.now() - notif.timestamp) / 60000)}m ago`}
                            </span>
                          </div>
                          <p className="text-text-secondary text-xs">{notif.desc}</p>
                          {notif.desc.includes('http') && (
                            <div className="pt-1.5">
                              <a 
                                href={notif.desc.split(' ').find(w => w.startsWith('http')) || '#'}
                                download
                                className="inline-flex items-center space-x-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded font-mono text-[8px] font-bold transition-all cursor-pointer"
                              >
                                <Icons.Download className="w-2.5 h-2.5" />
                                <span>DOWNLOAD FILE</span>
                              </a>
                            </div>
                          )}
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-[8px] font-mono text-text-muted bg-surface-muted border border-border-custom px-1.5 rounded uppercase">{notif.category}</span>
                            {!notif.isRead && (
                              <button 
                                onClick={() => markAsRead(notif.id)}
                                className="text-[9px] text-primary hover:underline font-mono bg-transparent border-0 cursor-pointer"
                              >
                                Mark Read
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t border-border-custom text-center bg-surface-muted">
                    <button 
                      onClick={() => {
                        setIsNotifDropdownOpen(false);
                        onRouteChange('#notifications');
                      }}
                      className="text-[11px] font-mono text-primary hover:underline cursor-pointer bg-transparent border-0"
                    >
                      Access Notifications Control Center
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Support & Help Desk Button (P17) */}
          <div className="relative">
            <button
              onClick={() => setIsHelpOpen(!isHelpOpen)}
              className="tour-step-help p-1.5 rounded border border-border-custom hover:bg-surface-muted transition-colors cursor-pointer relative text-text-secondary flex items-center justify-center"
              title="Help & Reference Desk (Alt+H)"
            >
              <Icons.HelpCircle className="w-4 h-4 text-primary" />
            </button>
            
            {isHelpOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsHelpOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-64 rounded bg-surface border border-border-custom shadow-xl z-20 font-sans text-xs">
                  <div className="p-3 border-b border-border-custom bg-surface-muted text-left">
                    <p className="font-semibold text-text-primary text-sm leading-tight flex items-center space-x-1.5">
                      <Icons.HelpCircle className="w-4 h-4 text-primary" />
                      <span>Support & Reference</span>
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">Quick guides, release logs, and system tour.</p>
                  </div>
                  
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setIsHelpOpen(false);
                        setIsShortcutsOpen(true);
                      }}
                      className="w-full text-left p-2 rounded hover:bg-surface-muted flex items-center space-x-2 text-text-secondary cursor-pointer border-0 bg-transparent"
                    >
                      <Icons.Keyboard className="w-3.5 h-3.5 text-primary" />
                      <span>Keyboard Shortcuts Registry</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setIsHelpOpen(false);
                        handleOpenChangelog();
                      }}
                      className="w-full text-left p-2 rounded hover:bg-surface-muted flex items-center space-x-2 text-text-secondary cursor-pointer border-0 bg-transparent"
                    >
                      <Icons.FileText className="w-3.5 h-3.5 text-primary" />
                      <span>"What's New" Changelog</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setIsHelpOpen(false);
                        handleRestartTour();
                      }}
                      className="w-full text-left p-2 rounded hover:bg-surface-muted flex items-center space-x-2 text-text-secondary cursor-pointer border-0 bg-transparent"
                    >
                      <Icons.RefreshCw className="w-3.5 h-3.5 text-primary" />
                      <span>Restart Interactive Tour</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Avatar & Settings Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center space-x-1.5 p-1 rounded hover:bg-surface-muted transition-colors cursor-pointer text-text-secondary"
            >
              <div className="w-7 h-7 rounded bg-primary/20 border border-primary/40 flex items-center justify-center font-bold text-xs text-primary">
                {user?.name?.split(' ').map(n => n[0]).join('') || 'IM'}
              </div>
              <Icons.ChevronDown className="w-3 h-3 text-text-muted hidden sm:inline-block" />
            </button>

            {isUserMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-60 rounded bg-surface border border-border-custom shadow-xl z-20 font-sans text-xs">
                  <div className="p-3 border-b border-border-custom bg-surface-muted">
                    <p className="font-semibold text-text-primary text-sm leading-tight">{user?.name}</p>
                    <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider mt-0.5">{user?.role}</p>
                    <p className="text-[10px] font-mono text-primary truncate mt-0.5">{user?.email}</p>
                  </div>
                  
                  {/* Theme Switcher block */}
                  <div className="p-2 border-b border-border-custom">
                    <span className="block text-[10px] font-mono font-semibold tracking-wider text-text-muted uppercase mb-1 px-2">
                      Console Theme Profile
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['light', 'dark', 'system'] as const).map((themeVal) => (
                        <button
                          key={themeVal}
                          onClick={() => {
                            setActiveTheme(themeVal);
                            setIsUserMenuOpen(false);
                          }}
                          className={`px-1.5 py-1 text-[10px] font-mono rounded border capitalize text-center cursor-pointer transition-all ${
                            activeTheme === themeVal
                              ? 'bg-primary/10 text-primary border-primary/50 font-bold'
                              : 'border-border-custom text-text-secondary hover:bg-surface-muted'
                          }`}
                        >
                          {themeVal}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language Switcher block */}
                  <div className="p-2 border-b border-border-custom bg-primary/5">
                    <span className="block text-[10px] font-mono font-semibold tracking-wider text-text-muted uppercase mb-1 px-2">
                      Console Language
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={async () => {
                          await setLocale('en');
                          setIsUserMenuOpen(false);
                        }}
                        className={`px-1.5 py-1 text-[10px] font-mono rounded border text-center cursor-pointer transition-all ${
                          locale === 'en'
                            ? 'bg-primary/10 text-primary border-primary/50 font-bold'
                            : 'border-border-custom text-text-secondary hover:bg-surface-muted'
                        }`}
                      >
                        English
                      </button>
                      <button
                        onClick={async () => {
                          await setLocale('hi');
                          setIsUserMenuOpen(false);
                        }}
                        className={`px-1.5 py-1 text-[10px] font-mono rounded border text-center cursor-pointer transition-all ${
                          locale === 'hi'
                            ? 'bg-primary/10 text-primary border-primary/50 font-bold'
                            : 'border-border-custom text-text-secondary hover:bg-surface-muted'
                        }`}
                      >
                        हिन्दी
                      </button>
                    </div>
                  </div>

                  <div className="p-1 border-b border-border-custom/40">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onRouteChange('#admin/audit-log');
                      }}
                      className="w-full text-left p-2 rounded hover:bg-surface-muted flex items-center space-x-2 text-text-secondary cursor-pointer text-xs"
                    >
                      <Icons.History className="w-3.5 h-3.5 text-text-muted" />
                      <span>Security Audit Logs</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setSystemPageModal('privacy');
                      }}
                      className="w-full text-left p-2 rounded hover:bg-surface-muted flex items-center space-x-2 text-text-secondary cursor-pointer text-xs"
                    >
                      <Icons.Shield className="w-3.5 h-3.5 text-text-muted" />
                      <span>Privacy Protocol</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setSystemPageModal('terms');
                      }}
                      className="w-full text-left p-2 rounded hover:bg-surface-muted flex items-center space-x-2 text-text-secondary cursor-pointer text-xs"
                    >
                      <Icons.FileText className="w-3.5 h-3.5 text-text-muted" />
                      <span>Terms of Use</span>
                    </button>
                  </div>

                  <div className="p-1">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left p-2 rounded hover:bg-status-critical/10 flex items-center space-x-2 text-status-critical cursor-pointer text-xs"
                    >
                      <Icons.LogOut className="w-3.5 h-3.5 text-status-critical" />
                      <span>De-authorize Console Node</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </header>

      <div className="flex-1 flex pt-14 pb-16 md:pb-0">
        
        {/* 2. DYNAMIC COLLAPSIBLE LEFT SIDEBAR */}
        <aside className={`tour-step-menu hidden md:flex flex-col bg-surface border-r border-border-custom transition-all duration-200 z-30 ${
          isSidebarCollapsed ? 'w-16' : 'w-60'
        }`}>
          {/* Collapse toggle */}
          <div className="h-12 border-b border-border-custom flex items-center justify-end px-3 bg-surface">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1 rounded hover:bg-surface-muted text-text-secondary cursor-pointer"
            >
              {isSidebarCollapsed ? (
                <Icons.ChevronRight className="w-4 h-4" />
              ) : (
                <Icons.ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          <nav className="flex-1 p-2 space-y-1">
            {navLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-surface-muted animate-pulse rounded-md m-1" />
              ))
            ) : (
              navItems.map((item) => {
                const isActive = currentRoute === `#${item.id}` || 
                  (item.id === 'dashboard' && currentRoute === '#dashboard') ||
                  (item.id === 'documents' && currentRoute.startsWith('#documents')) ||
                  (item.id === 'maintenance' && currentRoute.startsWith('#maintenance')) ||
                  (item.id === 'compliance' && currentRoute.startsWith('#compliance')) ||
                  (item.id === 'audit-log' && currentRoute.startsWith('#admin/audit-log'));

                return (
                  <button
                    key={item.id}
                    onClick={() => onRouteChange(`#${item.id}`)}
                    className={`w-full flex items-center space-x-3 p-2.5 rounded transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-white shadow shadow-primary/20'
                        : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                    }`}
                    title={item.title}
                  >
                    <div className="flex-shrink-0">
                      {renderIcon(item.icon, "w-5 h-5")}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className="text-xs font-medium truncate font-sans">
                        {t(`nav.${item.id}`, item.title)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </nav>

          {/* User metadata at bottom */}
          {!isSidebarCollapsed && user && (
            <div className="p-3 border-t border-border-custom bg-surface-muted/40 text-[10px] font-mono text-text-muted space-y-1">
              <div>PLANT: {user?.plant?.split(' - ')[1] || 'CORE'}</div>
              <div>ROLE: {user.role.toUpperCase()}</div>
              <div className="text-[9px] text-primary">SECURE DEPLOYMENT: NODE-A</div>
            </div>
          )}
        </aside>

        {/* 3. MAIN WORKSPACE CONTENT */}
        <main className="flex-1 flex flex-col p-4 md:p-6 overflow-x-hidden min-h-0 bg-background-custom">
          
          {/* dynamic breadcrumbs */}
          {!currentRoute.startsWith('#copilot') && (
            <div className="flex items-center space-x-1.5 text-[10px] font-mono text-text-muted mb-4 uppercase tracking-wider">
              {getBreadcrumbs().map((b, idx, arr) => (
                <span key={b} className="flex items-center space-x-1.5">
                  <span className={idx === arr.length - 1 ? 'text-primary font-bold' : ''}>
                    {b}
                  </span>
                  {idx < arr.length - 1 && <Icons.ChevronRight className="w-3 h-3 text-text-muted" />}
                </span>
              ))}
            </div>
          )}

          {children}
        </main>
      </div>

      {/* Dynamic In-App Active Toast Notification */}
      {activeToast && (
        <div className={`fixed bottom-20 md:bottom-6 right-6 z-50 p-4 rounded-xl border shadow-2xl flex items-start space-x-3.5 max-w-sm animate-bounce ${
          activeToast.type === 'critical' ? 'bg-status-critical/15 text-status-critical border-status-critical/30' :
          activeToast.type === 'warn' ? 'bg-status-warn/15 text-warning border-warning/30' :
          'bg-status-info/15 text-status-info border-status-info/30'
        }`}>
          <div className="pt-0.5 flex-shrink-0">
            {activeToast.type === 'critical' ? <Icons.ShieldAlert className="w-5 h-5" /> :
             activeToast.type === 'warn' ? <Icons.AlertTriangle className="w-5 h-5" /> :
             <Icons.Info className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex justify-between items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider truncate">{activeToast.title}</span>
              <button 
                onClick={dismissToast} 
                className="text-text-muted hover:text-white p-0.5 rounded cursor-pointer bg-transparent border-0"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-text-primary leading-normal font-sans">{activeToast.desc}</p>
            <button
              onClick={() => {
                onRouteChange('#notifications');
                dismissToast();
              }}
              className="text-[10px] font-mono text-primary hover:underline font-bold bg-transparent border-0 mt-2 block cursor-pointer"
            >
              Access Notifications Dashboard
            </button>
          </div>
        </div>
      )}

      {/* 4. MOBILE BOTTOM TAB NAVIGATION BAR (Visible <768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-border-custom grid grid-cols-5 items-center justify-center z-40 px-2 shadow-lg">
        
        {/* Home/Dashboard */}
        <button
          onClick={() => onRouteChange('#dashboard')}
          className={`flex flex-col items-center justify-center space-y-1 cursor-pointer transition-colors ${
            currentRoute === '#dashboard' ? 'text-primary' : 'text-text-secondary'
          }`}
        >
          <Icons.LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-sans font-medium">Home</span>
        </button>

        {/* Work Orders */}
        <button
          onClick={() => onRouteChange('#maintenance')}
          className={`flex flex-col items-center justify-center space-y-1 cursor-pointer transition-colors ${
            currentRoute.startsWith('#maintenance') ? 'text-primary' : 'text-text-secondary'
          }`}
        >
          <Icons.Wrench className="w-5 h-5" />
          <span className="text-[10px] font-sans font-medium font-sans">Works</span>
        </button>

        {/* Center elevated COPILOT FAB */}
        <div className="flex flex-col items-center justify-center -translate-y-4">
          <button
            onClick={() => onRouteChange('#copilot')}
            className={`w-12 h-12 rounded-full flex items-center justify-center bg-primary text-white border-4 border-background-custom shadow-lg cursor-pointer transform hover:scale-105 transition-all ${
              currentRoute.startsWith('#copilot') ? 'ring-2 ring-primary' : ''
            }`}
          >
            <Icons.Bot className="w-5 h-5 animate-pulse" />
          </button>
          <span className="text-[10px] font-sans font-semibold text-primary mt-1">Copilot</span>
        </div>

        {/* Dynamic QR Scanner Stub Trigger */}
        <button
          onClick={() => setIsQrScannerOpen(true)}
          className="flex flex-col items-center justify-center space-y-1 cursor-pointer text-text-secondary hover:text-primary transition-colors"
        >
          <Icons.QrCode className="w-5 h-5" />
          <span className="text-[10px] font-sans font-medium">Scan QR</span>
        </button>

        {/* Compliance Hub / Alerts */}
        <button
          onClick={() => onRouteChange('#compliance')}
          className={`flex flex-col items-center justify-center space-y-1 cursor-pointer transition-colors ${
            currentRoute.startsWith('#compliance') ? 'text-primary' : 'text-text-secondary'
          }`}
        >
          <Icons.ShieldCheck className="w-5 h-5" />
          <span className="text-[10px] font-sans font-medium">Compliance</span>
        </button>
      </nav>

      {/* 5. ⌘K COMMAND PALETTE OVERLAY DIALOG */}
      {isCommandOpen && (
        <div className="fixed inset-0 bg-bg/80 backdrop-blur-md flex items-start justify-center z-50 p-4 pt-[10vh] transition-all">
          <div className="fixed inset-0" onClick={() => setIsCommandOpen(false)} />
          <div className="bg-surface border border-border-custom w-full max-w-lg rounded-xl shadow-2xl relative z-10 overflow-hidden font-sans text-xs">
            
            {/* Header Input with keyboard navigation */}
            <div className="p-4 border-b border-border-custom flex items-center space-x-3 bg-surface-muted">
              <Icons.Search className="w-4 h-4 text-primary flex-shrink-0" />
              <input
                ref={commandInputRef}
                type="text"
                placeholder="Search tag (e.g. 'P-101'), SOP, clause, or hit Enter to search..."
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIndex(prev => (prev + 1) % Math.max(1, flattened.length));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIndex(prev => (prev - 1 + flattened.length) % Math.max(1, flattened.length));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIndex >= 0 && activeIndex < flattened.length) {
                      const selected = flattened[activeIndex];
                      if (selected.type === 'recent') {
                        handleSearchFreeText(selected.name);
                      } else {
                        handleSelectSuggestion(selected);
                      }
                    } else if (commandSearch.trim()) {
                      handleSearchFreeText(commandSearch);
                    }
                  } else if (e.key === 'Escape') {
                    setIsCommandOpen(false);
                  }
                }}
                className="w-full bg-transparent border-none text-text-primary focus:outline-none placeholder-text-muted text-sm"
              />
              {isSuggestLoading && (
                <Icons.Loader2 className="w-4 h-4 text-primary animate-spin" />
              )}
              <span className="text-[10px] font-mono bg-background-custom border border-border-custom px-1.5 py-0.5 rounded text-text-muted">
                ESC
              </span>
            </div>

            {/* Results Suggestions list */}
            <div className="max-h-96 overflow-y-auto divide-y divide-border-custom/40">
              
              {/* Recent Searches Panel */}
              {!commandSearch && recentSearches.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
                    <span>Recent Searches</span>
                    <button onClick={clearRecentSearches} className="hover:text-status-critical flex items-center space-x-1 font-sans font-medium text-[9px] lowercase cursor-pointer">
                      <Icons.Trash2 className="w-2.5 h-2.5" />
                      <span>clear</span>
                    </button>
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {recentSearches.map((term) => {
                      const flatIndex = flattened.findIndex(f => f.type === 'recent' && f.name === term);
                      const isItemActive = activeIndex === flatIndex;
                      return (
                        <button
                          key={term}
                          onClick={() => handleSearchFreeText(term)}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          className={`w-full text-left px-2.5 py-2 rounded-md flex items-center justify-between cursor-pointer transition-all ${
                            isItemActive ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary hover:bg-surface-muted/60'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <Icons.History className="w-3.5 h-3.5 text-text-muted" />
                            <span>{term}</span>
                          </div>
                          {isItemActive && <span className="text-[9px] font-mono bg-primary/20 text-primary px-1 rounded">ENTER</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grouped Results */}
              {suggestResults && (
                (['Documents', 'Equipment', 'Work Orders', 'Regulations', 'Actions'] as const).map((groupName) => {
                  const items = suggestResults[groupName] || [];
                  if (items.length === 0) return null;

                  return (
                    <div key={groupName} className="p-2">
                      <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider flex items-center justify-between">
                        <span>{groupName}</span>
                        <span className="text-[9px] px-1 py-0.2 bg-surface-muted text-text-muted rounded border border-border-custom/50 font-mono">
                          {items.length}
                        </span>
                      </div>
                      <div className="space-y-0.5 mt-1">
                        {items.map((item: any) => {
                          const flatIndex = flattened.findIndex(f => f.id === item.id && f.groupName === groupName);
                          const isItemActive = activeIndex === flatIndex;
                          
                          // Determine icon based on group
                          let groupIcon = <Icons.FileText className="w-3.5 h-3.5 text-primary" />;
                          if (groupName === 'Equipment') groupIcon = <Icons.Cpu className="w-3.5 h-3.5 text-accent" />;
                          if (groupName === 'Work Orders') groupIcon = <Icons.Wrench className="w-3.5 h-3.5 text-status-ok" />;
                          if (groupName === 'Regulations') groupIcon = <Icons.ShieldAlert className="w-3.5 h-3.5 text-status-warn" />;
                          if (groupName === 'Actions') groupIcon = <Icons.ArrowRight className="w-3.5 h-3.5 text-primary" />;

                          return (
                            <button
                              key={item.id}
                              onClick={() => handleSelectSuggestion(item)}
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              className={`w-full text-left px-2.5 py-2 rounded-md flex items-center justify-between cursor-pointer transition-all ${
                                isItemActive ? 'bg-primary/15 text-primary font-semibold' : 'text-text-secondary hover:bg-surface-muted/60'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5 min-w-0">
                                <div className="flex-shrink-0">{groupIcon}</div>
                                <div className="truncate">
                                  <span className="block font-medium truncate">{item.name || item.label}</span>
                                  {item.desc && (
                                    <span className="block text-[10px] text-text-muted font-normal truncate mt-0.5">{item.desc}</span>
                                  )}
                                </div>
                              </div>
                              {isItemActive && (
                                <span className="text-[9px] font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
                                  ENTER
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}

              {/* No suggestions helper */}
              {commandSearch && flattened.length === 0 && !isSuggestLoading && (
                <div className="p-8 text-center text-text-secondary">
                  <Icons.Search className="w-8 h-8 text-text-muted mx-auto mb-2 animate-pulse" />
                  <p className="font-semibold text-white">No explicit matches found</p>
                  <p className="text-[11px] text-text-secondary mt-1">
                    Press <kbd className="px-1 py-0.5 bg-surface-muted border border-border-custom rounded font-mono">Enter</kbd> to execute a dynamic refinery corpus search.
                  </p>
                </div>
              )}
            </div>

            {/* Help/Footer info */}
            <div className="p-3 border-t border-border-custom flex items-center justify-between bg-surface-muted text-[10px] font-mono text-text-muted font-sans">
              <div className="flex items-center space-x-3">
                <span className="flex items-center space-x-1">
                  <span className="bg-background-custom border border-border-custom px-1 py-0.2 rounded font-sans">↑↓</span>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="bg-background-custom border border-border-custom px-1 py-0.2 rounded">⏎</span>
                  <span>Select</span>
                </span>
              </div>
              <div>
                Press <span className="bg-background-custom border border-border-custom px-1 py-0.2 rounded">ESC</span> to dismiss
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 6. MOBILE DYNAMIC QR SCANNER STUB MODAL */}
      {isQrScannerOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col justify-between p-6">
          <div className="flex justify-between items-center text-white">
            <span className="font-mono text-xs font-bold">HMI BARCODE / QR SCANNER</span>
            <button onClick={() => setIsQrScannerOpen(false)} className="p-1 rounded bg-white/10 hover:bg-white/20">
              <Icons.X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            {/* Holographic Target Square */}
            <div className="w-64 h-64 border-2 border-primary rounded-xl relative flex flex-col items-center justify-center shadow-lg shadow-primary/20">
              {/* Laser line effect */}
              <div className="absolute left-0 right-0 h-[2px] bg-primary top-1/2 -translate-y-1/2 animate-bounce" />
              <Icons.QrCode className="w-20 h-20 text-primary/40" />
            </div>
            <p className="text-xs text-text-secondary mt-6 text-center max-w-xs font-mono">
              Align safety tag barcode or equipment QR plate inside the target frame.
            </p>
          </div>

          {/* Quick-select simulated tags for developer feedback */}
          <div className="bg-surface border border-border-custom p-4 rounded-lg text-xs space-y-2">
            <div className="font-mono text-accent text-[10px] font-bold uppercase tracking-wider">
              DEMONSTRATION SCAN SELECTOR: JUMP TO TARGET 360° VIEW
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setIsQrScannerOpen(false);
                  onRouteChange('#equipment');
                  // Quick simulate focusing on Pump P-101
                  alert('SIMULATING DISCOVERY: SCANNED TAG [P-101A] (Centrifugal Feed Pump). Swapping Workspace context.');
                }}
                className="p-2 rounded bg-background-custom border border-border-custom text-left hover:border-primary transition-colors cursor-pointer"
              >
                <div className="font-semibold text-text-primary font-mono text-[11px]">PUMP-101A</div>
                <div className="text-[10px] text-text-muted">Centrifugal Pump</div>
              </button>
              <button
                onClick={() => {
                  setIsQrScannerOpen(false);
                  onRouteChange('#equipment');
                  alert('SIMULATING DISCOVERY: SCANNED TAG [C-302B] (High-Pressure Reciprocating Compressor). Swapping Workspace.');
                }}
                className="p-2 rounded bg-background-custom border border-border-custom text-left hover:border-primary transition-colors cursor-pointer"
              >
                <div className="font-semibold text-text-primary font-mono text-[11px]">COMP-302B</div>
                <div className="text-[10px] text-text-muted">Comp. Station Sector 4</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. KEYBOARD SHORTCUTS MODAL (P17) */}
      {isShortcutsOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 font-sans animate-fade-in">
          <div className="fixed inset-0" onClick={() => setIsShortcutsOpen(false)} />
          <div className="bg-surface border border-border-custom rounded-xl shadow-2xl max-w-lg w-full relative z-10 overflow-hidden text-left">
            <div className="p-4 border-b border-border-custom bg-surface-muted flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Icons.Keyboard className="w-5 h-5 text-primary" />
                <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                  Command Desk Keyboard Shortcuts
                </h3>
              </div>
              <button 
                onClick={() => setIsShortcutsOpen(false)}
                className="text-text-muted hover:text-white cursor-pointer transition-colors border-0 bg-transparent"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-text-secondary leading-relaxed">
                Accelerate your industrial planning workflow with these hotkeys. Trigger actions or toggle navigation modules instantly from anywhere in the console.
              </p>
              
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs py-2 border-b border-border-custom/40">
                  <span className="text-text-secondary font-medium">Unified command search bar</span>
                  <kbd className="px-2 py-1 bg-background-custom border border-border-custom text-text-primary text-[10px] font-mono rounded shadow-sm">
                    ⌘K <span className="text-text-muted">or</span> Ctrl+K
                  </kbd>
                </div>
                
                <div className="flex items-center justify-between text-xs py-2 border-b border-border-custom/40">
                  <span className="text-text-secondary font-medium">Toggle plant executive dashboard</span>
                  <kbd className="px-2 py-1 bg-background-custom border border-border-custom text-text-primary text-[10px] font-mono rounded shadow-sm">
                    Alt+1 <span className="text-text-muted">or</span> Alt+D
                  </kbd>
                </div>
                
                <div className="flex items-center justify-between text-xs py-2 border-b border-border-custom/40">
                  <span className="text-text-secondary font-medium">Launch expert copilot agent chat</span>
                  <kbd className="px-2 py-1 bg-background-custom border border-border-custom text-text-primary text-[10px] font-mono rounded shadow-sm">
                    Alt+2 <span className="text-text-muted">or</span> Alt+C
                  </kbd>
                </div>
                
                <div className="flex items-center justify-between text-xs py-2 border-b border-border-custom/40">
                  <span className="text-text-secondary font-medium">Access maintenance worksheets</span>
                  <kbd className="px-2 py-1 bg-background-custom border border-border-custom text-text-primary text-[10px] font-mono rounded shadow-sm">
                    Alt+3 <span className="text-text-muted">or</span> Alt+M
                  </kbd>
                </div>
                
                <div className="flex items-center justify-between text-xs py-2 border-b border-border-custom/40">
                  <span className="text-text-secondary font-medium">Open reports & compliance analytics</span>
                  <kbd className="px-2 py-1 bg-background-custom border border-border-custom text-text-primary text-[10px] font-mono rounded shadow-sm">
                    Alt+4 <span className="text-text-muted">or</span> Alt+R
                  </kbd>
                </div>

                <div className="flex items-center justify-between text-xs py-2">
                  <span className="text-text-secondary font-medium">Toggle help & reference desk</span>
                  <kbd className="px-2 py-1 bg-background-custom border border-border-custom text-text-primary text-[10px] font-mono rounded shadow-sm">
                    Alt+H
                  </kbd>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-surface-muted border-t border-border-custom text-right">
              <button
                onClick={() => setIsShortcutsOpen(false)}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded font-mono text-xs font-bold transition-colors cursor-pointer"
              >
                CLOSE REGISTRY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. "WHAT'S NEW" CHANGELOG SLIDE-OUT DRAWER (P17) */}
      {isChangelogOpen && (
        <div className="fixed inset-0 z-[110] font-sans">
          {/* Overlay backdrop */}
          <div className="fixed inset-0 bg-black/60 transition-opacity" onClick={() => setIsChangelogOpen(false)} />
          
          <div className="fixed inset-y-0 right-0 max-w-md w-full bg-surface border-l border-border-custom shadow-2xl flex flex-col z-10 animate-slide-in">
            {/* Header */}
            <div className="p-4 border-b border-border-custom bg-surface-muted flex justify-between items-center text-left">
              <div className="flex items-center space-x-2">
                <Icons.Sparkles className="w-5 h-5 text-primary" />
                <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                  IndusMind System Updates
                </h3>
              </div>
              <button 
                onClick={() => setIsChangelogOpen(false)}
                className="p-1 rounded hover:bg-surface-muted text-text-muted hover:text-white cursor-pointer transition-colors border-0 bg-transparent"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Changelog Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-left">
              <div className="space-y-1">
                <p className="text-xs text-text-secondary leading-relaxed">
                  Stay updated with our continuously refined industrial intelligence systems. View historical logs fetched directly from our master server.
                </p>
              </div>

              {loadingChangelog ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Icons.Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs font-mono text-text-muted animate-pulse">Fetching changelog index ledger...</span>
                </div>
              ) : (
                <div className="relative border-l border-border-custom ml-1.5 space-y-8 pl-5 py-2">
                  {changelogData.map((log, idx) => (
                    <div key={log.id || idx} className="relative">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-4 ring-surface" />
                      
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 rounded uppercase">
                            {log.version}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted">
                            {log.date}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white tracking-tight">
                          {log.title}
                        </h4>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          {log.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 bg-surface-muted border-t border-border-custom flex justify-between items-center">
              <span className="text-[9px] font-mono text-text-muted">PLATFORM NODE V2.4.0</span>
              <button
                onClick={() => setIsChangelogOpen(false)}
                className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white rounded font-mono text-xs font-bold transition-colors cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. TOUR BACKDROP SPOTLIGHT OVERLAYS (P17) */}
      {tourActive && tourElementRect && (
        <div className="fixed inset-0 z-[99] pointer-events-none">
          {/* Top segment */}
          <div 
            className="fixed top-0 left-0 right-0 bg-black/75 transition-all duration-300" 
            style={{ height: `${Math.max(0, tourElementRect.top)}px` }} 
          />
          {/* Bottom segment */}
          <div 
            className="fixed left-0 right-0 bottom-0 bg-black/75 transition-all duration-300" 
            style={{ top: `${Math.max(0, tourElementRect.bottom)}px` }} 
          />
          {/* Left segment */}
          <div 
            className="fixed left-0 bg-black/75 transition-all duration-300" 
            style={{ 
              top: `${Math.max(0, tourElementRect.top)}px`, 
              height: `${tourElementRect.height}px`, 
              width: `${Math.max(0, tourElementRect.left)}px` 
            }} 
          />
          {/* Right segment */}
          <div 
            className="fixed right-0 bg-black/75 transition-all duration-300" 
            style={{ 
              top: `${Math.max(0, tourElementRect.top)}px`, 
              height: `${tourElementRect.height}px`, 
              left: `${Math.max(0, tourElementRect.right)}px` 
            }} 
          />
          
          {/* Pulsing visual focal ring */}
          <div 
            className="fixed border-2 border-primary rounded shadow-[0_0_15px_rgba(14,124,134,0.6)] animate-pulse transition-all duration-300 pointer-events-auto" 
            style={{ 
              top: `${tourElementRect.top - 2}px`, 
              left: `${tourElementRect.left - 2}px`, 
              width: `${tourElementRect.width + 4}px`, 
              height: `${tourElementRect.height + 4}px` 
            }} 
          />
        </div>
      )}

      {/* 4. TOUR TOOLTIP FLOATING PANEL (P17) */}
      {tourActive && tourSteps.length > 0 && (() => {
        const activeStep = tourSteps[currentTourStepIdx];
        if (!activeStep) return null;
        
        // Dynamic anchoring calculations
        const getTooltipStyle = () => {
          if (!tourElementRect) {
            // Screen centered fallback if element is missing
            return {
              position: 'fixed' as const,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 100,
              width: '320px'
            };
          }
          
          const { top, bottom, left, right, width, height } = tourElementRect;
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          const tooltipWidth = 320;
          const tooltipHeight = 200;
          
          let tooltipTop = bottom + 12;
          let tooltipLeft = left + width / 2 - tooltipWidth / 2;
          
          // Show above if bottom exceeds viewport
          if (tooltipTop + tooltipHeight > viewportHeight) {
            tooltipTop = top - tooltipHeight - 12;
          }
          if (tooltipTop < 0) tooltipTop = 12;
          
          // Clamp horizontally to screen bounds
          if (tooltipLeft + tooltipWidth > viewportWidth) {
            tooltipLeft = viewportWidth - tooltipWidth - 12;
          }
          if (tooltipLeft < 0) tooltipLeft = 12;
          
          return {
            position: 'fixed' as const,
            top: `${tooltipTop}px`,
            left: `${tooltipLeft}px`,
            zIndex: 100,
            width: `${tooltipWidth}px`
          };
        };

        const style = getTooltipStyle();
        
        return (
          <div 
            style={style}
            className="bg-surface border border-primary/45 rounded-xl shadow-2xl p-5 z-[100] font-sans text-left space-y-4 animate-fade-in text-white"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
                  SYSTEM TOUR · STEP {currentTourStepIdx + 1} OF {tourSteps.length}
                </span>
                <h4 className="font-display font-bold text-xs text-white">
                  {activeStep.title}
                </h4>
              </div>
              <button 
                onClick={() => setTourActive(false)}
                className="text-text-muted hover:text-white cursor-pointer transition-colors border-0 bg-transparent p-1 rounded hover:bg-surface-muted"
                title="Skip Tour"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-xs text-text-secondary leading-relaxed">
              {activeStep.body}
            </p>
            
            <div className="flex justify-between items-center pt-2 border-t border-border-custom/30">
              <button
                onClick={() => setTourActive(false)}
                className="text-[10px] font-mono font-bold text-text-muted hover:text-white transition-colors cursor-pointer uppercase border-0 bg-transparent"
              >
                Skip Tour
              </button>
              
              <div className="flex items-center space-x-2">
                <button
                  disabled={currentTourStepIdx === 0}
                  onClick={() => setCurrentTourStepIdx(prev => Math.max(0, prev - 1))}
                  className="p-1.5 rounded border border-border-custom hover:bg-surface-muted text-text-primary disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors border-0 bg-transparent"
                  title="Previous Step"
                >
                  <Icons.ChevronLeft className="w-3.5 h-3.5" />
                </button>
                
                {currentTourStepIdx < tourSteps.length - 1 ? (
                  <button
                    onClick={() => setCurrentTourStepIdx(prev => prev + 1)}
                    className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded font-mono text-[10px] font-bold transition-colors cursor-pointer flex items-center space-x-1"
                  >
                    <span>Next</span>
                    <Icons.ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setTourActive(false);
                      localStorage.setItem('indusmind_onboarding_tour_completed', 'true');
                    }}
                    className="px-3 py-1.5 bg-status-ok hover:bg-status-ok/90 text-white rounded font-mono text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    Finish Tour
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* System Markdown Pages Modal (N5) */}
      {systemPageModal && (
        <div className="fixed inset-0 bg-bg/85 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in text-xs">
          <div className="bg-surface border border-border-custom w-full max-w-2xl rounded-xl shadow-2xl p-6 flex flex-col max-h-[85vh] relative">
            <div className="flex items-center justify-between border-b border-border-custom pb-3 mb-4">
              <h3 className="font-display font-bold text-text-primary uppercase text-xs tracking-wider flex items-center space-x-2">
                <Icons.FileText className="w-4 h-4 text-primary" />
                <span>{systemPageModal === 'privacy' ? 'Privacy & Data Protection Protocol' : 'Terms of Use & Site Licenses'}</span>
              </h3>
              <button 
                onClick={() => setSystemPageModal(null)} 
                className="text-text-muted hover:text-text-primary p-1 rounded cursor-pointer min-h-[44px]"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap bg-background-custom border border-border-custom rounded-lg p-4 select-text max-h-[50vh]">
              {systemPageLoading ? (
                <div className="flex flex-col items-center justify-center space-y-2 py-12 text-text-muted animate-pulse">
                  <Icons.Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span>Loading markdown manifest...</span>
                </div>
              ) : (
                systemPageContent
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-border-custom mt-4">
              <button
                onClick={() => setSystemPageModal(null)}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow min-h-[44px]"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// 7. PAGE HEADER COMPONENT
interface PageHeaderProps {
  title: string;
  description?: string;
  actionSlot?: React.ReactNode;
}

export function PageHeader({ title, description, actionSlot }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-custom pb-4 mb-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-xs text-text-secondary mt-1 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actionSlot && (
        <div className="mt-4 md:mt-0 flex items-center space-x-2 flex-shrink-0">
          {actionSlot}
        </div>
      )}
    </div>
  );
}
