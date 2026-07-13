import { useState, useEffect, useRef } from 'react';
import { 
  Bot, UploadCloud, Network, Zap, ShieldAlert, History, Search, 
  Wrench, ShieldCheck, Database, Mail, ArrowRight, Play, X, Menu, 
  Globe, Check, ChevronDown, Sun, Moon, Sparkles, AlertTriangle, 
  FileText, ExternalLink, Calendar
} from 'lucide-react';
import { landingCopy } from '../../lib/content/landing';
import { StatusChip, ConfidenceBadge } from '../shared';

// Count-up helper component for Problem Strip
function CountUp({ target, suffix, duration = 1500 }: { target: number; suffix: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasStarted(true);
        }
      },
      { threshold: 0.1 }
    );
    if (elementRef.current) {
      observer.observe(elementRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasStarted) return;
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [hasStarted, target, duration]);

  return (
    <span ref={elementRef} className="font-mono text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-text-primary">
      {count}
      {suffix}
    </span>
  );
}

export function LandingPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeRoleTab, setActiveRoleTab] = useState('plant-manager');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [howItWorksStep, setHowItWorksStep] = useState(0);

  // Auto-rotate "How It Works" timeline steps
  useEffect(() => {
    const timer = setInterval(() => {
      setHowItWorksStep((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Reflect the currently-applied theme (the .dark class is applied globally in App.tsx).
  useEffect(() => {
    const syncFromDom = () => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    };
    syncFromDom();
    window.addEventListener('indusmind-theme-change', syncFromDom);
    return () => window.removeEventListener('indusmind-theme-change', syncFromDom);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    // Persist so the choice sticks across routes/reloads, and toggle the .dark class the
    // CSS actually keys off of. Broadcast so the root theme listener stays in sync.
    localStorage.setItem('appearance.theme', nextTheme);
    localStorage.setItem('indusmind_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.setAttribute('data-theme', nextTheme);
    window.dispatchEvent(new Event('indusmind-theme-change'));
  };

  const handleCta = () => {
    window.location.hash = '#login';
  };

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div id="landing-root" className="min-h-screen font-sans antialiased selection:bg-primary/30 selection:text-white bg-background-custom text-text-primary transition-colors duration-200">
      
      {/* 1) NAVBAR */}
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b bg-background-custom/80 border-border-custom/40 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-lg shadow-primary/20">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-text-primary">
                {landingCopy.navbar.logo}
              </span>
            </div>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center space-x-8">
              {landingCopy.navbar.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleSmoothScroll(e, link.href)}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center space-x-4">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-muted/30 transition-all cursor-pointer min-h-[44px] min-w-[44px]"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              <button
                onClick={handleCta}
                className="text-xs font-semibold text-text-secondary hover:text-text-primary px-4 py-2 transition-colors cursor-pointer min-h-[44px]"
              >
                {landingCopy.navbar.signInLabel}
              </button>
              <button
                onClick={handleCta}
                className="text-xs font-semibold bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-lg transition-all shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 cursor-pointer min-h-[44px]"
              >
                {landingCopy.navbar.launchDemoLabel}
              </button>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="flex items-center md:hidden space-x-2">
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary cursor-pointer min-h-[44px]"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Open menu"
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary cursor-pointer min-h-[44px] min-w-[44px]"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Full-Screen Sheet */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-background-custom p-6 flex flex-col justify-between animate-fade-in md:hidden">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-border-custom/40">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-display text-lg font-bold tracking-tight text-text-primary">
                    {landingCopy.navbar.logo}
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="p-2 rounded-lg text-text-secondary hover:text-text-primary cursor-pointer min-h-[44px] min-w-[44px]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col space-y-5 mt-8">
                {landingCopy.navbar.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={(e) => handleSmoothScroll(e, link.href)}
                    className="text-lg font-display font-medium text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="flex flex-col space-y-3 pb-8">
              <button
                onClick={handleCta}
                className="w-full text-center text-sm font-semibold text-text-primary border border-border-custom hover:bg-surface-muted/30 py-3 rounded-xl transition-all cursor-pointer min-h-[48px]"
              >
                {landingCopy.navbar.signInLabel}
              </button>
              <button
                onClick={handleCta}
                className="w-full text-center text-sm font-semibold bg-primary text-white py-3 rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer min-h-[48px]"
              >
                {landingCopy.navbar.launchDemoLabel}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* 2) HERO */}
      <header className="relative py-12 md:py-20 lg:py-24 overflow-hidden border-b border-border-custom/30">
        {/* Subtle Engineering Grid background */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style={{
            backgroundImage: `linear-gradient(var(--border-color) 1px, transparent 1px), linear-gradient(90deg, var(--border-color) 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />
        
        {/* Abstract animated node-graph background lines (CSS/SVG only) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none opacity-[0.06] dark:opacity-[0.12] hidden sm:block">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="grad-teal" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="20%" cy="30%" r="180" fill="url(#grad-teal)" className="animate-pulse" style={{ animationDuration: '8s' }} />
            <circle cx="80%" cy="70%" r="220" fill="url(#grad-teal)" className="animate-pulse" style={{ animationDuration: '12s' }} />
            <path d="M 100,200 L 300,120 L 450,280 L 600,150 L 750,300" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="5,5" />
            <path d="M 600,150 L 720,80 L 900,190" fill="none" stroke="var(--ai)" strokeWidth="1" strokeDasharray="3,3" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-mono font-bold tracking-widest uppercase border border-primary/20">
                <Sparkles className="w-3 h-3 text-ai animate-pulse" />
                <span>Next-Generation Plant Intelligence</span>
              </div>
              
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text-primary leading-[1.1]">
                {landingCopy.hero.headline}
              </h1>
              
              <p className="text-sm sm:text-base text-text-secondary max-w-xl leading-relaxed">
                {landingCopy.hero.subline}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <button
                  onClick={handleCta}
                  className="px-6 py-3 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 flex items-center justify-center space-x-2 cursor-pointer min-h-[44px]"
                >
                  <span>{landingCopy.hero.ctaPrimary}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsVideoOpen(true)}
                  className="px-6 py-3 bg-surface-muted/30 border border-border-custom hover:bg-surface-muted/50 text-text-primary text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-2 cursor-pointer min-h-[44px]"
                >
                  <Play className="w-4 h-4 text-ai fill-current" />
                  <span>{landingCopy.hero.ctaSecondary}</span>
                </button>
              </div>

              {/* Trust Strip */}
              <div className="pt-6 border-t border-border-custom/30">
                <p className="font-mono text-[10px] font-bold text-text-muted tracking-wider uppercase">
                  {landingCopy.hero.trustStrip}
                </p>
              </div>
            </div>

            {/* Right Interactive Mockup Column */}
            <div className="lg:col-span-5 relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-ai/5 rounded-3xl blur-2xl opacity-50 pointer-events-none" />
              
              {/* Framed slightly tilted DOM Screenshot */}
              <div className="relative border border-border-custom rounded-2xl bg-surface shadow-2xl p-4 overflow-hidden transform lg:hover:scale-[1.02] transition-transform duration-500 max-w-lg mx-auto select-none">
                {/* Window header */}
                <div className="flex items-center justify-between border-b border-border-custom pb-3 mb-4 font-mono text-[9px] text-text-muted">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-critical/30" />
                    <span className="w-2.5 h-2.5 rounded-full bg-status-warn/30" />
                    <span className="w-2.5 h-2.5 rounded-full bg-status-ok/30" />
                  </div>
                  <span><span>INDUSMIND_COPILOT_SHELL v1.0</span></span>
                  <div className="w-4 h-4 rounded border border-border-custom/50 flex items-center justify-center">
                    <Bot className="w-2.5 h-2.5" />
                  </div>
                </div>

                {/* Question */}
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-surface-muted border border-border-custom flex items-center justify-center font-mono text-[9px] text-text-secondary flex-shrink-0">
                      ENG
                    </div>
                    <div className="bg-surface-muted/60 border border-border-custom rounded-xl p-3 max-w-[85%] text-left">
                      <p className="text-xs font-semibold text-text-primary">
                        {landingCopy.hero.mockCopilot.question}
                      </p>
                    </div>
                  </div>

                  {/* Answer */}
                  <div className="flex items-start space-x-3 pt-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3 h-3 text-primary" />
                    </div>
                    <div className="bg-bg border border-primary/30 rounded-xl p-4 flex-1 space-y-3 text-left">
                      
                      {/* Meta stats */}
                      <div className="flex items-center justify-between border-b border-border-custom/50 pb-2">
                        <span className="text-[9px] font-mono text-text-muted uppercase">SYSTEM DECODER RESPONSE</span>
                        <div className="scale-90 transform origin-right">
                          <ConfidenceBadge confidence={landingCopy.hero.mockCopilot.confidence} />
                        </div>
                      </div>

                      <p className="text-xs text-text-secondary leading-relaxed">
                        {landingCopy.hero.mockCopilot.answer}
                      </p>

                      {/* Citations block */}
                      <div className="space-y-1.5 pt-2 border-t border-border-custom/40">
                        <span className="text-[8px] font-mono text-text-muted uppercase block">VERIFIED SYSTEM CITATIONS</span>
                        <div className="flex flex-wrap gap-1.5">
                          {landingCopy.hero.mockCopilot.citations.map((cit, idx) => (
                            <span 
                              key={idx} 
                              className="inline-flex items-center space-x-1 px-2 py-0.5 bg-surface-muted border border-border-custom/80 text-text-secondary text-[8px] font-mono rounded-md hover:border-primary/40 transition-colors"
                            >
                              <FileText className="w-2.5 h-2.5 text-primary" />
                              <span>{cit}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </header>

      {/* 3) PROBLEM STRIP (Dark layout) */}
      <section className="bg-bg border-b border-border-custom/40 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="font-mono text-[10px] font-bold text-ai tracking-widest uppercase mb-1">
              {landingCopy.problemStrip.title}
            </h2>
            <div className="h-0.5 w-12 bg-ai mx-auto mt-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {landingCopy.problemStrip.stats.map((stat, idx) => (
              <div 
                key={idx} 
                className="bg-surface-2 border border-border-custom/80 rounded-xl p-6 flex flex-col justify-between text-left group hover:border-primary/40 transition-all duration-300"
              >
                <div>
                  <div className="pb-3 border-b border-border-custom/30 mb-4">
                    <CountUp target={stat.targetVal} suffix={stat.suffix} />
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed font-sans">
                    {stat.caption}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-border-custom/20 flex items-center justify-between text-[9px] font-mono text-text-muted">
                  <span>METRIC NODE #{idx + 1}</span>
                  <span className="text-ai">ANALYZED</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4) PLATFORM FEATURE GRID (Anchor #platform) */}
      <section id="platform" className="py-16 md:py-24 border-b border-border-custom/30 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <span className="font-mono text-[10px] font-bold text-primary tracking-widest uppercase bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              OPERATIONAL SUITE
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
              {landingCopy.platform.title}
            </h2>
            <p className="text-sm text-text-secondary max-w-2xl mx-auto leading-relaxed">
              {landingCopy.platform.subtitle}
            </p>
          </div>

          {/* 6 Feature cards in a 3x2 grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {landingCopy.platform.features.map((feature) => {
              // Icon mapping
              const IconComp = {
                Bot: Bot,
                UploadCloud: UploadCloud,
                Network: Network,
                Zap: Zap,
                ShieldAlert: ShieldAlert,
                History: History
              }[feature.icon] || Bot;

              return (
                <div 
                  key={feature.id}
                  className="bg-surface border border-border-custom rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between hover:border-primary/50 group"
                >
                  <div className="space-y-4 text-left">
                    {/* Icon container */}
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary transition-colors duration-300">
                      <IconComp className="w-5 h-5 text-primary group-hover:text-on-primary transition-colors" />
                    </div>

                    <h3 className="font-display text-base font-bold text-text-primary tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  {/* Signature Details visual widgets */}
                  <div className="mt-6 pt-4 border-t border-border-custom/50 bg-background-custom/30 rounded-xl p-3 text-left">
                    {feature.signatureType === 'copilot' && (
                      <div className="space-y-1 font-mono text-[9px]">
                        <span className="text-text-muted block font-bold">LIVE SOURCE EXTRAPOLATION:</span>
                        <div className="flex flex-wrap gap-1">
                          <span className="bg-surface border border-border-custom px-1.5 py-0.5 rounded text-primary">[Vendor-Manual-v3.pdf]</span>
                          <span className="bg-surface border border-border-custom px-1.5 py-0.5 rounded text-primary">[OISD-116.csv]</span>
                        </div>
                      </div>
                    )}

                    {feature.signatureType === 'ingestion' && (
                      <div className="flex items-center justify-between font-mono text-[9px] text-text-muted">
                        <span>OCR Extraction</span>
                        <span className="text-primary font-bold">→</span>
                        <span>Entity Extraction</span>
                        <span className="text-primary font-bold">→</span>
                        <span>Linkage</span>
                      </div>
                    )}

                    {feature.signatureType === 'graph' && (
                      <div className="flex items-center space-x-2 font-mono text-[9px]">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-text-secondary">P-101B</span>
                        <span className="text-text-muted">linked to</span>
                        <span className="w-2 h-2 rounded-full bg-accent" />
                        <span className="text-text-secondary">TEMP-SENSOR-4</span>
                      </div>
                    )}

                    {feature.signatureType === 'predictive' && (
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-text-secondary uppercase">Risk Matrix Wave</span>
                        {/* Inline sparkline SVG */}
                        <svg className="w-20 h-4 text-status-critical" fill="none" viewBox="0 0 100 20">
                          <path d="M 0,10 Q 20,2 40,15 T 80,1 T 100,10" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}

                    {feature.signatureType === 'compliance' && (
                      <div className="flex items-center justify-between font-mono text-[9px]">
                        <span className="text-status-ok bg-status-ok/10 border border-status-ok/20 px-1.5 py-0.5 rounded">OISD-GDN-115 compliant</span>
                        <span className="text-text-muted">Active Audit</span>
                      </div>
                    )}

                    {feature.signatureType === 'lessons' && (
                      <div className="flex items-center space-x-1.5 font-mono text-[9px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warn animate-pulse" />
                        <span className="text-status-warn font-semibold">Stator Failure Pattern Found (June '25)</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5) HOW IT WORKS TIMELINE (Anchor #how) */}
      <section id="how" className="py-16 md:py-24 bg-bg border-b border-border-custom/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <span className="font-mono text-[10px] font-bold text-ai tracking-widest uppercase bg-ai/10 px-3 py-1 rounded-full border border-ai/20">
              IMPLEMENTATION BLUEPRINT
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
              {landingCopy.howItWorks.title}
            </h2>
            <p className="text-sm text-text-secondary max-w-2xl mx-auto leading-relaxed">
              {landingCopy.howItWorks.subtitle}
            </p>
          </div>

          {/* Horizontal Steps Timeline */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            {/* Visual connector line on desktop */}
            <div className="absolute top-[34px] left-8 right-8 h-[1px] bg-border-custom/50 hidden md:block" />

            {landingCopy.howItWorks.steps.map((step, idx) => {
              const isActive = howItWorksStep === idx;
              return (
                <div 
                  key={step.number}
                  onClick={() => setHowItWorksStep(idx)}
                  className={`relative p-6 rounded-2xl border text-left cursor-pointer transition-all duration-300 ${
                    isActive 
                      ? 'bg-surface-2 border-primary shadow-xl shadow-primary/5' 
                      : 'bg-surface-2/50 border-border-custom/40 hover:border-border-custom/80'
                  }`}
                >
                  {/* Step bubble */}
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-bold border transition-colors duration-300 ${
                      isActive 
                        ? 'bg-primary text-on-primary border-primary' 
                        : 'bg-surface-muted text-text-secondary border-border-custom'
                    }`}>
                      {step.number}
                    </span>
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-ai animate-ping" />
                    )}
                  </div>

                  <h3 className={`font-display text-sm font-bold tracking-tight transition-colors duration-300 ${
                    isActive ? 'text-text-primary' : 'text-text-secondary'
                  }`}>
                    {step.title}
                  </h3>
                  
                  <p className="text-xs text-text-muted mt-2 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6) ROLES TABS (Anchor #solutions) */}
      <section id="solutions" className="py-16 md:py-24 border-b border-border-custom/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
            <span className="font-mono text-[10px] font-bold text-primary tracking-widest uppercase bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              Crew Alignment
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
              {landingCopy.roles.title}
            </h2>
            <p className="text-sm text-text-secondary max-w-2xl mx-auto leading-relaxed">
              {landingCopy.roles.subtitle}
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-10 border-b border-border-custom/40 pb-4">
            {landingCopy.roles.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveRoleTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-display font-medium transition-all cursor-pointer min-h-[44px] ${
                  activeRoleTab === tab.id 
                    ? 'bg-primary/15 text-primary border border-primary/40 shadow-sm' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted/30 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Selected Tab content */}
          {landingCopy.roles.tabs.map((tab) => {
            if (tab.id !== activeRoleTab) return null;

            return (
              <div key={tab.id} className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center animate-fade-in text-left">
                
                {/* Text specs */}
                <div className="lg:col-span-7 space-y-5">
                  <h3 className="font-display text-xl font-bold text-text-primary">
                    For {tab.label}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {tab.valueProp}
                  </p>

                  <ul className="space-y-3 pt-2">
                    {tab.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start space-x-3 text-xs text-text-secondary">
                        <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3.5 h-3.5 text-primary" />
                        </span>
                        <span className="leading-normal">{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4">
                    <button 
                      onClick={handleCta}
                      className="px-5 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
                    >
                      Explore {tab.label} Sandbox
                    </button>
                  </div>
                </div>

                {/* UI Vignette wrapper */}
                <div className="lg:col-span-5">
                  <div className="bg-surface border border-border-custom rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-border-custom/50 pb-3">
                      <span className="font-mono text-[9px] text-text-muted uppercase tracking-wider">HMI DIAGNOSTIC VIGNETTE</span>
                      <StatusChip label={tab.vignette.status} type={tab.vignette.status === 'Nominal' || tab.vignette.status === 'Ready for Audit' ? 'ok' : 'warn'} />
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-text-primary block">{tab.vignette.title}</span>
                      <div className="inline-flex px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-ai/10 text-ai border border-ai/20 uppercase">
                        {tab.vignette.badge}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border-custom/50">
                      <div>
                        <span className="font-mono text-[8px] text-text-muted uppercase block">{tab.vignette.metricLabel}</span>
                        <span className="font-mono text-xl font-bold text-text-primary">{tab.vignette.metric}</span>
                      </div>
                      <div>
                        <span className="font-mono text-[8px] text-text-muted uppercase block">ENGINE TELEMETRY</span>
                        <span className="font-mono text-[10px] text-status-ok flex items-center space-x-1 mt-1 font-bold">
                          <span className="w-1.5 h-1.5 bg-status-ok rounded-full animate-ping mr-1" />
                          <span>SYNCHRONIZED</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </section>

      {/* 7) IMPACT SPLIT SECTION (Anchor #impact) */}
      <section id="impact" className="py-16 md:py-24 bg-bg border-b border-border-custom/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center text-left">
            
            {/* Left testimonial */}
            <div className="lg:col-span-6 space-y-6">
              <span className="font-mono text-[10px] font-bold text-ai tracking-widest uppercase bg-ai/10 px-3 py-1 rounded-full border border-ai/20">
                PROVEN ON-SITE VALUE
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
                {landingCopy.impact.title}
              </h2>
              <p className="text-xs text-text-secondary leading-relaxed">
                {landingCopy.impact.subtitle}
              </p>

              <blockquote className="border-l-4 border-primary pl-6 italic text-sm text-text-secondary">
                {landingCopy.impact.testimonial.quote}
              </blockquote>

              <div className="flex items-center space-x-3 pt-2">
                <div className="w-8 h-8 rounded-full bg-surface border border-border-custom flex items-center justify-center font-mono text-xs font-bold text-text-primary uppercase">
                  AM
                </div>
                <div>
                  <p className="text-xs font-bold text-text-primary">{landingCopy.impact.testimonial.author}</p>
                  <p className="text-[10px] text-text-muted">{landingCopy.impact.testimonial.role}</p>
                </div>
              </div>
            </div>

            {/* Right Metric Tiles */}
            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {landingCopy.impact.metrics.map((metric, mIdx) => {
                const IconComponent = {
                  Search: Search,
                  Wrench: Wrench,
                  ShieldCheck: ShieldCheck,
                  Database: Database
                }[metric.icon] || Database;

                return (
                  <div key={mIdx} className="bg-surface-2 border border-border-custom p-5 rounded-2xl flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <IconComponent className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-mono text-[8px] text-text-muted uppercase">LEDGER #{mIdx+100}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="font-mono text-[10px] text-text-muted uppercase block">{metric.label}</span>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs text-text-muted line-through">{metric.oldVal}</span>
                        <span className="text-primary font-bold">→</span>
                        <span className="font-mono text-lg font-bold text-text-primary">{metric.newVal}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </section>

      {/* 8) FAQ ACCORDION (Anchor #faq) */}
      <section id="faq" className="py-16 md:py-24 border-b border-border-custom/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 space-y-4">
            <span className="font-mono text-[10px] font-bold text-primary tracking-widest uppercase bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              KNOWLEDGE BASE
            </span>
            <h2 className="font-display text-3xl font-bold tracking-tight text-text-primary">
              {landingCopy.faq.title}
            </h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              {landingCopy.faq.subtitle}
            </p>
          </div>

          {/* Accordion Questions */}
          <div className="divide-y divide-border-custom/50 border-t border-b border-border-custom/50">
            {landingCopy.faq.items.map((item, fIdx) => {
              const isOpen = activeFaq === fIdx;

              return (
                <div key={fIdx} className="py-4 text-left">
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : fIdx)}
                    className="w-full flex justify-between items-center py-2 text-text-primary hover:text-primary transition-colors cursor-pointer min-h-[44px]"
                  >
                    <span className="text-xs sm:text-sm font-bold leading-normal">
                      {item.question}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
                  </button>

                  <div 
                    className={`overflow-hidden transition-all duration-300 ${
                      isOpen ? 'max-h-[300px] mt-2 opacity-100 pb-2' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <p className="text-xs text-text-secondary leading-relaxed pl-1 select-text">
                      {item.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 9) FINAL CTA BAND */}
      <section className="py-16 relative overflow-hidden bg-primary">
        {/* Abstract structural grid overlay */}
        <div 
          className="absolute inset-0 opacity-[0.06] pointer-events-none" 
          style={{
            backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
            backgroundSize: '20px 20px'
          }}
        />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-6">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {landingCopy.ctaBand.headline}
          </h2>
          <div className="h-1 w-16 bg-ai mx-auto" />
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <button
              onClick={handleCta}
              className="w-full sm:w-auto px-8 py-3.5 bg-white text-primary hover:bg-slate-100 text-xs font-bold rounded-lg transition-all shadow-xl cursor-pointer min-h-[44px]"
            >
              {landingCopy.ctaBand.primaryCta}
            </button>
            <a
              href="mailto:sales@indusmind.ai"
              className="w-full sm:w-auto px-8 py-3.5 bg-transparent text-white border border-white hover:bg-white/10 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-2 cursor-pointer min-h-[44px]"
            >
              <Mail className="w-4 h-4" />
              <span>{landingCopy.ctaBand.secondaryCta}</span>
            </a>
          </div>
        </div>
      </section>

      {/* 10) FOOTER */}
      <footer className="bg-bg text-text-secondary border-t border-border-custom/50 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 text-left">
            {landingCopy.footer.cols.map((col, colIdx) => (
              <div key={colIdx} className="space-y-4">
                <h3 className="font-display text-xs font-bold text-text-primary uppercase tracking-wider">
                  {col.title}
                </h3>
                <ul className="space-y-2.5">
                  {col.links.map((link, lIdx) => (
                    <li key={lIdx}>
                      <a 
                        href={link.href} 
                        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-border-custom/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-display font-bold text-text-primary text-sm">
                {landingCopy.navbar.logo}
              </span>
            </div>
            
            <p className="text-[11px] text-text-muted">
              {landingCopy.footer.copyright}
            </p>

            <span className="inline-flex px-2 py-0.5 rounded bg-surface-muted text-text-muted border border-border-custom/80 font-mono text-[9px]">
              {landingCopy.footer.buildTag}
            </span>
          </div>
        </div>
      </footer>

      {/* VIDEO MODAL PLACEHOLDER */}
      {isVideoOpen && (
        <div className="fixed inset-0 bg-[#07090b]/90 backdrop-blur-md flex items-center justify-center z-[200] p-4 animate-fade-in text-xs">
          <div className="bg-surface border border-border-custom w-full max-w-3xl rounded-xl shadow-2xl p-6 relative">
            <button 
              onClick={() => setIsVideoOpen(false)} 
              aria-label="Close modal"
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary p-2 rounded cursor-pointer min-h-[44px] min-w-[44px]"
            >
              <X className="w-5 h-5" />
            </button>
 
            <div className="border-b border-border-custom pb-3 mb-4 text-left">
              <h3 className="font-display font-bold text-text-primary text-sm flex items-center space-x-2">
                <Play className="w-4 h-4 text-ai fill-current" />
                <span>IndusMind Executive Product Tour (2-Min Demo)</span>
              </h3>
            </div>
 
            {/* Video Box simulated */}
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex flex-col items-center justify-center space-y-4 border border-border-custom">
              <div 
                className="absolute inset-0 opacity-[0.05] pointer-events-none" 
                style={{
                  backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
                  backgroundSize: '16px 16px'
                }}
              />
              <Bot className="w-16 h-16 text-primary animate-bounce" />
              <div className="text-center px-4">
                <span className="block font-display text-base font-bold text-white">Video Demonstration Feed</span>
                <span className="block font-mono text-[10px] text-ai uppercase mt-1">Simulated Live Feed • Press ESC or Click X to exit</span>
              </div>
            </div>
 
            <div className="flex justify-end pt-4 mt-4 border-t border-border-custom">
              <button
                onClick={handleCta}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg transition-colors shadow shadow-primary/20 cursor-pointer min-h-[44px]"
              >
                Launch Sandbox Environment
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
