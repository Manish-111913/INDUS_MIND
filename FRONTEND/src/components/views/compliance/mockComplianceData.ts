/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MappedItem {
  id: string;
  type: 'Procedure' | 'Equipment' | 'Record';
  name: string;
  code?: string;
  confidence: number; // percentage, e.g. 94
  status: 'Proposed' | 'Confirmed' | 'Rejected';
}

export interface ClauseNode {
  id: string;
  code: string;
  title: string;
  text: string;
  gapsCount: number;
  mappedItems?: MappedItem[];
  children?: ClauseNode[];
}

export interface Regulation {
  id: string;
  code: string;
  title: string;
  body: 'Factory Act' | 'OISD' | 'PESO' | 'Environmental' | 'ISO';
  clausesCount: number;
  mappedPercent: number;
  gaps: number;
  clauses: ClauseNode[];
}

export interface EvidenceRecord {
  id: string;
  name: string;
  date: string;
  details: string;
  status: string;
}

export interface ComplianceGap {
  id: string;
  clauseId: string;
  clauseCode: string;
  regulationId: string;
  regulationCode: string;
  regulationTitle: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  affectedEquipment: string;
  affectedEquipmentId: string;
  affectedProcedure: string;
  affectedProcedureCode: string;
  owner: string;
  due: string;
  status: 'Open' | 'Remediating' | 'Risk Accepted' | 'Closed';
  riskJustification?: string;
  evidenceRecords: EvidenceRecord[];
  aiExplanation: string;
  sopExcerpt: string;
  clauseText: string;
  history: {
    id: string;
    date: string;
    user: string;
    action: string;
    comment?: string;
  }[];
}

export interface Audit {
  id: string;
  title: string;
  regulationSet: string;
  plantArea: string;
  date: string;
  status: 'Scheduled' | 'In Progress' | 'Completed';
  auditor: string;
}

export interface EvidencePackage {
  id: string;
  name: string;
  regulations: string[];
  plantArea: string;
  dateRange: string;
  itemCount: number;
  coveragePercent: number;
  generatedAt: string;
  downloadUrl: string;
  shareLink: string;
}

export interface HeatmapCell {
  regulationId: string;
  regulationCode: string;
  area: string;
  coveragePercent: number;
  gapsCount: number;
}

export interface RegulatoryAlert {
  id: string;
  date: string;
  source: string;
  title: string;
  description: string;
  severity: 'High' | 'Medium' | 'Low';
  status: 'New' | 'Under Review' | 'Acknowledged';
}

// ==========================================
// MOCK COMPLIANCE DATA
// ==========================================

export const INITIAL_REGULATIONS: Regulation[] = [
  {
    id: 'REG-OISD-118',
    code: 'OISD-STD-118',
    title: 'Layouts and Firewater Protection Systems for Hydrocarbon Processing Plants',
    body: 'OISD',
    clausesCount: 14,
    mappedPercent: 85,
    gaps: 1,
    clauses: [
      {
        id: 'cl-oisd-6',
        code: 'Section 6',
        title: 'Firewater System Design & Verification',
        text: 'This section details the critical parameters for firewater flow rates, distribution piping, and structural booster equipment integrity.',
        gapsCount: 1,
        children: [
          {
            id: 'cl-oisd-6.1',
            code: 'Section 6.1',
            title: 'Firewater Reservoir Capacities',
            text: 'Firewater storage reservoirs shall have minimum capacity corresponding to four hours of aggregate peak flow requirement for high-risk zones.',
            gapsCount: 0,
            mappedItems: [
              { id: 'm-1', type: 'Equipment', name: 'Firewater Storage Tank TK-801', confidence: 98, status: 'Confirmed' },
              { id: 'm-2', type: 'Procedure', name: 'SOP-201: Reservoir Level Monitoring', confidence: 95, status: 'Confirmed' }
            ]
          },
          {
            id: 'cl-oisd-6.4',
            code: 'Section 6.4',
            title: 'Weekly/Quarterly Mechanical Run Testing',
            text: 'All main firewater pumps and standby diesel utility booster systems must undergo full mechanical run and pressure test verification at quarterly intervals (every 90 days) to ensure immediate start-up compliance in emergency conditions. Weekly auxiliary functional crank and lubrication system checks are mandatory for diesel engines.',
            gapsCount: 1,
            mappedItems: [
              { id: 'm-3', type: 'Equipment', name: 'Standby Diesel Firewater Pump FW-P1', confidence: 96, status: 'Confirmed' },
              { id: 'm-4', type: 'Procedure', name: 'SOP-114: Firewater Maintenance Plan', confidence: 91, status: 'Proposed' },
              { id: 'm-5', type: 'Record', name: 'WO-1029: Firewater Pump Mechanical Run Test', confidence: 88, status: 'Proposed' }
            ]
          }
        ]
      },
      {
        id: 'cl-oisd-7',
        code: 'Section 7',
        title: 'LOTO Permitting on Fire Mains',
        text: 'Specifies safety procedures for isolating segments of the primary fire loop during localized plant shutdowns or pipeline modifications.',
        gapsCount: 0,
        children: [
          {
            id: 'cl-oisd-7.1',
            code: 'Section 7.1',
            title: 'Dual Barrier Valve Isolation',
            text: 'Any maintenance activity requiring isolation of fire mains exceeding 6 inches must utilize dual barrier lock-out/tag-out inline valves with physical bleed gauges.',
            gapsCount: 0,
            mappedItems: [
              { id: 'm-6', type: 'Procedure', name: 'SOP-008: Hazardous Pipeline Isolation Protocol', confidence: 94, status: 'Confirmed' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'REG-FACT-21',
    code: 'Factory Act Sec 21',
    title: 'Guarding of Industrial Rotating Machinery & Shields',
    body: 'Factory Act',
    clausesCount: 8,
    mappedPercent: 95,
    gaps: 1,
    clauses: [
      {
        id: 'cl-fact-21.1',
        code: 'Clause 21(1)',
        title: 'Enclosure of Fast Moving Shafts',
        text: 'Every moving part of a prime mover and every flywheel connected thereto shall be securely fenced by safeguards of substantial construction.',
        gapsCount: 1,
        children: [
          {
            id: 'cl-fact-21.1.a',
            code: 'Clause 21(1)(a)',
            title: 'Shield Plate Warning Plates',
            text: 'All rotating shafts and coupling housings must feature visible caution warning plates indicating hazard level and physical entrapment risks.',
            gapsCount: 1,
            mappedItems: [
              { id: 'm-7', type: 'Equipment', name: 'Centrifugal Crude Feed Pump P-101', confidence: 92, status: 'Confirmed' },
              { id: 'm-8', type: 'Procedure', name: 'SOP-402: Machinery Safety Guard Inspections', confidence: 85, status: 'Proposed' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'REG-PESO-05',
    code: 'PESO Valve Dir v5',
    title: 'Pressure Safety Valves Dual-Chamber Relieving Capacity Guidelines',
    body: 'PESO',
    clausesCount: 12,
    mappedPercent: 78,
    gaps: 1,
    clauses: [
      {
        id: 'cl-peso-4',
        code: 'Section 4.2',
        title: 'Overpressure Protection Integrity',
        text: 'All high-pressure vessel systems operating above 25 barg must deploy dual redundant pressure safety valves (PSVs) configured with block-and-bleed interlocks to prevent absolute vessel isolation.',
        gapsCount: 1,
        mappedItems: [
          { id: 'm-9', type: 'Equipment', name: 'Crude Distillation Column C-3 Overpressure Valve PSV-301', confidence: 94, status: 'Confirmed' },
          { id: 'm-10', type: 'Record', name: 'PESO-2025-VALVE-CERT', confidence: 79, status: 'Proposed' }
        ]
      }
    ]
  },
  {
    id: 'REG-ENV-SRU',
    code: 'EPA Rule Sec 12',
    title: 'Environmental Air Quality Emissions for Sulfur Recovery Units',
    body: 'Environmental',
    clausesCount: 6,
    mappedPercent: 92,
    gaps: 0,
    clauses: [
      {
        id: 'cl-env-12',
        code: 'Section 12.1',
        title: 'SO2 Stack Emissions Cap',
        text: 'Continuous Emission Monitoring Systems (CEMS) must log SO2 concentrations hourly. Peak levels must not exceed 150 ppmv on a 24-hour rolling average.',
        gapsCount: 0,
        mappedItems: [
          { id: 'm-11', type: 'Equipment', name: 'Stack Analyzer GD-301', confidence: 97, status: 'Confirmed' },
          { id: 'm-12', type: 'Procedure', name: 'SOP-910: Sulfur Recovery Emission Logging', confidence: 95, status: 'Confirmed' }
        ]
      }
    ]
  },
  {
    id: 'REG-ISO-50001',
    code: 'ISO 50001-2018',
    title: 'Energy Management Systems Operational Baselines',
    body: 'ISO',
    clausesCount: 18,
    mappedPercent: 62,
    gaps: 2,
    clauses: [
      {
        id: 'cl-iso-5',
        code: 'Section 5.4',
        title: 'Energy Performance Indicator (EnPI) Review',
        text: 'Energy baseline models must be updated annually using verified electric and fuel-gas telemetry meters.',
        gapsCount: 2,
        mappedItems: [
          { id: 'm-13', type: 'Procedure', name: 'SOP-992: Annual Energy Audit', confidence: 68, status: 'Proposed' }
        ]
      }
    ]
  }
];

export const INITIAL_GAPS: ComplianceGap[] = [
  {
    id: 'GAP-OISD-118-01',
    clauseId: 'cl-oisd-6.4',
    clauseCode: 'OISD-STD-118 Section 6.4',
    regulationId: 'REG-OISD-118',
    regulationCode: 'OISD-STD-118',
    regulationTitle: 'Layouts and Firewater Protection Systems for Hydrocarbon Processing Plants',
    description: 'Weekly diesel engine lube oil inspection performed but mandatory 90-day comprehensive mechanical firewater flow run test is currently 57 days overdue.',
    severity: 'Critical',
    affectedEquipment: 'Standby Diesel Firewater Pump FW-P1',
    affectedEquipmentId: 'FW-P1',
    affectedProcedure: 'SOP-114: Firewater System Periodic Maintenance Plan',
    affectedProcedureCode: 'SOP-114',
    owner: 'Arun Kumar (Maintenance Supervisor)',
    due: '2026-07-20',
    status: 'Open',
    clauseText: 'All main firewater pumps and standby diesel utility booster systems must undergo full mechanical run and pressure test verification at quarterly intervals (every 90 days) to ensure immediate start-up compliance in emergency conditions.',
    sopExcerpt: 'Section 4.2.1 Pump Maintenance: The firewater booster pumps (FW-P1) shall be run for diagnostic checks at semi-annual intervals to verify impeller integrity and lubrication status. Record oil viscosity in Section 5.',
    aiExplanation: 'Clause 6.4 requires quarterly firewater pump testing; last recorded test 147 days ago; SOP-114 specifies semi-annual — gap in both procedure (SOP requires only semi-annual) and practice (no run conducted in Q2).',
    evidenceRecords: [
      { id: 'rec-1', name: 'WO-1029: Semi-Annual Firewater PM Run', date: '2026-02-15', details: 'Full 1-hour mechanical cranking and head pressure run successfully recorded. Verified pump output.', status: 'Completed' },
      { id: 'rec-2', name: 'Weekly Crank Log Shift #22', date: '2026-07-06', details: 'Auxiliary engine cranked manually for 5 mins. Lube oil checked. No full pressure water flow test executed.', status: 'Verified' }
    ],
    history: [
      { id: 'h-1', date: '2026-07-10 14:02', user: 'AI Compliance Guard', action: 'Gap Identified', comment: 'Scanned maintenance records and noted lack of 90-day PM. Flagged SOP-114 misalignment.' },
      { id: 'h-2', date: '2026-07-11 09:30', user: 'Priya Sharma (HSE Lead)', action: 'Assigned Owner', comment: 'Assigned to Arun Kumar for fast-track remediation scheduling.' }
    ]
  },
  {
    id: 'GAP-FACT-21-01',
    clauseId: 'cl-fact-21.1.a',
    clauseCode: 'Factory Act Clause 21(1)(a)',
    regulationId: 'REG-FACT-21',
    regulationCode: 'Factory Act Sec 21',
    regulationTitle: 'Guarding of Industrial Rotating Machinery & Shields',
    description: 'Safety warning labels and chemical entrapment badges are completely missing from the secondary shaft enclosure plate on crude pump P-101.',
    severity: 'High',
    affectedEquipment: 'Centrifugal Crude Feed Pump P-101',
    affectedEquipmentId: 'P-101',
    affectedProcedure: 'SOP-402: Machinery Safety Guard Inspections',
    affectedProcedureCode: 'SOP-402',
    owner: 'Meena Iyer (Safety Engineer)',
    due: '2026-07-28',
    status: 'Remediating',
    clauseText: 'All rotating shafts and coupling housings must feature visible caution warning plates indicating hazard level and physical entrapment risks.',
    sopExcerpt: 'Section 1.2: General fencing shield guards must be verified visually every shift. Ensure safety latches are secure.',
    aiExplanation: 'Clause 21(1)(a) requires physical rotating shaft caution text plates. Current procedure SOP-402 verifies general latch containment but completely omits check-sheets for warning decals/plates on the P-101 enclosure.',
    evidenceRecords: [
      { id: 'rec-3', name: 'Shift LOTO Verification Log', date: '2026-07-11', details: 'Guard is physically bolted. No warning warning label noted on coupling face.', status: 'Inspected' }
    ],
    history: [
      { id: 'h-3', date: '2026-07-09 11:15', user: 'AI Compliance Guard', action: 'Gap Identified', comment: 'Identified during visual RAG scan of machinery photographs.' },
      { id: 'h-4', date: '2026-07-10 16:00', user: 'Meena Iyer', action: 'Initiated Remediation', comment: 'Contacted vendor to print compliant thermal hazard stickers. Creating maintenance job.' }
    ]
  },
  {
    id: 'GAP-PESO-05-01',
    clauseId: 'cl-peso-4',
    clauseCode: 'PESO Valve Section 4.2',
    regulationId: 'REG-PESO-05',
    regulationCode: 'PESO Valve Dir v5',
    regulationTitle: 'Pressure Safety Valves Dual-Chamber Relieving Capacity Guidelines',
    description: 'Vessel operating pressure requires redundant dual-valve setup. Current physical design of Column C-3 has single valve PSV-301 with active bypass locked.',
    severity: 'High',
    affectedEquipment: 'Crude Distillation Column C-3',
    affectedEquipmentId: 'C-3',
    affectedProcedure: 'SOP-008: Hazardous Pipeline Isolation Protocol',
    affectedProcedureCode: 'SOP-008',
    owner: 'Aditya Vardhan (Plant Manager)',
    due: '2026-08-15',
    status: 'Open',
    clauseText: 'All high-pressure vessel systems operating above 25 barg must deploy dual redundant pressure safety valves (PSVs) configured with block-and-bleed interlocks to prevent absolute vessel isolation.',
    sopExcerpt: 'Section 9.1 Overpressure relief: Vessel Column C-3 relies on single-header relief system via PSV-301. Manual bypass line may be lined up during hot-swapping.',
    aiExplanation: 'PESO Section 4.2 mandates automated block-and-bleed interlocked dual redundant valves for systems above 25 barg. C-3 operates at 28.5 barg but relies on a single valve (PSV-301) + manual bypass, violating the automated redundant interlock directive.',
    evidenceRecords: [
      { id: 'rec-4', name: 'PESO-2025-VALVE-CERT', date: '2025-11-10', details: 'Single valve safety relief calculation approved under legacy rule. Redundant system missing.', status: 'Expired-Legacy' }
    ],
    history: [
      { id: 'h-5', date: '2026-07-05 10:00', user: 'System Inspector', action: 'Gap Identified', comment: 'Imported PESO Valve Directive v5 triggered baseline breach for column C-3 operating metrics.' }
    ]
  },
  {
    id: 'GAP-ISO-50001-01',
    clauseId: 'cl-iso-5',
    clauseCode: 'ISO 50001 Section 5.4',
    regulationId: 'REG-ISO-50001',
    regulationCode: 'ISO 50001-2018',
    regulationTitle: 'Energy Management Systems Operational Baselines',
    description: 'Electrical baseline models on Boiler Feed Pumps (BFP-102) are compiled using static 2024 data instead of active 2025 metrics.',
    severity: 'Low',
    affectedEquipment: 'High-Pressure Steam Boiler B-502',
    affectedEquipmentId: 'B-502',
    affectedProcedure: 'SOP-992: Annual Energy Audit',
    affectedProcedureCode: 'SOP-992',
    owner: 'Unassigned',
    due: '2026-09-01',
    status: 'Open',
    clauseText: 'Energy baseline models must be updated annually using verified electric and fuel-gas telemetry meters.',
    sopExcerpt: 'Section 2.1: Energy benchmarks shall be monitored periodically as per refinery operational demands.',
    aiExplanation: 'ISO 50001 requires strict annual calibration. Current procedure SOP-992 lacks calendar alarms forcing model compilation re-baselines, leading to stale telemetry baseline models.',
    evidenceRecords: [
      { id: 'rec-5', name: 'Annual Energy Review Report', date: '2024-12-05', details: 'Baseline calculation compiled using old fuel telemetry matrices.', status: 'Stale' }
    ],
    history: [
      { id: 'h-6', date: '2026-07-01 08:00', user: 'AI Compliance Guard', action: 'Gap Identified', comment: 'Audit scan flagged 2025 baseline model as non-existent.' }
    ]
  }
];

export const INITIAL_AUDITS: Audit[] = [
  {
    id: 'AUD-2026-01',
    title: 'HSE Firewater System Comprehensive Audit',
    regulationSet: 'OISD-STD-118',
    plantArea: 'Utility Block (Area C)',
    date: '2026-07-25',
    status: 'Scheduled',
    auditor: 'Federal Safety Committee Inspector'
  },
  {
    id: 'AUD-2026-02',
    title: 'Rotating Equipment Guard Safety Sweep',
    regulationSet: 'Factory Act Sec 21',
    plantArea: 'Crude Distillation Unit (Area A)',
    date: '2026-07-18',
    status: 'In Progress',
    auditor: 'Priya Sharma (Internal HSE Lead)'
  },
  {
    id: 'AUD-2026-03',
    title: 'PESO Vessel Safety & Interlocks Verification',
    regulationSet: 'PESO Valve Dir v5',
    plantArea: 'Hydrotreater Unit (Area B)',
    date: '2026-08-05',
    status: 'Scheduled',
    auditor: 'PESO Joint Director (Technical)'
  },
  {
    id: 'AUD-2026-04',
    title: 'EPA Clean Air Emission Monitoring Verification',
    regulationSet: 'EPA Rule Sec 12',
    plantArea: 'Crude Distillation Unit (Area A)',
    date: '2026-06-15',
    status: 'Completed',
    auditor: 'State Pollution Control Auditor'
  }
];

export const INITIAL_EVIDENCE_PACKAGES: EvidencePackage[] = [
  {
    id: 'EV-2026-01',
    name: 'EPA Q2 Emissions Assurance Package',
    regulations: ['EPA Rule Sec 12'],
    plantArea: 'Crude Distillation Unit (Area A)',
    dateRange: '2026-04-01 to 2026-06-30',
    itemCount: 24,
    coveragePercent: 100,
    generatedAt: '2026-07-02 11:30',
    downloadUrl: '#',
    shareLink: 'https://indusmind.app/share/ev-8310a'
  },
  {
    id: 'EV-2026-02',
    name: 'PESO Redundant Valves Prep Pack',
    regulations: ['PESO Valve Dir v5'],
    plantArea: 'Hydrotreater Unit (Area B)',
    dateRange: '2026-01-01 to 2026-07-10',
    itemCount: 15,
    coveragePercent: 88,
    generatedAt: '2026-07-11 15:45',
    downloadUrl: '#',
    shareLink: 'https://indusmind.app/share/ev-9214b'
  }
];

export const HEATMAP_DATA: HeatmapCell[] = [
  { regulationId: 'REG-OISD-118', regulationCode: 'OISD-118', area: 'Crude Distillation (Area A)', coveragePercent: 100, gapsCount: 0 },
  { regulationId: 'REG-OISD-118', regulationCode: 'OISD-118', area: 'Hydrotreater (Area B)', coveragePercent: 90, gapsCount: 0 },
  { regulationId: 'REG-OISD-118', regulationCode: 'OISD-118', area: 'Utility Block (Area C)', coveragePercent: 65, gapsCount: 1 }, // ties to FW-P1 (Utility)
  { regulationId: 'REG-OISD-118', regulationCode: 'OISD-118', area: 'Tank Farm (Area D)', coveragePercent: 85, gapsCount: 0 },

  { regulationId: 'REG-FACT-21', regulationCode: 'Factory Act', area: 'Crude Distillation (Area A)', coveragePercent: 70, gapsCount: 1 }, // ties to P-101 (Crude Unit)
  { regulationId: 'REG-FACT-21', regulationCode: 'Factory Act', area: 'Hydrotreater (Area B)', coveragePercent: 100, gapsCount: 0 },
  { regulationId: 'REG-FACT-21', regulationCode: 'Factory Act', area: 'Utility Block (Area C)', coveragePercent: 100, gapsCount: 0 },
  { regulationId: 'REG-FACT-21', regulationCode: 'Factory Act', area: 'Tank Farm (Area D)', coveragePercent: 100, gapsCount: 0 },

  { regulationId: 'REG-PESO-05', regulationCode: 'PESO Valve', area: 'Crude Distillation (Area A)', coveragePercent: 60, gapsCount: 1 }, // Column C-3 PSV (Crude)
  { regulationId: 'REG-PESO-05', regulationCode: 'PESO Valve', area: 'Hydrotreater (Area B)', coveragePercent: 85, gapsCount: 0 },
  { regulationId: 'REG-PESO-05', regulationCode: 'PESO Valve', area: 'Utility Block (Area C)', coveragePercent: 90, gapsCount: 0 },
  { regulationId: 'REG-PESO-05', regulationCode: 'PESO Valve', area: 'Tank Farm (Area D)', coveragePercent: 100, gapsCount: 0 },

  { regulationId: 'REG-ENV-SRU', regulationCode: 'EPA Rule', area: 'Crude Distillation (Area A)', coveragePercent: 100, gapsCount: 0 },
  { regulationId: 'REG-ENV-SRU', regulationCode: 'EPA Rule', area: 'Hydrotreater (Area B)', coveragePercent: 100, gapsCount: 0 },
  { regulationId: 'REG-ENV-SRU', regulationCode: 'EPA Rule', area: 'Utility Block (Area C)', coveragePercent: 100, gapsCount: 0 },
  { regulationId: 'REG-ENV-SRU', regulationCode: 'EPA Rule', area: 'Tank Farm (Area D)', coveragePercent: 100, gapsCount: 0 },

  { regulationId: 'REG-ISO-50001', regulationCode: 'ISO 50001', area: 'Crude Distillation (Area A)', coveragePercent: 80, gapsCount: 0 },
  { regulationId: 'REG-ISO-50001', regulationCode: 'ISO 50001', area: 'Hydrotreater (Area B)', coveragePercent: 75, gapsCount: 0 },
  { regulationId: 'REG-ISO-50001', regulationCode: 'ISO 50001', area: 'Utility Block (Area C)', coveragePercent: 50, gapsCount: 1 }, // Boiler B-502 (Utility)
  { regulationId: 'REG-ISO-50001', regulationCode: 'ISO 50001', area: 'Tank Farm (Area D)', coveragePercent: 40, gapsCount: 1 }  // Tank meters unmapped
];

export const REGULATORY_ALERTS: RegulatoryAlert[] = [
  {
    id: 'AL-1',
    date: '2026-07-10',
    source: 'EPA (Federal Pollution Authority)',
    title: 'Updated Sulfur Recovery Unit Flue gas particulate capping limits',
    description: 'Federal Air Directive amendment decreases authorized stack SO2 particulate count from 180ppmv to 150ppmv. Mandatory software calibration validation required by 2026-08-01.',
    severity: 'High',
    status: 'New'
  },
  {
    id: 'AL-2',
    date: '2026-07-05',
    source: 'OISD (Oil Industry Safety Directorate)',
    title: 'Standard OISD-118 Mechanical Run-time Frequency Adjustment',
    description: 'Sub-amendment 3A specifies that safety critical water piping loops on utility systems must verify pump cranking and head pressure runtimes strictly under 90-day intervals. Previous 180-day intervals deprecated.',
    severity: 'High',
    status: 'Under Review'
  },
  {
    id: 'AL-3',
    date: '2026-06-28',
    source: 'PESO (Petroleum and Explosives Safety Organization)',
    title: 'Mandatory Fast-track dual interlock retrofits directive',
    description: 'All Class A hydrocarbon crude columns operating under overpressure thresholds must upgrade visual bypass handles to automated block-and-bleed systems. Inspection enforcement scheduled for Q3.',
    severity: 'Medium',
    status: 'Under Review'
  },
  {
    id: 'AL-4',
    date: '2026-06-12',
    source: 'ISO Standard Bureau',
    title: 'ISO 50001 Scope 3 Telemetry Data requirements release',
    description: 'Clarifications on electronic power verification. Requires digital smart meters to be calibrated and matched to baseline algorithms annually.',
    severity: 'Low',
    status: 'Acknowledged'
  }
];

// GAP Trend Line Chart Data
export const GAP_TREND_DATA = [
  { month: 'Jan 26', gapsOpened: 2, gapsClosed: 3, totalActiveGaps: 6 },
  { month: 'Feb 26', gapsOpened: 1, gapsClosed: 2, totalActiveGaps: 5 },
  { month: 'Mar 26', gapsOpened: 3, gapsClosed: 1, totalActiveGaps: 7 },
  { month: 'Apr 26', gapsOpened: 0, gapsClosed: 3, totalActiveGaps: 4 },
  { month: 'May 26', gapsOpened: 2, gapsClosed: 2, totalActiveGaps: 4 },
  { month: 'Jun 26', gapsOpened: 3, gapsClosed: 1, totalActiveGaps: 6 },
  { month: 'Jul 26', gapsOpened: 1, gapsClosed: 3, totalActiveGaps: 4 }
];
