import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { api } from '../../../lib/api/client';
import { Select } from '../../shared';

export function RetentionModule() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Progress states for running jobs
  const [jobProgress, setJobProgress] = useState<Record<string, { progress: number; status: string; rowsCleaned?: number }>>({});

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const res = await api.get<any[]>('/admin/retention');
      setPolicies(res || []);
    } catch (err) {
      console.error('Failed to load retention policies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleUpdateDays = async (id: string, days: number) => {
    setUpdatingId(id);
    try {
      await api.put(`/admin/retention/${id}`, { retention_days: days });
      setPolicies(prev => prev.map(p => p.id === id ? { ...p, retention_days: days } : p));
    } catch (err) {
      console.error('Failed to update retention policy days:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRunJob = async (id: string) => {
    // Initial trigger
    setJobProgress(prev => ({
      ...prev,
      [id]: { progress: 5, status: 'Triggering...' }
    }));

    try {
      const res = await api.post<any>(`/admin/retention/${id}/run`, {});
      
      // Animate progress bar simulation
      let currentProgress = 5;
      const interval = setInterval(() => {
        currentProgress += 15;
        if (currentProgress >= 100) {
          clearInterval(interval);
          setJobProgress(prev => ({
            ...prev,
            [id]: { 
              progress: 100, 
              status: 'Completed', 
              rowsCleaned: res.affected_rows 
            }
          }));
          
          // Refresh list to update Last Run date and Row Count
          loadPolicies();
        } else {
          setJobProgress(prev => ({
            ...prev,
            [id]: { progress: currentProgress, status: 'Scrubbing...' }
          }));
        }
      }, 300);

    } catch (err) {
      console.error('Failed to execute retention policy run:', err);
      setJobProgress(prev => ({
        ...prev,
        [id]: { progress: 100, status: 'Error' }
      }));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs">
      <div className="border-b border-border-custom pb-4">
        <h2 className="font-display text-lg font-bold text-text-primary tracking-tight flex items-center space-x-2">
          <Icons.ShieldAlert className="w-5 h-5 text-primary" />
          <span>System Data Retention & Deletion Policies</span>
        </h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Configure maximum storage lifespans for security audits, parsing threads, and webhook streams to remain in compliance with strict privacy protocols.
        </p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-text-muted font-mono animate-pulse flex flex-col items-center justify-center space-y-3">
          <Icons.Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span>Fetching retention configuration models...</span>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-surface border border-border-custom rounded-xl overflow-hidden shadow">
            <div className="p-3 bg-surface-muted/30 border-b border-border-custom font-mono text-[10px] text-text-muted uppercase tracking-wider">
              Configured Storage Scrub Nodes
            </div>

            <div className="divide-y divide-border-custom/50">
              {policies.map((policy) => {
                const jobState = jobProgress[policy.id];
                const isRunning = jobState && jobState.status === 'Scrubbing...';
                
                return (
                  <div key={policy.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-background-custom/10 transition-colors">
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex items-center space-x-2">
                        <span className="font-sans font-bold text-text-primary text-sm">{policy.name}</span>
                        <span className="bg-surface-muted border border-border-custom text-text-secondary text-[10px] px-2 py-0.5 rounded font-mono font-semibold">
                          SKU: {policy.id.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-text-secondary leading-relaxed text-xs">{policy.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-[10px] text-text-muted font-mono pt-1">
                        <div className="flex items-center space-x-1">
                          <Icons.Database className="w-3.5 h-3.5" />
                          <span>STALE RECORD COUNT: <strong className="text-text-primary">{policy.affected_rows} rows</strong></span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Icons.Calendar className="w-3.5 h-3.5" />
                          <span>LAST SCRUB DATE: <strong className="text-text-primary">{policy.last_run || 'Never run'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-shrink-0 min-w-[280px]">
                      {/* Configuration Period */}
                      <div className="space-y-1 w-32">
                        <label className="font-mono text-[9px] font-bold text-text-muted uppercase">Retention Lifespan</label>
                        <Select
                          disabled={updatingId === policy.id}
                          value={String(policy.retention_days)}
                          onValueChange={(v) => handleUpdateDays(policy.id, parseInt(v))}
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold min-h-[38px]"
                          options={[
                            { value: '14', label: '14 Days' },
                            { value: '30', label: '30 Days' },
                            { value: '90', label: '90 Days' },
                            { value: '180', label: '180 Days' },
                            { value: '365', label: '365 Days' },
                          ]}
                        />
                      </div>

                      {/* Run Action */}
                      <div className="space-y-1 flex-1 w-full">
                        <label className="font-mono text-[9px] font-bold text-text-muted uppercase block">Purge Engine</label>
                        {jobState ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="font-bold text-primary">{jobState.status}</span>
                              <span>{jobState.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-background-custom rounded-full overflow-hidden border border-border-custom/50">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                  jobState.status === 'Completed' ? 'bg-status-ok' : jobState.status === 'Error' ? 'bg-status-critical' : 'bg-primary'
                                }`}
                                style={{ width: `${jobState.progress}%` }}
                              />
                            </div>
                            {jobState.rowsCleaned !== undefined && (
                              <span className="block text-[9px] text-status-ok font-mono font-bold">
                                Successfully scrubbed {jobState.rowsCleaned} records!
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRunJob(policy.id)}
                            className="w-full inline-flex items-center justify-center space-x-1.5 px-3 py-2 bg-status-critical/10 hover:bg-status-critical/20 border border-status-critical/30 text-status-critical text-[11px] font-bold rounded cursor-pointer transition-colors min-h-[38px]"
                          >
                            <Icons.Trash2 className="w-3.5 h-3.5" />
                            <span>Purge Logs Manually</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[#0B1013] border border-border-custom/80 rounded-xl p-5 space-y-2 font-mono text-[11px] text-text-muted leading-relaxed">
            <span className="font-bold text-white uppercase block border-b border-border-custom pb-2 mb-2 text-xs">
              🔒 Privacy Protocol & Compliance Audits
            </span>
            <p>1. General ledger entries are subject to immediate truncation upon manual execution of the scrubbing engine.</p>
            <p>2. Physical storage recovery may require up to 48 hours for global database indexes to completely release memory allocations.</p>
            <p>3. Automatic background purging runs daily at 00:00 UTC under cron job <code className="text-white font-bold bg-surface p-0.5 rounded px-1">cron-retention-v1</code>.</p>
          </div>
        </div>
      )}
    </div>
  );
}
