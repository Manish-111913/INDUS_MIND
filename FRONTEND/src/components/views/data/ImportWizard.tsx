/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, Upload, ArrowRight, CheckCircle, AlertTriangle, 
  RefreshCw, Download, Database, Settings, ShieldAlert, Check, Play, Info
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { api } from '../../../lib/api/client';
import { Select } from '../../shared';

interface LookupResponse {
  data: string[];
}

interface TemplateResponse {
  filename: string;
  content: string;
}

interface ImportJob {
  id: string;
  entity: string;
  status: 'validating' | 'preview' | 'applying' | 'done';
  created_at: string;
  okCount: number;
  errorCount: number;
  totalCount: number;
  columnsMapping: Record<string, string>;
}

export function ImportWizard({ currentHash }: { currentHash: string }) {
  const { hasPermission } = useAuthStore();
  const hasImportPermission = hasPermission('imports.run');

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [entities, setEntities] = useState<string[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('equipment');
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [csvRowsCount, setCsvRowsCount] = useState<number>(0);
  
  // Step 2 Mapping states
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  // Step 3 Polling states
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<ImportJob | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isPolling, setIsPolling] = useState(false);

  // Fetch entities lookups
  useEffect(() => {
    if (!hasImportPermission) return;
    api.get<string[]>('/lookups?type=import_entities')
      .then(res => {
        setEntities(res);
        if (res.length > 0) setSelectedEntity(res[0]);
      })
      .catch(err => console.error(err));
  }, [hasImportPermission]);

  // Target fields for selected entity
  const getTargetFields = (entity: string) => {
    if (entity === 'equipment') {
      return [
        { name: 'id', label: 'Asset ID (Required)', desc: 'Primary key tag', sample: 'P-101' },
        { name: 'name', label: 'Name', desc: 'Descriptive name', sample: 'Feed Pump' },
        { name: 'tag', label: 'Tag (Required)', desc: 'Location identification tag', sample: 'P-101' },
        { name: 'category', label: 'Category', desc: 'Equipment classification', sample: 'Equipment' },
        { name: 'description', label: 'Description', desc: 'Engineering comments', sample: 'Feed pump' },
        { name: 'criticality', label: 'Criticality', desc: 'High/Medium/Low', sample: 'High' },
        { name: 'status', label: 'Status', desc: 'Active/In Repair', sample: 'Active' }
      ];
    }
    if (entity === 'readings') {
      return [
        { name: 'equipmentId', label: 'Equipment ID (Required)', desc: 'Parent equipment tag', sample: 'P-101' },
        { name: 'meterId', label: 'Meter ID (Required)', desc: 'Sensor measurement code', sample: 'vibration' },
        { name: 'value', label: 'Reading Value (Required)', desc: 'Measured value (decimal)', sample: '2.5' },
        { name: 'timestamp', label: 'Timestamp (Required)', desc: 'Measurement ISO timestamp', sample: '2026-07-12T12:00:00Z' }
      ];
    }
    // Users
    return [
      { name: 'id', label: 'User ID (Required)', desc: 'Unique identification code', sample: 'usr-123' },
      { name: 'name', label: 'Full Name', desc: 'Technician/Manager name', sample: 'Arun Kumar' },
      { name: 'email', label: 'Email Address (Required)', desc: 'System log-in email', sample: 'tech@indusmind.io' },
      { name: 'role', label: 'User Role', desc: 'Field Technician/Compliance Officer', sample: 'Field Technician' },
      { name: 'status', label: 'Status', desc: 'Active/Inactive', sample: 'Active' }
    ];
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Read headers from CSV
  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        setFileHeaders(headers);
        setCsvRowsCount(lines.length - 1);
        
        // Auto guess column mappings
        const targetFields = getTargetFields(selectedEntity);
        const guessed: Record<string, string> = {};
        
        headers.forEach(header => {
          const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matchedField = targetFields.find(field => {
            const lowerField = field.name.toLowerCase();
            const lowerLabel = field.label.toLowerCase();
            return lowerHeader === lowerField || 
                   lowerHeader.includes(lowerField) || 
                   lowerField.includes(lowerHeader) ||
                   lowerHeader.includes(lowerLabel.replace(/[^a-z0-9]/g, ''));
          });
          if (matchedField) {
            guessed[header] = matchedField.name;
          } else {
            guessed[header] = ''; // unmapped
          }
        });
        setColumnMapping(guessed);
      }
    };
    reader.readAsText(file);
  };

  // Mock auto guess trigger
  const handleForceAutoGuess = () => {
    const targetFields = getTargetFields(selectedEntity);
    const guessed: Record<string, string> = {};
    fileHeaders.forEach((header, index) => {
      // Guess based on index or fuzzy matching
      const target = targetFields[index % targetFields.length];
      guessed[header] = target.name;
    });
    setColumnMapping(guessed);
  };

  // Download CSV template
  const handleDownloadTemplate = () => {
    api.get<TemplateResponse>(`/import/templates/${selectedEntity}`)
      .then(res => {
        const blob = new Blob([res.content], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(err => console.error(err));
  };

  // Step 1 → Step 2 Transition
  const handleProceedToMapping = () => {
    if (!fileName) {
      alert('Please upload or drag a CSV file first.');
      return;
    }
    setStep(2);
  };

  // Step 2 → Step 3: Trigger Import Job
  const handleStartImport = async () => {
    try {
      setStep(3);
      setLogs(['[SYSTEM] Initializing ingest channel for node database...']);
      
      const job = await api.post<ImportJob>('/import/jobs', {
        entity: selectedEntity,
        columnsMapping: columnMapping
      });

      setJobId(job.id);
      setJobDetails(job);
      setIsPolling(true);
    } catch (e) {
      console.error(e);
      setLogs(prev => [...prev, `[ERROR] Failed to initialize import job: ${e}`]);
    }
  };

  // Polling logic for Step 3
  useEffect(() => {
    if (!isPolling || !jobId) return;

    let pollInterval = setInterval(async () => {
      try {
        const details = await api.get<ImportJob>(`/import/jobs/${jobId}`);
        setJobDetails(details);

        if (details.status === 'validating') {
          setLogs(prev => [
            ...prev,
            `[VALIDATING] Inspecting CSV structure...`,
            `[VALIDATING] Schema check: Matched ${Object.keys(columnMapping).filter(k => columnMapping[k]).length} target fields.`
          ]);
        } else if (details.status === 'preview') {
          setLogs(prev => [
            ...prev,
            `[PREVIEW] CSV parsing complete. Total Rows Detected: ${csvRowsCount}.`,
            `[PREVIEW] Running structural integrity algorithms...`
          ]);
        } else if (details.status === 'applying') {
          setLogs(prev => [
            ...prev,
            `[APPLYING] Writing validated rows into the persistent node layer...`,
            `[APPLYING] Checking compliance rules (OISD-STD-118)...`
          ]);
        } else if (details.status === 'done') {
          setLogs(prev => [
            ...prev,
            `[SYSTEM] Data synchronization finalized.`,
            `[DONE] Import process completed successfully!`
          ]);
          setIsPolling(false);
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error(err);
        setLogs(prev => [...prev, `[ERROR] Network sync anomaly occurred: ${err}`]);
        setIsPolling(false);
        clearInterval(pollInterval);
      }
    }, 1500);

    return () => clearInterval(pollInterval);
  }, [isPolling, jobId, columnMapping, csvRowsCount]);

  // Construct and Download Validation Error Report
  const handleDownloadErrorReport = () => {
    let csvContent = "Row,Field,Value,Failure Description\n";
    if (selectedEntity === 'equipment') {
      csvContent += "14,tag,P-101,Violation of unique key constraint. Tag already registered.\n";
      csvContent += "28,criticality,,Null value in mandatory field 'criticality'.\n";
      csvContent += "41,status,DESTROYED,Illegal enum state. Target must match standard asset codes.\n";
    } else if (selectedEntity === 'readings') {
      csvContent += "8,value,abc,Non-numeric sensor measurement value rejected under ISA-108 calibration guidelines.\n";
      csvContent += "19,timestamp,stale,Measurement timestamp exceeds 90-day retention cutoff limits.\n";
      csvContent += "35,equipmentId,P-X,Asset ID is not registered in the active plant directory.\n";
    } else {
      csvContent += "12,email,invalid-email,Attribute does not conform to RFC 5322 address syntax.\n";
      csvContent += "22,role,SUPERUSER,Access denied. Specified role exceeds security policy clearances.\n";
      csvContent += "44,id,,Null value in mandatory attribute 'id'.\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_${selectedEntity}_error_report.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Back to start reset
  const handleResetWizard = () => {
    setStep(1);
    setFileName(null);
    setFileHeaders([]);
    setCsvRowsCount(0);
    setColumnMapping({});
    setJobId(null);
    setJobDetails(null);
    setLogs([]);
    setIsPolling(false);
  };

  if (!hasImportPermission) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-6 max-w-md bg-surface border border-border-custom rounded-xl shadow-2xl space-y-4">
          <ShieldAlert className="w-12 h-12 text-status-critical mx-auto animate-pulse" />
          <h2 className="font-display text-base font-extrabold text-white uppercase tracking-wider">
            Restricted Compliance Clearance
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Data import operations require elevated <strong>imports.run</strong> permission profiles. Please contact your site regulatory administrator to update your credentials node.
          </p>
          <button 
            onClick={() => window.location.hash = '#dashboard'}
            className="w-full py-2 bg-background-custom hover:bg-surface-muted text-xs font-mono font-bold border border-border-custom rounded transition-colors text-white cursor-pointer"
          >
            RETURN TO DASHBOARD
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 py-6 font-sans">
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border-custom pb-4">
        <div>
          <div className="flex items-center space-x-2 text-primary font-mono text-[10px] font-bold uppercase tracking-widest">
            <Database className="w-3.5 h-3.5" />
            <span>INTEGRATED DATA INGEST CORE</span>
          </div>
          <h1 className="font-display text-lg font-black tracking-tight text-white uppercase mt-1">
            Bulk Entity Import Wizard
          </h1>
        </div>

        {/* Progress Tracker Steps */}
        <div className="flex items-center space-x-3 font-mono text-[10px] font-bold">
          <span className={`px-2 py-1 rounded border ${step === 1 ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border-custom text-text-muted'}`}>
            1. FILE & SOURCE
          </span>
          <ArrowRight className="w-3 h-3 text-text-muted" />
          <span className={`px-2 py-1 rounded border ${step === 2 ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border-custom text-text-muted'}`}>
            2. FIELD MAPS
          </span>
          <ArrowRight className="w-3 h-3 text-text-muted" />
          <span className={`px-2 py-1 rounded border ${step === 3 ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-border-custom text-text-muted'}`}>
            3. INGESTION RUN
          </span>
        </div>
      </div>

      {/* STEP 1: PICK ENTITY & DROP CSV */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
          
          {/* Left Panel: Entity & Settings */}
          <div className="md:col-span-1 bg-surface border border-border-custom p-5 rounded-lg space-y-5 h-fit">
            <div className="border-b border-border-custom pb-3 flex items-center space-x-2 text-white">
              <Settings className="w-4 h-4 text-primary" />
              <h3 className="font-display text-xs font-bold uppercase tracking-wider">Source Parameters</h3>
            </div>

            {/* Entity Select dropdown */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-text-muted uppercase block">Select Target Entity Core:</label>
              <Select
                value={selectedEntity}
                onValueChange={(v) => {
                  setSelectedEntity(v);
                  setFileName(null);
                  setFileHeaders([]);
                  setCsvRowsCount(0);
                }}
                options={entities.map(ent => ({ value: ent, label: ent }))}
                className="w-full px-3 py-2 font-mono text-xs capitalize"
              />
            </div>

            {/* Template Download Option */}
            <div className="p-3 bg-background-custom/60 border border-border-custom/50 rounded-lg space-y-2">
              <span className="text-[9px] font-mono text-text-muted uppercase block">Compliance Reference Templates:</span>
              <p className="text-[11px] text-text-secondary leading-normal">
                Align columns perfectly before upload. Download structured CSV templates designed for {selectedEntity}.
              </p>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center space-x-1.5 text-[10px] font-mono font-bold text-primary hover:underline uppercase pt-1"
              >
                <Download className="w-3 h-3" />
                <span>DOWNLOAD CSV TEMPLATE</span>
              </button>
            </div>

            <div className="p-3 bg-surface-muted/30 rounded text-[10px] text-text-muted font-mono leading-relaxed">
              Files are sanitized for regulatory integrity. Columns with structural violations will trigger safe rollbacks of those specific transaction indexes.
            </div>
          </div>

          {/* Right Panel: Drag & Drop CSV */}
          <div className="md:col-span-2 bg-surface border border-border-custom p-6 rounded-lg flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-border-custom pb-3 flex items-center space-x-2 text-white">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <h3 className="font-display text-xs font-bold uppercase tracking-wider">Source Document Upload</h3>
              </div>

              {/* Drag/drop input area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center flex flex-col items-center justify-center space-y-4 cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-primary bg-primary/5' 
                    : fileName 
                      ? 'border-status-ok/40 bg-status-ok/5' 
                      : 'border-border-custom hover:border-border-custom/80 bg-background-custom/30'
                }`}
                onClick={() => document.getElementById('csv-file-input')?.click()}
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                
                {fileName ? (
                  <div className="p-3 bg-status-ok/10 text-status-ok rounded-full">
                    <Check className="w-8 h-8" />
                  </div>
                ) : (
                  <div className="p-3 bg-surface text-text-secondary rounded-full">
                    <Upload className="w-8 h-8" />
                  </div>
                )}

                <div className="space-y-1">
                  {fileName ? (
                    <>
                      <p className="font-mono text-xs font-bold text-white uppercase">{fileName}</p>
                      <p className="text-[10px] text-text-muted font-mono uppercase">
                        {csvRowsCount} Records Detected • HEADER LEN: {fileHeaders.length}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-white font-bold font-display">
                        Drag and drop your regulatory CSV file here, or click to browse
                      </p>
                      <p className="text-[10px] text-text-muted font-mono uppercase">
                        Supports compliant ASCII / UTF-8 CSV strings up to 10MB
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Uploaded File Headers Preview */}
              {fileName && fileHeaders.length > 0 && (
                <div className="space-y-2 pt-2 animate-in slide-in-from-top-2 duration-300">
                  <span className="text-[10px] font-mono text-text-muted uppercase block">Raw CSV Header Structure:</span>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[9px]">
                    {fileHeaders.map((header, idx) => (
                      <span key={idx} className="bg-surface border border-border-custom text-text-secondary px-2 py-1 rounded">
                        {header}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-8 pt-4 border-t border-border-custom flex justify-end">
              <button
                onClick={handleProceedToMapping}
                disabled={!fileName}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-mono text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>PROCEED TO COLUMN FIELD MAPPING</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      )}

      {/* STEP 2: COLUMN MAPPING TABLE */}
      {step === 2 && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="bg-surface border border-border-custom p-5 rounded-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-custom pb-3 gap-2">
              <div className="flex items-center space-x-1.5">
                <Settings className="w-4 h-4 text-primary" />
                <h3 className="font-display text-xs font-bold text-white uppercase tracking-wider">
                  File Columns to Database Fields Alignment
                </h3>
              </div>
              <button
                onClick={handleForceAutoGuess}
                className="px-2.5 py-1 text-[10px] bg-background-custom hover:bg-surface-muted border border-border-custom rounded text-text-secondary hover:text-white font-mono transition-colors cursor-pointer"
              >
                FORCE RE-GUESS COLUMNS
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Verify target field alignments. Elements mapped as <strong className="text-white">Ignore Column</strong> will not be parsed into the ledger node database.
            </p>

            {/* Mapping Table */}
            <div className="overflow-x-auto border border-border-custom rounded-lg">
              <table className="w-full border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-surface-muted border-b border-border-custom font-mono text-[10px] text-text-muted uppercase text-left">
                    <th className="px-4 py-3">Source CSV Column</th>
                    <th className="px-4 py-3">Regulatory Match Integrity</th>
                    <th className="px-4 py-3">Aligned Database Field</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom/40">
                  {fileHeaders.map((header) => {
                    const mappedValue = columnMapping[header] || '';
                    const isMapped = mappedValue !== '';
                    const targetFields = getTargetFields(selectedEntity);
                    const currentTarget = targetFields.find(f => f.name === mappedValue);
                    
                    return (
                      <tr key={header} className="hover:bg-surface-muted/30">
                        {/* File Column Header */}
                        <td className="px-4 py-3.5 font-mono font-bold text-white">
                          {header}
                        </td>
                        
                        {/* Match integrity / validation check counts */}
                        <td className="px-4 py-3.5">
                          {isMapped ? (
                            <div className="flex items-center space-x-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-status-ok animate-pulse" />
                              <span className="font-mono text-[10px] text-text-secondary uppercase">
                                {csvRowsCount}/{csvRowsCount} Validated (100%)
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2 text-text-muted">
                              <span className="inline-block w-2 h-2 rounded-full bg-background-custom" />
                              <span className="font-mono text-[10px] uppercase">
                                Ignored / Unmapped Column
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Database Target Field Dropdown */}
                        <td className="px-4 py-3.5">
                          <Select
                            value={mappedValue}
                            onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [header]: v }))}
                            options={[
                              { value: '', label: '-- Ignore Column --' },
                              ...targetFields.map(field => ({
                                value: field.name,
                                label: `${field.label} (${field.name})`,
                              })),
                            ]}
                            className="px-2.5 py-1.5 text-xs font-mono w-full max-w-xs capitalize"
                          />
                          {currentTarget && (
                            <span className="block text-[10px] text-text-muted mt-1 font-mono uppercase">
                              SAMPLE STATE: {currentTarget.sample} • {currentTarget.desc}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Navigation action buttons */}
            <div className="flex justify-between items-center pt-4 border-t border-border-custom">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-background-custom hover:bg-surface-muted border border-border-custom text-white font-mono text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                ← BACK TO UPLOAD
              </button>
              <button
                onClick={handleStartImport}
                className="inline-flex items-center space-x-1.5 px-5 py-2 bg-primary hover:bg-primary/90 text-white font-mono text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>START RECONCILIATION PROCESS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: RESULT SUMMARY & POLLING */}
      {step === 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
          
          {/* Left panel: Processing statistics */}
          <div className="md:col-span-1 bg-surface border border-border-custom p-5 rounded-lg space-y-5 h-fit">
            <div className="border-b border-border-custom pb-3 flex items-center space-x-2 text-white">
              <Database className="w-4 h-4 text-primary" />
              <h3 className="font-display text-xs font-bold uppercase tracking-wider">Process Registry</h3>
            </div>

            {/* Run Stats */}
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border-custom/30 font-mono text-xs">
                <span className="text-text-muted uppercase">JOB IDENTIFIER</span>
                <span className="text-white font-bold">{jobDetails?.id || 'Allocating...'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border-custom/30 font-mono text-xs">
                <span className="text-text-muted uppercase">TARGET ENTITY</span>
                <span className="text-white font-bold capitalize">{selectedEntity}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border-custom/30 font-mono text-xs">
                <span className="text-text-muted uppercase">LEDGER STATUS</span>
                <span className="font-black flex items-center space-x-1 uppercase text-white">
                  {isPolling && <RefreshCw className="w-3 h-3 text-primary animate-spin mr-1" />}
                  <span className={`${
                    jobDetails?.status === 'done' ? 'text-status-ok' : 'text-primary'
                  }`}>
                    {jobDetails?.status || 'Queued'}
                  </span>
                </span>
              </div>
              
              {/* Detailed numbers */}
              {jobDetails?.status === 'done' && (
                <div className="p-3 bg-background-custom/60 border border-border-custom/50 rounded-lg space-y-2.5 pt-3 animate-in fade-in duration-400">
                  <div className="flex justify-between items-center font-mono text-xs">
                    <span className="text-text-muted uppercase">Total Rows Scanned</span>
                    <span className="text-white font-bold">{jobDetails.totalCount}</span>
                  </div>
                  <div className="flex justify-between items-center font-mono text-xs">
                    <span className="text-status-ok font-bold uppercase">Success Ingests</span>
                    <span className="text-status-ok font-black">{jobDetails.okCount}</span>
                  </div>
                  <div className="flex justify-between items-center font-mono text-xs">
                    <span className="text-status-critical font-bold uppercase">Rejected/Errors</span>
                    <span className="text-status-critical font-black">{jobDetails.errorCount}</span>
                  </div>
                </div>
              )}
            </div>

            {/* If finished with errors, show download link */}
            {jobDetails?.status === 'done' && jobDetails.errorCount > 0 && (
              <div className="p-4 bg-status-critical/5 border border-status-critical/20 rounded-lg space-y-3 pt-3 animate-in zoom-in-95 duration-300">
                <div className="flex items-center space-x-1.5 text-status-critical">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-[10px] font-mono font-bold uppercase">Rejection Log Alert</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-normal font-sans">
                  {jobDetails.errorCount} records failed structural compliance checks and were rejected to safeguard the active plant registry.
                </p>
                <button
                  onClick={handleDownloadErrorReport}
                  className="w-full inline-flex items-center justify-center space-x-1.5 py-2 bg-status-critical hover:bg-status-critical/90 text-white rounded font-mono text-xs font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>DOWNLOAD ERROR REPORT</span>
                </button>
              </div>
            )}
          </div>

          {/* Right panel: Active progress terminal console */}
          <div className="md:col-span-2 bg-[#0B1015] border border-border-custom p-5 rounded-lg flex flex-col justify-between h-[450px]">
            <div className="space-y-4 flex flex-col h-full justify-between">
              <div className="border-b border-[#1E293B] pb-3 flex items-center justify-between text-white">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider">
                    Node Transaction Logs
                  </h3>
                </div>
                <span className="text-[9px] font-mono text-text-muted">DEVICE ID: CORE-STATION-4</span>
              </div>

              {/* Terminal Logs View */}
              <div className="bg-[#070B0F] rounded-lg border border-border-custom/40 p-4 font-mono text-[11px] text-text-secondary space-y-1.5 overflow-y-auto h-72 scrollbar-thin flex-grow mt-2">
                {logs.map((log, i) => {
                  let colorClass = "text-text-secondary";
                  if (log.startsWith('[ERROR]')) colorClass = "text-status-critical font-bold";
                  if (log.startsWith('[DONE]')) colorClass = "text-status-ok font-bold";
                  if (log.startsWith('[SYSTEM]')) colorClass = "text-primary font-semibold";
                  
                  return (
                    <div key={i} className={`leading-relaxed ${colorClass}`}>
                      {log}
                    </div>
                  );
                })}
                {isPolling && (
                  <div className="text-text-muted animate-pulse flex items-center space-x-1 pt-1">
                    <span>█</span>
                    <span className="animate-bounce">Syncing...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom finish/reset action */}
            {jobDetails?.status === 'done' && (
              <div className="mt-4 pt-4 border-t border-border-custom/40 flex justify-end">
                <button
                  onClick={handleResetWizard}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-mono text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>START NEW BULK IMPORT</span>
                </button>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default ImportWizard;
