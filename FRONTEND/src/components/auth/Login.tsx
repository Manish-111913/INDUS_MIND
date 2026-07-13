/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { Bot, Shield, Cpu, ArrowRight } from 'lucide-react';
import { useLoginMutation } from '../../lib/api/auth';
import { useState } from 'react';

// Validation Schema using Zod
const loginSchema = z.object({
  email: z.string().email({ message: 'Enter a valid enterprise email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const QUICK_USERS = [
  { email: 'admin@indusmind.io', role: 'Admin (Aditya)', desc: 'Full System Access' },
  { email: 'manager@indusmind.io', role: 'Plant Manager (Rajesh)', desc: 'KPIs & Approvals' },
  { email: 'engineer@indusmind.io', role: 'Maint. Engineer (Priya)', desc: 'RCA & Scheduling' },
  { email: 'tech@indusmind.io', role: 'Field Technician (Arun)', desc: 'WO Execution (Mobile)' },
  { email: 'compliance@indusmind.io', role: 'Compliance Officer (Meena)', desc: 'Regulations & Audits' },
];

export function Login() {
  const loginMutation = useLoginMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      await loginMutation.mutateAsync({
        email: values.email,
        password: values.password,
      });
      // Redirect to dashboard is handled in App.tsx by observing authStore state
      window.location.hash = '#dashboard';
    } catch (err: any) {
      setServerError(err?.error?.message || 'Authentication failed. Please check credentials.');
    }
  };

  const fillCredentials = (email: string) => {
    setValue('email', email);
    setValue('password', 'Demo@1234');
    setServerError(null);
  };

  return (
    <div className="min-h-screen flex bg-background-custom text-text-primary overflow-hidden">
      
      {/* LEFT SIDE: Brand / HMI Control Room Panel (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary/15 via-primary/5 to-bg border-r border-border-custom items-center justify-center p-12">
        
        {/* Subtle Engineering Grid Background Overlay */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none" 
          style={{
            backgroundImage: `linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />

        <div className="relative z-10 max-w-lg">
          <div className="flex items-center space-x-3 mb-8">
            <div className="p-2.5 rounded bg-primary/20 border border-primary/40 text-primary">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <span className="font-display text-2xl font-bold tracking-tight text-text-primary">IndusMind</span>
              <span className="block font-mono text-[10px] text-primary tracking-widest uppercase">Knowledge Intelligence</span>
            </div>
          </div>

          <h1 className="font-display text-4xl font-extrabold tracking-tight text-text-primary mb-4 leading-tight">
            The operations brain for asset-intensive industry
          </h1>
          
          <p className="text-text-secondary text-base mb-8 leading-relaxed">
            Unifying engineering P&IDs, equipment timelines, compliance procedures, and work order histories into an intelligent, secure control-room interface.
          </p>

          {/* Core capability chips */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="flex items-center space-x-3 p-3 bg-white/[0.02] border border-border-custom rounded">
              <Cpu className="w-5 h-5 text-primary" />
              <span className="text-xs font-mono text-text-secondary">360° Asset Health</span>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-white/[0.02] border border-border-custom rounded">
              <Shield className="w-5 h-5 text-accent" />
              <span className="text-xs font-mono text-text-secondary">Regulatory Audit Ready</span>
            </div>
          </div>

          <div className="pt-6 border-t border-border-custom flex items-center justify-between text-[11px] font-mono text-text-muted">
            <span>SECURE SYSTEM CONNECTION [SSL]</span>
            <span>HMI V1.0.0-PROMPT.P0</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Auth Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 md:px-12 lg:px-16 bg-surface relative">
        <div className="max-w-md w-full mx-auto">
          
          {/* Mobile App Header */}
          <div className="lg:hidden flex items-center space-x-2.5 mb-8">
            <div className="p-2 rounded bg-primary/20 text-primary">
              <Bot className="w-6 h-6" />
            </div>
            <span className="font-display text-xl font-bold text-text-primary">IndusMind</span>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold tracking-tight text-text-primary">
              System Authorization
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Provide credentials to access your industrial plant node.
            </p>
          </div>

          {serverError && (
            <motion.div 
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 mb-6 rounded text-xs bg-status-critical/10 border border-status-critical/20 text-status-critical font-mono"
            >
              FAULT: {serverError}
            </motion.div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-text-secondary mb-1 uppercase tracking-wider">
                Enterprise Email
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="engineer@indusmind.io"
                className="w-full px-3 py-2 bg-background-custom text-text-primary text-sm border border-border-custom focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded transition-all font-sans"
              />
              {errors.email && (
                <p className="text-[11px] text-status-critical font-mono mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-mono text-text-secondary uppercase tracking-wider">
                  Password
                </label>
                <a 
                  href="#forgot-password" 
                  className="text-xs font-mono text-primary hover:text-primary-hover hover:underline"
                >
                  Forgot Password?
                </a>
              </div>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-background-custom text-text-primary text-sm border border-border-custom focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded transition-all font-sans"
              />
              {errors.password && (
                <p className="text-[11px] text-status-critical font-mono mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none rounded transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-md shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{loginMutation.isPending ? 'Establishing Node Link...' : 'Link to Operational Console'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Social login stub */}
          <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-custom"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-2 text-text-muted font-mono text-[10px]">
                  Or Enterprise SSO
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button"
                onClick={() => alert('Microsoft Azure AD login is currently stubbed in HMI Mock State.')}
                className="flex items-center justify-center py-1.5 px-3 border border-border-custom hover:bg-surface-muted rounded text-xs font-mono text-text-secondary transition-colors cursor-pointer"
              >
                Microsoft SSO
              </button>
              <button 
                type="button"
                onClick={() => alert('Google Workspace login is currently stubbed in HMI Mock State.')}
                className="flex items-center justify-center py-1.5 px-3 border border-border-custom hover:bg-surface-muted rounded text-xs font-mono text-text-secondary transition-colors cursor-pointer"
              >
                Google Auth
              </button>
            </div>
          </div>

          {/* Developer quick-fill user matrix */}
          <div className="mt-8 pt-6 border-t border-border-custom">
            <span className="block font-mono text-[10px] text-accent tracking-widest uppercase mb-3">
              ⚠ DEVELOPMENT CONTROLS: QUICK CONSOLE LINKS
            </span>
            <div className="space-y-1.5">
              {QUICK_USERS.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  onClick={() => fillCredentials(user.email)}
                  className="w-full flex items-center justify-between p-2 text-left bg-background-custom border border-border-custom hover:border-primary hover:bg-primary/5 rounded transition-all cursor-pointer group"
                >
                  <div className="truncate">
                    <p className="text-xs font-semibold text-text-primary group-hover:text-primary transition-colors">
                      {user.role}
                    </p>
                    <p className="text-[10px] font-mono text-text-muted truncate">
                      {user.email}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono bg-surface-muted px-1.5 py-0.5 rounded text-text-secondary group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    Fill Creds
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
