/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bot, ArrowLeft, Send } from 'lucide-react';
import { api } from '../../lib/api/client';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setLoading(true);
      setError(null);
      try {
        await api.post('/auth/forgot-password', { email });
        setSubmitted(true);
      } catch (err: any) {
        setError(err?.message || 'Failed to transmit recovery token.');
      } finally {
        setLoading(false);
      }
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
            Reset Node Security Key
          </h2>
          <p className="text-sm text-text-secondary text-center mb-6">
            Enter your certified enterprise email to generate a temporary recovery link.
          </p>

          {submitted ? (
            <div className="p-4 rounded bg-status-ok/10 border border-status-ok/20 text-center">
              <p className="text-sm text-status-ok font-mono font-medium mb-1">
                RECOVERY SIGNAL SENT
              </p>
              <p className="text-xs text-text-secondary mb-4">
                We've emitted a secure recovery token to <strong className="text-text-primary font-mono">{email}</strong>. Please check your inbox or security vault.
              </p>
              <a
                href="#reset-password"
                className="inline-block px-4 py-2 text-xs font-mono text-white bg-primary hover:bg-primary-hover rounded transition-colors"
              >
                Go to Reset Form
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-2.5 rounded bg-status-critical/10 border border-status-critical/20 text-xs text-status-critical font-mono">
                  FAULT: {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-mono text-text-secondary uppercase tracking-wider mb-1">
                  Enterprise Email
                </label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engineer@indusmind.io"
                  className="w-full px-3 py-2 bg-background-custom text-text-primary text-sm border border-border-custom focus:outline-none focus:border-primary rounded font-sans disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{loading ? 'Transmitting Signal...' : 'Transmit Security Token'}</span>
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
