/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { Bot, Shield, Cpu, ArrowRight, UserPlus } from 'lucide-react';
import { useRegisterMutation } from '../../lib/api/auth';
import { useState } from 'react';

// Validation Schema using Zod.
// The password rules mirror the backend's default tenant policy (AuthService
// ._password_policy: 10 chars + a number + a symbol). A tenant can override the
// policy server-side, so the server stays the source of truth — these rules only
// exist to fail fast with a useful message instead of a round-trip 422.
const signUpSchema = z
  .object({
    name: z.string().min(2, { message: 'Enter your full name (min. 2 characters)' }),
    email: z.string().email({ message: 'Enter a valid enterprise email address' }),
    password: z
      .string()
      .min(10, { message: 'Password must be at least 10 characters' })
      .regex(/\d/, { message: 'Password must contain at least one number' })
      .regex(/[^a-zA-Z0-9]/, { message: 'Password must contain at least one symbol' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SignUpFormValues = z.infer<typeof signUpSchema>;

export function SignUp() {
  const registerMutation = useRegisterMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: SignUpFormValues) => {
    setServerError(null);
    try {
      await registerMutation.mutateAsync({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      // Auto-login on success; redirect handled in App.tsx by observing authStore state
      window.location.hash = '#dashboard';
    } catch (err: any) {
      setServerError(err?.error?.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex bg-background-custom text-text-primary">

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
            Provision your operational node
          </h1>

          <p className="text-text-secondary text-base mb-8 leading-relaxed">
            Create an account to connect your engineering documents, equipment timelines, and work-order histories into a single secure control-room intelligence layer.
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

      {/* RIGHT SIDE: Registration Form */}
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
              Create Operator Account
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Register a new operator identity for your industrial plant node.
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
                Full Name
              </label>
              <input
                {...register('name')}
                type="text"
                placeholder="e.g. Aditya Vardhan"
                className="w-full px-3 py-2 bg-background-custom text-text-primary text-sm border border-border-custom focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded transition-all font-sans"
              />
              {errors.name && (
                <p className="text-[11px] text-status-critical font-mono mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

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
              <label className="block text-xs font-mono text-text-secondary mb-1 uppercase tracking-wider">
                Password
              </label>
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

            <div>
              <label className="block text-xs font-mono text-text-secondary mb-1 uppercase tracking-wider">
                Confirm Password
              </label>
              <input
                {...register('confirmPassword')}
                type="password"
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-background-custom text-text-primary text-sm border border-border-custom focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded transition-all font-sans"
              />
              {errors.confirmPassword && (
                <p className="text-[11px] text-status-critical font-mono mt-1">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-primary hover:bg-primary-hover focus:outline-none rounded transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-md shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" />
              <span>{registerMutation.isPending ? 'Provisioning Node Access...' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Link back to sign in */}
          <div className="mt-8 pt-6 border-t border-border-custom text-center">
            <p className="text-xs text-text-secondary">
              Already have an operator account?{' '}
              <a
                href="#login"
                className="font-semibold text-primary hover:text-primary-hover hover:underline"
              >
                Sign in to the console
              </a>
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
