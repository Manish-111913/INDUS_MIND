/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bot, ArrowLeft, KeyRound, Check, X } from 'lucide-react';
import { api } from '../../lib/api/client';

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password policy validation
  const hasMinLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const allPolicyPassed = hasMinLen && hasUpper && hasSymbol;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!allPolicyPassed) {
      setError('Password does not satisfy the secure cryptographic policy checklist.');
      return;
    }

    if (password !== confirm) {
      setError('Confirm password field must exactly match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { password });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Error occurred during password registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-custom p-6">
      <div className="max-w-md w-full p-8 bg-surface border border-border-custom rounded-lg shadow-xl relative">
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style={{
            backgroundImage: `linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)`,
            backgroundSize: '16px 16px'
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-6 justify-center">
            <Bot className="w-6 h-6 text-primary" />
            <span className="font-display text-lg font-bold text-text-primary">IndusMind Core</span>
          </div>

          <h2 className="font-display text-xl font-bold text-center text-text-primary mb-2">
            Rotate Node Credentials
          </h2>
          <p className="text-sm text-text-secondary text-center mb-6">
            Enter your new secure credential password to finalize key registration.
          </p>

          {error && (
            <div className="p-3 mb-4 rounded text-xs bg-status-critical/10 border border-status-critical/20 text-status-critical font-mono">
              FAULT: {error}
            </div>
          )}

          {submitted ? (
            <div className="p-4 rounded bg-status-ok/10 border border-status-ok/20 text-center">
              <p className="text-sm text-status-ok font-mono font-medium mb-1">
                KEY CREDENTIAL ROTATED
              </p>
              <p className="text-xs text-text-secondary mb-4">
                Your credentials have been re-encrypted on the mock server. You can now establish an active console link.
              </p>
              <a
                href="#login"
                className="inline-block px-4 py-2 text-xs font-mono text-white bg-primary hover:bg-primary-hover rounded transition-colors"
              >
                Go to Authentication
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-text-secondary uppercase tracking-wider mb-1">
                  New Secure Password
                </label>
                <input
                  type="password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-background-custom text-text-primary text-sm border border-border-custom focus:outline-none focus:border-primary rounded font-sans disabled:opacity-50"
                />

                {/* Password Policy Checklist */}
                <div className="mt-2.5 p-3 rounded bg-background-custom/50 border border-border-custom/50 space-y-1.5 text-[11px] font-mono">
                  <span className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">Cryptographic Policy Checklist:</span>
                  <div className="flex items-center space-x-2">
                    {hasMinLen ? (
                      <Check className="w-3.5 h-3.5 text-status-ok" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-status-critical" />
                    )}
                    <span className={hasMinLen ? "text-status-ok" : "text-text-secondary"}>At least 8 characters ({password.length}/8)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {hasUpper ? (
                      <Check className="w-3.5 h-3.5 text-status-ok" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-status-critical" />
                    )}
                    <span className={hasUpper ? "text-status-ok" : "text-text-secondary"}>Contains at least 1 uppercase letter</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {hasSymbol ? (
                      <Check className="w-3.5 h-3.5 text-status-ok" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-status-critical" />
                    )}
                    <span className={hasSymbol ? "text-status-ok" : "text-text-secondary"}>Contains at least 1 symbol/special char</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-text-secondary uppercase tracking-wider mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  disabled={loading}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-background-custom text-text-primary text-sm border border-border-custom focus:outline-none focus:border-primary rounded font-sans disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !allPolicyPassed}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <KeyRound className="w-4 h-4" />
                <span>{loading ? 'Registering Key...' : 'Register New Key'}</span>
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-border-custom text-center">
            <a
              href="#login"
              className="inline-flex items-center space-x-2 text-xs font-mono text-text-secondary hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Console Link</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
