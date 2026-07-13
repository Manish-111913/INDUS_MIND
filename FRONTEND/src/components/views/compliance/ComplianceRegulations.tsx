/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileText, Plus, ChevronDown, ChevronRight, CheckCircle2, XCircle, 
  Sparkles, AlertTriangle, ArrowLeft, RefreshCw, Layers, UploadCloud, Check
} from 'lucide-react';
import { Regulation, ClauseNode, MappedItem } from './mockComplianceData';
import { StatusChip, ConfidenceBadge, Select } from '../../shared';

interface ComplianceRegulationsProps {
  regulations: Regulation[];
  selectedRegId: string | null;
  onSelectReg: (id: string | null) => void;
  onUpdateRegulations: (updated: Regulation[]) => void;
}

export function ComplianceRegulations({
  regulations,
  selectedRegId,
  onSelectReg,
  onUpdateRegulations
}: ComplianceRegulationsProps) {
  
  // Regulation import states
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [selectedDocToImport, setSelectedDocToImport] = useState('OISD-STD-118-Addendum.pdf');

  // Selected clause state
  const [selectedClause, setSelectedClause] = useState<ClauseNode | null>(null);

  // Expanded clause IDs in tree
  const [expandedClauseIds, setExpandedClauseIds] = useState<Record<string, boolean>>({
    'cl-oisd-6': true,
    'cl-fact-21.1': true
  });

  const toggleClauseExpanded = (id: string) => {
    setExpandedClauseIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const activeReg = regulations.find(r => r.id === selectedRegId);

  // Helper to trigger simulation of Importing a Regulation
  const handleStartImport = () => {
    setIsImporting(true);
    setImportStep(1); // Picking document state
  };

  const handleExecuteImport = () => {
    setImportStep(2); // Parsing progress state
    setImportProgress(10);
    setImportStatusText('Extracting PDF text structures & footnotes...');

    const parseSteps = [
      { prg: 35, text: 'Scanning document hierarchy and clause headers...' },
      { prg: 60, text: 'Isolating 8 distinct safety clauses & definitions...' },
      { prg: 85, text: 'Running LLM semantic mapping on 4 matching SOPs...' },
      { prg: 100, text: 'Import successful! Mapped 2 equipments and 1 procedure.' }
    ];

    let idx = 0;
    const interval = setInterval(() => {
      if (idx < parseSteps.length) {
        setImportProgress(parseSteps[idx].prg);
        setImportStatusText(parseSteps[idx].text);
        idx++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          // Add a mock imported regulation
          const newReg: Regulation = {
            id: `REG-IMP-${Date.now()}`,
            code: 'OISD-STD-118 Addendum',
            title: '2026 Supplement for High-Pressure Hydrocarbon Tank Farms',
            body: 'OISD',
            clausesCount: 8,
            mappedPercent: 88,
            gaps: 0,
            clauses: [
              {
                id: 'cl-imp-1',
                code: 'Section 12.1',
                title: 'Tank Vapor Sniffers',
                text: 'All Class A hydrocarbon storage cells exceeding 50,000 bbls must feature continuous automated vapor sniffing arrays integrated to emergency ESD loops.',
                gapsCount: 0,
                mappedItems: [
                  { id: 'm-imp-1', type: 'Equipment', name: 'Tank Sniffer Array GD-501', confidence: 95, status: 'Confirmed' }
                ]
              }
            ]
          };

          onUpdateRegulations([newReg, ...regulations]);
          setIsImporting(false);
          setImportStep(0);
          onSelectReg(newReg.id);
          setSelectedClause(newReg.clauses[0]);
        }, 1000);
      }
    }, 1200);
  };

  // Helper to confirm or reject an AI-proposed mapping
  const handleUpdateMappingStatus = (mappedItemId: string, newStatus: 'Proposed' | 'Confirmed' | 'Rejected') => {
    if (!activeReg) return;

    // Recursive function to update mapped items in clause tree
    const updateClausesRecursive = (nodes: ClauseNode[]): ClauseNode[] => {
      return nodes.map(node => {
        let updatedNode = { ...node };
        
        if (node.mappedItems) {
          updatedNode.mappedItems = node.mappedItems.map(item => {
            if (item.id === mappedItemId) {
              return { ...item, status: newStatus };
            }
            return item;
          });
        }

        if (node.children) {
          updatedNode.children = updateClausesRecursive(node.children);
        }

        return updatedNode;
      });
    };

    const updatedRegs = regulations.map(reg => {
      if (reg.id === activeReg.id) {
        const updatedClauses = updateClausesRecursive(reg.clauses);
        return {
          ...reg,
          clauses: updatedClauses
        };
      }
      return reg;
    });

    onUpdateRegulations(updatedRegs);

    // Sync selected clause view
    if (selectedClause) {
      const findClauseRecursive = (nodes: ClauseNode[]): ClauseNode | null => {
        for (const node of nodes) {
          if (node.id === selectedClause.id) return node;
          if (node.children) {
            const found = findClauseRecursive(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      const freshReg = updatedRegs.find(r => r.id === activeReg.id);
      if (freshReg) {
        const freshClause = findClauseRecursive(freshReg.clauses);
        if (freshClause) {
          setSelectedClause(freshClause);
        }
      }
    }
  };

  const getBodyBadgeStyle = (body: string) => {
    switch (body) {
      case 'OISD': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
      case 'Factory Act': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'PESO': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'Environmental': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  // Render Clause Tree Node
  const renderClauseNode = (node: ClauseNode, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedClauseIds[node.id];
    const isSelected = selectedClause?.id === node.id;

    return (
      <div key={node.id} className="space-y-1">
        <div 
          onClick={() => {
            setSelectedClause(node);
            if (hasChildren) toggleClauseExpanded(node.id);
          }}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
            isSelected 
              ? 'bg-primary/15 text-text-primary border-l-2 border-primary'
              : 'hover:bg-surface-muted text-text-secondary hover:text-text-primary'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center text-[8px] font-mono">•</span>
            )}
            <span className="font-mono text-[11px] font-bold text-primary flex-shrink-0">{node.code}</span>
            <span className="text-xs truncate font-medium">{node.title}</span>
          </div>

          <div className="flex items-center space-x-2">
            {node.gapsCount > 0 && (
              <span className="bg-red-500 text-white font-bold font-mono text-[9px] px-1.5 py-0.2 rounded">
                {node.gapsCount} GAP
              </span>
            )}
            {node.mappedItems && node.mappedItems.length > 0 && (
              <span className="text-[10px] font-mono text-text-muted">
                {node.mappedItems.length} mapped
              </span>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1 mt-0.5">
            {node.children!.map(child => renderClauseNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* ----------------- HEADERS & ACTIONS ----------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            {selectedRegId && (
              <button 
                onClick={() => {
                  onSelectReg(null);
                  setSelectedClause(null);
                }}
                className="p-1.5 bg-surface hover:bg-surface-muted text-text-secondary hover:text-text-primary rounded border border-border-custom cursor-pointer transition-colors"
                title="Back to Registry"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-display text-lg font-bold text-text-primary uppercase tracking-wider flex items-center space-x-2">
              <FileText className="w-5 h-5 text-primary" />
              <span>{selectedRegId ? 'Regulation Clause Mapping Explorer' : 'Federal Regulations Registry'}</span>
            </h2>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            {selectedRegId 
              ? 'Drill down through regulatory clause trees and audit AI semantic mappings to procedures.' 
              : 'Registry table tracking active compliance standards, mapping depths, and isolated non-compliance gaps.'}
          </p>
        </div>

        {!selectedRegId && (
          <button
            onClick={handleStartImport}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded flex items-center space-x-2 cursor-pointer transition-colors shadow-lg self-start sm:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>Import Regulation Document</span>
          </button>
        )}
      </div>

      {/* ----------------- PORTAL: WIZARD TO IMPORT REGULATION ----------------- */}
      {isImporting && (
        <div className="bg-surface border border-[#0E7C86]/30 bg-gradient-to-br from-[#0B0F12] to-[#13191D] p-6 rounded-xl space-y-6 relative overflow-hidden">
          <div 
            className="absolute inset-0 opacity-[0.02] pointer-events-none" 
            style={{
              backgroundImage: `linear-gradient(#0E7C86 1px, transparent 1px), linear-gradient(90deg, #0E7C86 1px, transparent 1px)`,
              backgroundSize: '20px 20px'
            }}
          />

          <div className="flex justify-between items-center border-b border-border-custom/50 pb-3">
            <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider flex items-center">
              <Sparkles className="w-4 h-4 text-primary mr-1.5 animate-pulse" /> AI Regulatory Document Importer
            </h3>
            <button 
              onClick={() => setIsImporting(false)} 
              className="text-text-muted hover:text-white font-mono text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {importStep === 1 ? (
            <div className="space-y-4 max-w-md mx-auto text-center">
              <div className="p-4 bg-primary/5 border border-dashed border-primary/25 rounded-lg flex flex-col items-center space-y-2">
                <UploadCloud className="w-8 h-8 text-primary" />
                <span className="text-xs font-bold text-white">Select Ingested PDF File from Workspace</span>
                <p className="text-[10px] text-text-secondary">AI will auto-scan structure, clauses, and draft SOP mappings.</p>
              </div>

              <div className="text-left space-y-1.5">
                <label className="block text-[10px] font-mono text-text-muted uppercase">Ingested Files Available</label>
                <Select
                  value={selectedDocToImport}
                  onValueChange={(v) => setSelectedDocToImport(v)}
                  className="w-full px-3 py-2 text-xs"
                  options={[
                    { value: 'OISD-STD-118-Addendum.pdf', label: 'OISD-STD-118-Addendum.pdf (Ingested 2h ago)' },
                    { value: 'Machinery_Guarding_Rules_2026.pdf', label: 'Machinery_Guarding_Rules_2026.pdf (Ingested 1d ago)' },
                    { value: 'Environmental_Particulates_EPA_Draft.pdf', label: 'Environmental_Particulates_EPA_Draft.pdf (Ingested 3d ago)' },
                  ]}
                />
              </div>

              <button
                onClick={handleExecuteImport}
                className="w-full py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded cursor-pointer transition-colors uppercase tracking-wider"
              >
                Launch Parser Engine & Map Schema
              </button>
            </div>
          ) : (
            <div className="max-w-xs mx-auto text-center space-y-3 py-4">
              <p className="text-xs font-mono text-primary animate-pulse">{importStatusText}</p>
              <div className="w-full bg-surface-muted h-2.5 rounded-full overflow-hidden border border-border-custom">
                <div className="bg-primary h-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
              </div>
              <div className="text-[10px] font-mono text-text-muted">PROGRESS: {importProgress}%</div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- NO SELECTED REGULATION: REGISTRY TABLE ----------------- */}
      {!selectedRegId ? (
        <div className="bg-surface border border-border-custom rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border-custom bg-surface-muted/30 font-mono text-[10px] text-text-muted uppercase tracking-wider">
            Enforced Compliance Standards Index
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-muted/50 border-b border-border-custom text-[10px] text-text-muted uppercase font-mono">
                  <th className="p-4">Reg Code</th>
                  <th className="p-4">Regulatory Standard Frame</th>
                  <th className="p-4">Body</th>
                  <th className="p-4 text-center">Clauses Count</th>
                  <th className="p-4 text-center">AI Mapping Coverage</th>
                  <th className="p-4 text-center">Outstanding Gaps</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/50 text-text-secondary">
                {regulations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-background-custom/30 transition-colors">
                    <td className="p-4 font-mono font-bold text-text-primary">{reg.code}</td>
                    <td className="p-4">
                      <div className="font-bold text-text-primary">{reg.title}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">System synchronized baseline structure</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-semibold uppercase ${getBodyBadgeStyle(reg.body)}`}>
                        {reg.body}
                      </span>
                    </td>
                    <td className="p-4 text-center font-mono">{reg.clausesCount}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <div className="w-12 bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border-custom">
                          <div className={`h-full ${reg.mappedPercent > 80 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${reg.mappedPercent}%` }} />
                        </div>
                        <span className="font-mono font-semibold text-text-primary">{reg.mappedPercent}%</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {reg.gaps > 0 ? (
                        <span className="bg-red-500/10 text-red-400 border border-red-500/25 px-2 py-0.5 rounded font-mono font-bold animate-pulse inline-block">
                          {reg.gaps} GAP{reg.gaps > 1 ? 'S' : ''}
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-mono font-bold">NONE</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => {
                          onSelectReg(reg.id);
                          // Default select first clause
                          if (reg.clauses && reg.clauses[0]) {
                            setSelectedClause(reg.clauses[0]);
                          }
                        }}
                        className="px-2.5 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded border border-primary/20 text-[11px] font-mono font-bold cursor-pointer transition-all"
                      >
                        Explore Clauses
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ----------------- COMPLIANCE REGULATION CLAUSE TREE VIEW ----------------- */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Clause Tree - 5 Cols */}
          <div className="lg:col-span-5 bg-surface border border-border-custom rounded-xl p-4 space-y-4 max-h-[600px] overflow-y-auto">
            <div className="border-b border-border-custom/50 pb-2 flex justify-between items-center">
              <span className="font-mono text-[10px] text-text-muted uppercase">CLAUSE TREE STRUCTURE</span>
              <span className="font-mono text-[10px] text-primary font-bold">{activeReg?.code}</span>
            </div>

            <div className="space-y-1">
              {activeReg?.clauses.map(node => renderClauseNode(node))}
            </div>
          </div>

          {/* Right Column: Clause Detail & AI Mappings - 7 Cols */}
          <div className="lg:col-span-7 bg-surface border border-border-custom rounded-xl p-5 space-y-6">
            
            {/* Clause Heading & Text */}
            {selectedClause ? (
              <div className="space-y-4">
                <div className="border-b border-border-custom/50 pb-3 flex flex-wrap gap-2 justify-between items-center">
                  <div>
                    <span className="font-mono text-xs font-bold text-primary">{selectedClause.code}</span>
                    <h3 className="font-display text-sm font-bold text-text-primary mt-0.5">{selectedClause.title}</h3>
                  </div>
                  {selectedClause.gapsCount > 0 && (
                    <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase flex items-center animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Active Gap Identified
                    </span>
                  )}
                </div>

                <div className="p-3.5 bg-background-custom border border-border-custom rounded-lg leading-relaxed text-xs text-text-primary font-sans relative">
                  <div className="absolute top-1 right-2 text-[8px] font-mono text-text-muted uppercase">Federal Directive Text</div>
                  <p>{selectedClause.text}</p>
                </div>

                {/* AI Proposed Mappings Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] text-text-muted uppercase flex items-center">
                      <Sparkles className="w-3.5 h-3.5 text-primary mr-1" /> AI-Proposed Semantic Mappings
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">
                      {(selectedClause.mappedItems || []).length} MAPPED ENTITIES
                    </span>
                  </div>

                  {selectedClause.mappedItems && selectedClause.mappedItems.length > 0 ? (
                    <div className="space-y-2">
                      {selectedClause.mappedItems.map((item) => (
                        <div 
                          key={item.id}
                          className={`p-3 rounded-lg border flex items-center justify-between gap-4 transition-all ${
                            item.status === 'Confirmed' 
                              ? 'bg-emerald-500/5 border-emerald-500/30' 
                              : item.status === 'Rejected'
                                ? 'bg-red-500/5 border-red-500/20 opacity-65'
                                : 'bg-surface-muted/40 border-border-custom hover:border-primary/30'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[9px] font-mono font-bold bg-background-custom border border-border-custom px-1.5 py-0.2 rounded text-text-secondary uppercase">
                                {item.type}
                              </span>
                              <span className="text-xs font-bold text-text-primary">{item.name}</span>
                            </div>
                            
                            <div className="flex items-center space-x-2 text-[10px] text-text-secondary font-mono">
                              <span>Confidence:</span>
                              <ConfidenceBadge confidence={item.confidence} />
                              <span>•</span>
                              <span>Status: <strong className={item.status === 'Confirmed' ? 'text-emerald-400' : item.status === 'Rejected' ? 'text-red-400' : 'text-primary'}>{item.status}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            {item.status === 'Proposed' ? (
                              <>
                                <button
                                  onClick={() => handleUpdateMappingStatus(item.id, 'Confirmed')}
                                  className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 rounded border border-emerald-500/30 cursor-pointer transition-colors"
                                  title="Confirm AI Mapping"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleUpdateMappingStatus(item.id, 'Rejected')}
                                  className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded border border-red-500/30 cursor-pointer transition-colors"
                                  title="Reject AI Mapping"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleUpdateMappingStatus(item.id, 'Proposed')}
                                className="px-2 py-0.5 bg-surface hover:bg-surface-muted text-text-secondary hover:text-text-primary rounded border border-border-custom font-mono text-[9px] cursor-pointer"
                              >
                                Undo {item.status}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* UNMAPPED WARNING STATE */
                    <div className="p-4 bg-amber-500/5 border border-amber-500/35 rounded-lg flex items-start space-x-3 text-xs">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1 text-text-secondary">
                        <h4 className="font-bold text-text-primary">Unmapped Baseline Warning</h4>
                        <p>No active procedures, equipments, or ledger logs are currently confirmed in mapping directory for this clause.</p>
                        <div className="pt-2 text-primary font-mono text-[10px] flex items-center space-x-1 cursor-pointer hover:underline">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Suggestion: Map to "SOP-114 Firewater System Periodic Maintenance Plan" (88% predicted confidence)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-text-muted font-mono text-xs">
                Select a clause node from the tree to examine texts and confirm active AI mapping models.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
