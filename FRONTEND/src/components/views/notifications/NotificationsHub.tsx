/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { formatDate } from '../../../lib/format';
import { 
  Bell, Check, Trash2, Mail, MessageSquare, ShieldAlert,
  Sliders, Filter, Settings, ShieldCheck, Eye, Calendar, Sparkles, Download
} from 'lucide-react';
import { useNotificationStore, AppNotification } from '../../../stores/notificationStore';
import { StatusChip } from '../../shared';

export function NotificationsHub() {
  const { 
    notifications, 
    preferences, 
    markAsRead, 
    markAllAsRead, 
    clearNotification, 
    clearAll,
    updatePreference,
    simulateIncomingEvent
  } = useNotificationStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'Safety Alerts' | 'Work Orders' | 'Compliance' | 'Quality Defects'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate relative time strings
  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatDate(timestamp);
  };

  const handleTogglePreference = (category: string, channel: 'inAppToast' | 'email' | 'sms' | 'pushApi') => {
    const currentValue = preferences[category]?.[channel] ?? false;
    updatePreference(category, channel, !currentValue);
  };

  // Filter list
  const filteredNotifs = notifications.filter(n => {
    // Tab filtering
    if (activeFilter === 'unread' && n.isRead) return false;
    if (activeFilter !== 'all' && activeFilter !== 'unread' && n.category !== activeFilter) return false;

    // Search query filtering
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (n.title || '').toLowerCase().includes(q) || (n.desc || '').toLowerCase().includes(q);
    }
    return true;
  });

  const categoriesList = ['Safety Alerts', 'Work Orders', 'Compliance', 'Quality Defects'];
  const channelsList = [
    { key: 'inAppToast' as const, label: 'In-App Toast', icon: Bell },
    { key: 'email' as const, label: 'Email system', icon: Mail },
    { key: 'sms' as const, label: 'SMS Gateway', icon: MessageSquare },
    { key: 'pushApi' as const, label: 'Push API', icon: Sliders }
  ];

  return (
    <div className="space-y-6" id="notifications-hub-workspace">
      
      {/* Page Header */}
      <div className="border-b border-border-custom pb-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Bell className="w-6.5 h-6.5 text-primary" />
            <span>Operational Notification Command</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Configure telemetry alert channels, clear field logs, and simulate real-time event notifications.
          </p>
        </div>

        {/* Developer Action buttons */}
        <div className="flex space-x-2 self-start xl:self-center">
          <button
            onClick={simulateIncomingEvent}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded text-xs font-mono font-bold flex items-center space-x-1.5 cursor-pointer transition-colors shadow-lg shadow-primary/10"
          >
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span>SIMULATE REAL-TIME ALERT</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column (2/3 width on large): Alerts Register */}
        <div className="lg:col-span-2 space-y-4">
          
          <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
            
            {/* Registers Filter controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border-custom/40">
              <div className="flex flex-wrap gap-1 bg-background-custom/40 p-1 rounded border border-border-custom text-xs">
                {(['all', 'unread', 'Safety Alerts', 'Work Orders', 'Compliance', 'Quality Defects'] as const).map((filter) => {
                  const label = filter === 'all' ? 'All Alerts' : filter === 'unread' ? 'Unread Only' : filter;
                  const isActive = activeFilter === filter;
                  return (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`px-3 py-1 rounded-md text-[10px] font-mono cursor-pointer transition-colors ${
                        isActive ? 'bg-primary text-white font-bold' : 'text-text-secondary hover:text-white'
                      }`}
                    >
                      {label.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              <div className="flex space-x-2 self-start md:self-auto">
                <button
                  onClick={markAllAsRead}
                  className="px-3 py-1.5 border border-border-custom text-xs text-text-secondary hover:text-white hover:bg-surface-muted rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-status-ok" />
                  <span>MARK ALL READ</span>
                </button>
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 border border-border-custom text-xs text-status-critical hover:bg-status-critical/10 rounded font-mono font-semibold flex items-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>CLEAR ALL</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search alert title or body details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded p-2.5 pl-9 text-xs text-text-primary focus:outline-none focus:border-primary placeholder-text-muted font-sans"
              />
              <Filter className="w-4 h-4 text-text-muted absolute left-3 top-3.5" />
            </div>

            {/* Notifications Feed */}
            {filteredNotifs.length === 0 ? (
              <div className="py-12 text-center text-text-secondary border border-dashed border-border-custom rounded-xl bg-background-custom/20">
                <Bell className="w-10 h-10 text-text-muted mx-auto mb-2 animate-pulse" />
                <p className="font-semibold text-white">Active Queue Cleared</p>
                <p className="text-[11px] text-text-secondary mt-1">
                  All logged alerts have been resolved, dismissed, or filtered.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border-custom/50 max-h-[500px] overflow-y-auto pr-2">
                {filteredNotifs.map((n) => (
                  <div 
                    key={n.id} 
                    className={`py-4 flex items-start space-x-3.5 transition-colors ${
                      !n.isRead ? 'bg-primary/5 -mx-4 px-4' : ''
                    }`}
                  >
                    {/* Visual marker dot */}
                    <div className="pt-1.5 flex-shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        n.type === 'critical' ? 'bg-status-critical animate-ping' :
                        n.type === 'warn' ? 'bg-status-warn' : 'bg-status-info'
                      }`} />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                          n.type === 'critical' ? 'bg-status-critical/10 text-status-critical border-status-critical/20' :
                          n.type === 'warn' ? 'bg-status-warn/10 text-status-warn border-status-warn/20' :
                          'bg-status-info/10 text-status-info border-status-info/20'
                        }`}>
                          {n.title}
                        </span>
                        <span className="text-[10px] font-mono text-text-muted flex-shrink-0">{formatRelativeTime(n.timestamp)}</span>
                      </div>
                      
                      <p className="text-xs text-text-primary font-sans leading-relaxed">
                        {n.desc}
                      </p>
                      
                      {n.desc.includes('http') && (
                        <div className="pt-1.5 pb-0.5">
                          <a 
                            href={n.desc.split(' ').find(w => w.startsWith('http')) || '#'}
                            download
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 rounded font-mono text-[9px] font-bold transition-colors cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>DOWNLOAD BULK DATA FILE</span>
                          </a>
                        </div>
                      )}

                      <div className="flex items-center space-x-2 pt-1">
                        <span className="text-[9px] font-mono font-bold text-text-muted bg-surface-muted/60 border border-border-custom px-1.5 rounded uppercase">
                          {n.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0">
                      {!n.isRead && (
                        <button
                          onClick={() => markAsRead(n.id)}
                          className="p-1 rounded hover:bg-primary/10 text-primary cursor-pointer"
                          title="Mark as read"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => clearNotification(n.id)}
                        className="p-1 rounded hover:bg-status-critical/10 text-text-muted hover:text-status-critical cursor-pointer"
                        title="Dismiss"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}

          </div>

        </div>

        {/* Right column (1/3 width on large): Preferences Channel Matrix */}
        <div className="space-y-4">
          
          <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center space-x-2 pb-2.5 border-b border-border-custom">
              <Settings className="w-4 h-4 text-primary" />
              <span>Channel Dispatch Preferences</span>
            </h3>

            <p className="text-[11px] text-text-secondary leading-relaxed font-sans">
              Control alert gateways by category × dispatch media. Checked intersections route signals immediately to live pipelines.
            </p>

            <div className="space-y-4 pt-2">
              {categoriesList.map((category) => (
                <div key={category} className="space-y-2 p-3 bg-background-custom/40 border border-border-custom rounded-lg">
                  <span className="block font-semibold text-xs text-white font-mono uppercase tracking-wide">
                    {category}
                  </span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {channelsList.map((channel) => {
                      const isEnabled = preferences[category]?.[channel.key] ?? false;
                      const Icon = channel.icon;
                      return (
                        <button
                          key={channel.key}
                          onClick={() => handleTogglePreference(category, channel.key)}
                          className={`flex items-center justify-between p-2 rounded border text-[10px] font-sans font-semibold cursor-pointer transition-all ${
                            isEnabled 
                              ? 'bg-primary/10 border-primary text-white' 
                              : 'bg-surface-muted/30 border-border-custom/50 text-text-muted hover:border-text-secondary'
                          }`}
                        >
                          <div className="flex items-center space-x-1.5">
                            <Icon className={`w-3.5 h-3.5 ${isEnabled ? 'text-primary' : 'text-text-muted'}`} />
                            <span>{channel.label}</span>
                          </div>
                          {isEnabled && <Check className="w-3.5 h-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-surface-muted/50 p-3 rounded border border-border-custom font-mono text-[9px] text-text-muted text-center uppercase tracking-wide">
              Cryptographic Router Status: ONLINE
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
