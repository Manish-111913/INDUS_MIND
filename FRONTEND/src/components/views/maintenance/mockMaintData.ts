/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Assignee {
  name: string;
  email: string;
  avatar: string;
  role: string;
}

export interface SafetyItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ProcedureStep {
  id: string;
  title: string;
  desc: string;
  checked: boolean;
  note: string;
  photo: string | null;
}

export interface PartItem {
  partNo: string;
  name: string;
  qty: number;
  cost: number;
}

export interface LaborItem {
  technician: string;
  role: string;
  hours: number;
  rate: number;
}

export interface AttachmentItem {
  id: string;
  name: string;
  size: string;
  date: string;
}

export interface ActivityLog {
  date: string;
  user: string;
  action: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  equipmentId: string;
  equipmentName: string;
  type: 'PM' | 'CM' | 'Predictive' | 'Inspection';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  assignee: Assignee;
  dueDate: string;
  status: 'Open' | 'In Progress' | 'On Hold' | 'Review' | 'Closed';
  sla: 'MET' | 'WARN' | 'BREACH';
  slaDetails: string;
  description: string;
  safetyChecklist: SafetyItem[];
  steps: ProcedureStep[];
  parts: PartItem[];
  labor: LaborItem[];
  attachments: AttachmentItem[];
  logs: ActivityLog[];
  failureCode?: string;
  rootCause?: string;
  closureNotes?: string;
  actualHours?: number;
}

export interface AiContext {
  similarWos: {
    id: string;
    title: string;
    fixedBy: string;
    confidence: number;
    citation: string;
    citationDocId: string;
  }[];
  sopSteps: {
    title: string;
    excerpt: string;
    confidence: number;
    docName: string;
    docId: string;
  }[];
  failureModes: {
    mode: string;
    frequency: string;
    confidence: number;
    recommendation: string;
  }[];
}

export const MOCK_ASSIGNEES: Assignee[] = [
  { name: 'Arun Kumar', email: 'tech@indusmind.io', avatar: 'AK', role: 'Field Technician' },
  { name: 'Priya Sharma', email: 'engineer@indusmind.io', avatar: 'PS', role: 'Maintenance Engineer' },
  { name: 'Rajesh Nair', email: 'manager@indusmind.io', avatar: 'RN', role: 'Plant Manager' },
  { name: 'Meena Iyer', email: 'compliance@indusmind.io', avatar: 'MI', role: 'Compliance Officer' }
];

export const INITIAL_WORK_ORDERS: WorkOrder[] = [
  {
    id: 'WO-2041',
    title: 'Calibrate Pressure Gauge PG-104 on Crude Feed Pump P-101',
    equipmentId: 'P-101',
    equipmentName: 'Centrifugal Crude Feed Pump',
    type: 'Inspection',
    priority: 'High',
    assignee: MOCK_ASSIGNEES[0], // Arun Kumar
    dueDate: '2026-07-12', // Due Today
    status: 'In Progress',
    sla: 'MET',
    slaDetails: 'SLA MET (Response < 30m)',
    description: 'Isolate pressure transmitter line and clean diaphragm plate. Calibrate Zero and Span range against standard deadweight tester.',
    safetyChecklist: [
      { id: 's1', text: 'Acquire hot work permit #PER-883 before executing work.', checked: true },
      { id: 's2', text: 'Verify suction pump manifold is isolated and locked out (LOTO procedure).', checked: true },
      { id: 's3', text: 'Ensure double vapor respirator is utilized near open manifold venting lines.', checked: false }
    ],
    steps: [
      { id: 'step1', title: 'Isolate Sensor Line', desc: 'Turn secondary manifold isolation screw counter-clockwise by 4 full notches.', checked: true, note: 'Screw isolated successfully.', photo: null },
      { id: 'step2', title: 'Clean Diaphragm Plate', desc: 'Spray pressure sensor inlet with certified contact cleaner. Avoid abrasive scraping.', checked: false, note: '', photo: null },
      { id: 'step3', title: 'Calibrate Zero and Span points', desc: 'Inject master nitrogen reference gas and tune zero potentiometers to match.', checked: false, note: '', photo: null }
    ],
    parts: [
      { partNo: 'PT-901', name: 'Nitrile Seal Gasket', qty: 1, cost: 24.50 },
      { partNo: 'CL-042', name: 'Precision Contact Cleaner Can', qty: 1, cost: 12.00 }
    ],
    labor: [
      { technician: 'Arun Kumar', role: 'Field Technician', hours: 1.5, rate: 65.00 }
    ],
    attachments: [
      { id: 'att-1', name: 'PG-104-calibration-spec.pdf', size: '1.4 MB', date: '2026-05-10' }
    ],
    logs: [
      { date: '2026-07-12 08:30', user: 'Priya Sharma', action: 'Created work order and assigned to Arun Kumar' },
      { date: '2026-07-12 09:15', user: 'Arun Kumar', action: 'Acknowledged work order and changed status to In Progress' }
    ]
  },
  {
    id: 'WO-2042',
    title: 'Replace Impeller Housing Gasket on Feed Pump P-101',
    equipmentId: 'P-101',
    equipmentName: 'Centrifugal Crude Feed Pump',
    type: 'PM',
    priority: 'Critical',
    assignee: MOCK_ASSIGNEES[0], // Arun Kumar
    dueDate: '2026-07-10', // Overdue!
    status: 'Open',
    sla: 'WARN',
    slaDetails: 'SLA WARN (Pending Start > 24h)',
    description: 'Crude pump casing shows signs of localized seepage near the impeller flange. Replace gasket with premium high-temp Teflon flange seal.',
    safetyChecklist: [
      { id: 's1', text: 'Implement lock-out/tag-out (LOTO) on Pump Motor circuit breaker CB-P101A.', checked: false },
      { id: 's2', text: 'Depressurize pump casing and check low point drain for complete evacuation.', checked: false },
      { id: 's3', text: 'Conduct atmospheric gas testing for explosive hydrocarbons; verify <0.5% LEL.', checked: false }
    ],
    steps: [
      { id: 'st1', title: 'Verify Electrical Isolation', desc: 'Confirm lock-out padlock and safety tag are securely fastened to breaker panel.', checked: false, note: '', photo: null },
      { id: 'st2', title: 'Disassemble Flange Bolts', desc: 'Carefully unbolt casing bolts in a star pattern to avoid warping.', checked: false, note: '', photo: null },
      { id: 'st3', title: 'Replace Gasket & Clean Surface', desc: 'Scrape old gasket residue, clean face, fit Teflon gasket, and retorque to 120 N-m.', checked: false, note: '', photo: null }
    ],
    parts: [
      { partNo: 'GSK-240-TF', name: 'Teflon Flange Gasket 240mm', qty: 1, cost: 145.00 }
    ],
    labor: [],
    attachments: [
      { id: 'att-2', name: 'OEM-PUMP-CENTRIFUGAL-MANUAL.pdf', size: '8.1 MB', date: '2026-01-15' }
    ],
    logs: [
      { date: '2026-07-10 10:00', user: 'Priya Sharma', action: 'Created work order from predictive vibration alert' }
    ]
  },
  {
    id: 'WO-2043',
    title: 'Emergency Vibration Inspection on Cylinder Head on Compressor C-302B',
    equipmentId: 'C-302B',
    equipmentName: 'High-Pressure Reciprocating Compressor',
    type: 'Predictive',
    priority: 'Critical',
    assignee: MOCK_ASSIGNEES[1], // Priya Sharma
    dueDate: '2026-07-12', // Due Today
    status: 'On Hold',
    sla: 'BREACH',
    slaDetails: 'SLA BREACH (Response Target Violated)',
    description: 'Continuous HMI alarm: Cylinder Head 2 registered radial vibrations of 7.8 mm/s, exceeding safety limits of 4.5 mm/s.',
    safetyChecklist: [
      { id: 's1', text: 'Obtain toxic gas discharge permit for Compressor Bay Area B.', checked: false },
      { id: 's2', text: 'Verify nitrogen purge cycle is active and suction line pressure reads 0.0 BAR.', checked: false }
    ],
    steps: [
      { id: 'stp1', title: 'Check Cylinder Head Anchors', desc: 'Inspect anchoring bolt torques and check for micro-fractures in seat.', checked: false, note: '', photo: null },
      { id: 'stp2', title: 'Vibration Dampener Check', desc: 'Measure oil pressure in hydraulic dampers; top up if reservoir is low.', checked: false, note: '', photo: null }
    ],
    parts: [
      { partNo: 'OIL-HD-50', name: 'Hydraulic Damper Fluid (5L)', qty: 1, cost: 78.00 }
    ],
    labor: [],
    attachments: [],
    logs: [
      { date: '2026-07-12 01:20', user: 'HMI-SYSTEM', action: 'Telemetry alert auto-generated critical work order' },
      { date: '2026-07-12 04:00', user: 'Priya Sharma', action: 'Set work order On Hold: Awaiting safety gas purge completion' }
    ]
  },
  {
    id: 'WO-2044',
    title: 'Quarterly Safety Valve Validation on Boiler B-502',
    equipmentId: 'B-502',
    equipmentName: 'High-Pressure Steam Utility Boiler',
    type: 'Inspection',
    priority: 'Medium',
    assignee: MOCK_ASSIGNEES[3], // Meena Iyer
    dueDate: '2026-07-20',
    status: 'Review',
    sla: 'MET',
    slaDetails: 'SLA MET (Awaiting Closeout)',
    description: 'Perform scheduled pop-test on main steam line safety relief valve PSV-502. Check valve leakage indicators and re-seal certification stamp.',
    safetyChecklist: [
      { id: 's1', text: 'Verify steam lines are operating under dry-run test parameters.', checked: true },
      { id: 's2', text: 'Secure the safety release discharge line anchors.', checked: true }
    ],
    steps: [
      { id: 'stp-1', title: 'Perform Hydrostatic Release Test', desc: 'Trigger manual steam test line lever and verify release pressure exactly at 42.5 BAR.', checked: true, note: 'Relief fired at 42.6 BAR. Clean reset observed.', photo: null },
      { id: 'stp-2', title: 'Attach Lead Stamp & Seal', desc: 'Affix inspection stamp tag #V-COMP-2026 on the valve housing.', checked: true, note: 'Stamp tag attached and wire-secured.', photo: '/assets/sample-thermal.jpg' }
    ],
    parts: [
      { partNo: 'CMP-STAMP-01', name: 'Inspection Lead Seal Wire Pack', qty: 1, cost: 5.40 }
    ],
    labor: [
      { technician: 'Meena Iyer', role: 'Compliance Officer', hours: 2.0, rate: 85.00 }
    ],
    attachments: [
      { id: 'att-41', name: 'PSV-502-compliance-report.docx', size: '154 KB', date: '2026-07-12' }
    ],
    logs: [
      { date: '2026-07-01 09:00', user: 'Meena Iyer', action: 'Scheduled quarterly compliance check' },
      { date: '2026-07-12 11:30', user: 'Meena Iyer', action: 'Completed physical testing and submitted to Review' }
    ]
  },
  {
    id: 'WO-2045',
    title: 'Calibrate Catalytic Gas Detector GD-301 in Sector 4',
    equipmentId: 'GD-301',
    equipmentName: 'Hazardous Gas Detector GD-301',
    type: 'PM',
    priority: 'Low',
    assignee: MOCK_ASSIGNEES[0], // Arun Kumar
    dueDate: '2026-07-25',
    status: 'Closed',
    sla: 'MET',
    slaDetails: 'SLA MET (Closed Loop)',
    description: 'Apply standard 50% LEL methane calibration span gas. Tune trimmer resistors until detector board registers exactly 50% LEL outputs.',
    safetyChecklist: [],
    steps: [],
    parts: [],
    labor: [],
    attachments: [],
    logs: [
      { date: '2026-07-05 08:00', user: 'Arun Kumar', action: 'Calibration completed, logs archived, work order closed' }
    ],
    failureCode: 'FC-CALIBRATION',
    rootCause: 'Zero Point Drift',
    closureNotes: 'Trimmer potentiometer adjusted. Gas response linear and fully compliant with OISD standard.',
    actualHours: 1.0
  }
];

export const MOCK_AI_CONTEXTS: Record<string, AiContext> = {
  'WO-2041': {
    similarWos: [
      {
        id: 'WO-1988',
        title: 'Zero-point recalibration on PG-104',
        fixedBy: 'Recalibrated zero trimmer screw by 2 turns clockwise. Restored exact match.',
        confidence: 94,
        citation: 'WO-1988 Maintenance Log',
        citationDocId: 'doc-3'
      },
      {
        id: 'WO-1712',
        title: 'Sensor line purging on PG-104',
        fixedBy: 'Flushed diaphragm sensor inlet with contact cleaner to clear micro-refinery grit.',
        confidence: 88,
        citation: 'WO-1712 Archive Case',
        citationDocId: 'doc-2'
      }
    ],
    sopSteps: [
      {
        title: 'SOP-REF-112 Clause 4.2',
        excerpt: 'Before unbolting PG-104, isolation valve V-230 must be fully isolated. Spray sensor diaphragm from 10cm distance using cleaner. Scraping or wiping with metallic brushes is strictly prohibited.',
        confidence: 96,
        docName: 'SOP-REF-112-CRUDE-PUMPING.pdf',
        docId: 'doc-3'
      }
    ],
    failureModes: [
      {
        mode: 'Sensor Zero-Drift',
        frequency: '42% of P-101 pressure sensors',
        confidence: 91,
        recommendation: 'Verify reference calibration gas contains exactly 99.9% Nitrogen to avoid atmospheric moisture interference.'
      },
      {
        mode: 'Orifice Clogging due to Tar Seepage',
        frequency: '18% of units',
        confidence: 76,
        recommendation: 'Check the Nitrile gasket integrity. Replace if rubber shows high-temperature hardening.'
      }
    ]
  },
  'WO-2042': {
    similarWos: [
      {
        id: 'WO-1890',
        title: 'Teflon Flange sealing on P-101 casing',
        fixedBy: 'Replaced standard Nitrile seal with G-918 high-temp Teflon. No leakage observed during 30-day run.',
        confidence: 92,
        citation: 'WO-1890 Maintenance Record',
        citationDocId: 'doc-2'
      }
    ],
    sopSteps: [
      {
        title: 'SOP-PM-CENTRIFUGAL Section 6.1',
        excerpt: 'Tighten housing casing bolts in opposite star sequences. Nominal torque for G-918 seal is 120 N-m. Excess torque exceeding 140 N-m may sever the gasket lips.',
        confidence: 95,
        docName: 'OEM-PUMP-CENTRIFUGAL-MANUAL.pdf',
        docId: 'doc-2'
      }
    ],
    failureModes: [
      {
        mode: 'Gasket Flange Blow-out',
        frequency: '28% of cases',
        confidence: 89,
        recommendation: 'Always run diagnostic check on discharge pressure to ensure valve pressure peaks do not exceed 16 BAR design limit.'
      }
    ]
  },
  'WO-2043': {
    similarWos: [
      {
        id: 'WO-1544',
        title: 'Cylinder 2 radial vibration damper tune',
        fixedBy: 'Topped up damper oil reservoir with 1.2L heavy mineral oil. Vibrations dropped to 3.1 mm/s.',
        confidence: 91,
        citation: 'WO-1544 Case History',
        citationDocId: 'doc-1'
      }
    ],
    sopSteps: [
      {
        title: 'SOP-RECIP-VIBE Annex D',
        excerpt: 'Radial vibrations exceeding 5.0 mm/s on Cylinder Head 2 typically trigger hydraulic cushion leaks. Verify oil level and anchoring bolt torque prior to compressor start.',
        confidence: 93,
        docName: 'PID-992-SCHEMATIC-REFINERY.pdf',
        docId: 'doc-1'
      }
    ],
    failureModes: [
      {
        mode: 'Hydraulic Cushion Fluid Leakage',
        frequency: '64% of reciprocal stalls',
        confidence: 95,
        recommendation: 'Inspect casing weld points for hairline cracking using non-destructive dye testing if refilling oil fails to damp vibes.'
      }
    ]
  },
  'WO-2044': {
    similarWos: [
      {
        id: 'WO-1221',
        title: 'Steam PSV safety release check',
        fixedBy: 'Verified relief pressure at 42.5 BAR. Refit tamper-evident lead seal wire.',
        confidence: 97,
        citation: 'WO-1221 Audit Archive',
        citationDocId: 'doc-1'
      }
    ],
    sopSteps: [
      {
        title: 'OISD-STD-118 Clause 8.2',
        excerpt: 'Steam relief valves must be physically pop-tested annually. Inspection stamp and lead seal are mandatory under federal law to prevent unauthorized pressure override.',
        confidence: 98,
        docName: 'SOP-REF-112-CRUDE-PUMPING.pdf',
        docId: 'doc-3'
      }
    ],
    failureModes: [
      {
        mode: 'Zero relief pop-delay',
        frequency: '5% of inspections',
        confidence: 84,
        recommendation: 'Check mechanical release spring for rust scaling. Apply anti-corrosive molybdenum grease if necessary.'
      }
    ]
  },
  'WO-2045': {
    similarWos: [],
    sopSteps: [],
    failureModes: []
  }
};

export const MOCK_LOOKUPS = {
  equipmentTags: ['P-101', 'C-302B', 'B-502', 'GD-301'],
  workOrderTypes: ['PM', 'CM', 'Predictive', 'Inspection'],
  priorities: ['Critical', 'High', 'Medium', 'Low'],
  statuses: ['Open', 'In Progress', 'On Hold', 'Review', 'Closed'],
  failureCodes: [
    { code: 'FC-CALIBRATION', label: 'Calibration / Zero Drift' },
    { code: 'FC-MECHANICAL', label: 'Mechanical Seal Failure' },
    { code: 'FC-HYDRAULIC', label: 'Hydraulic Cavitation' },
    { code: 'FC-ELECTRICAL', label: 'Electrical Coil Short-circuit' },
    { code: 'FC-GASKET', label: 'Gasket Degradation' }
  ],
  rootCauses: [
    { cause: 'Zero Point Drift', desc: 'Trimmer resistance drift over long heat periods.' },
    { cause: 'Impeller Wear', desc: 'Blade pitting caused by suction cavitation bubbles.' },
    { cause: 'Bolt Loosening', desc: 'High vibration causing thread relaxation.' },
    { cause: 'Oil Level Depletion', desc: 'Seepage through damper radial seals.' },
    { cause: 'Material Aging', desc: 'Teflon crystallization under steam cycles.' }
  ]
};

// ============================================================================
// NEW SCHEMAS AND DATA FOR PROMPT P9 (FAILURES, RCA, PREDICTIONS, SCHEDULE)
// ============================================================================

export interface FailureRecord {
  id: string;
  equipmentId: string;
  equipmentName: string;
  failureMode: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  date: string;
  downtimeMinutes: number;
  rcaStatus: 'Pending' | 'In Progress' | 'Published';
  incidentSummary?: string;
  timeline?: { time: string; event: string; status: 'info' | 'warn' | 'error' }[];
}

export interface RcaCase {
  failureId: string;
  rankedCauses: {
    cause: string;
    confidence: number;
    evidence: { source: string; text: string; link?: string }[];
  }[];
  whys: string[]; // 5-why prefilled by AI (editable)
  fishbone: {
    manpower: string[];
    machinery: string[];
    materials: string[];
    methods: string[];
    measurement: string[];
    environment: string[];
  };
  correctiveActions: {
    id: string;
    action: string;
    assignee: string;
    createdWoId?: string;
  }[];
}

export interface RiskPrediction {
  id: string;
  equipmentId: string;
  equipmentName: string;
  area: string;
  riskScore: number;
  predictedFailureMode: string;
  predictionWindow: string;
  drivers: { text: string; link: string }[];
  recommendedAction: string;
  status: 'active' | 'accepted' | 'snoozed' | 'dismissed';
  dismissReason?: string;
  snoozeUntil?: string;
}

export interface ScheduledPm {
  id: string;
  title: string;
  equipmentId: string;
  equipmentName: string;
  date: string; // YYYY-MM-DD
  durationHours: number;
  type: string;
  color: string;
  crew: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  estimatedHours: number;
}

export interface ParetoItem {
  mode: string;
  count: number;
  cumulativePercent: number;
}

export const MOCK_PARETO_DATA: ParetoItem[] = [
  { mode: 'Impeller Cavitation', count: 12, cumulativePercent: 32 },
  { mode: 'Gasket Degradation', count: 9, cumulativePercent: 56 },
  { mode: 'Zero-point Drift', count: 7, cumulativePercent: 75 },
  { mode: 'Bearing Seizure', count: 4, cumulativePercent: 86 },
  { mode: 'Boiler Tube Leak', count: 3, cumulativePercent: 94 },
  { mode: 'Electrical Short', count: 2, cumulativePercent: 100 },
];

export const INITIAL_FAILURES: FailureRecord[] = [
  {
    id: 'F-2026-01',
    equipmentId: 'P-101',
    equipmentName: 'Centrifugal Crude Feed Pump',
    failureMode: 'Impeller Cavitation & Pitting',
    severity: 'Critical',
    date: '2026-07-10',
    downtimeMinutes: 480,
    rcaStatus: 'In Progress',
    incidentSummary: 'Severe cavitation and excessive high-vibration lockout occurred on crude feed pump P-101 during the 12:00 start-up attempt. Secondary impeller blades suffered pitting erosion. Vacuum pocket indicators on suction manifold detected starvation anomalies.',
    timeline: [
      { time: '12:00:15', event: 'Operators issued startup command via HMI for pump motor P-101.', status: 'info' },
      { time: '12:01:45', event: 'Radial vibration alarm triggered at 7.2 mm/s (limit: 4.5 mm/s).', status: 'warn' },
      { time: '12:03:00', event: 'Discharge fluid rate collapsed to zero. Cavitation rattling sounds reported at deck.', status: 'error' },
      { time: '12:04:10', event: 'Manual Emergency Shutdown (ESD) initiated by Sector A supervisor.', status: 'error' },
      { time: '12:15:00', event: 'Lock-out/tag-out (LOTO) breaker isolated to allow internal visual inspection.', status: 'info' }
    ]
  },
  {
    id: 'F-2026-02',
    equipmentId: 'C-302B',
    equipmentName: 'High-Pressure Reciprocating Compressor',
    failureMode: 'Bearing Seizure',
    severity: 'Critical',
    date: '2026-07-05',
    downtimeMinutes: 720,
    rcaStatus: 'Published',
    incidentSummary: 'Main drive journal bearing seized on high-pressure cylinder 2 during automated nitrogen purging. Extreme frictional heating warped the shaft sleeves. Secondary oil film layer was found depleted.',
    timeline: [
      { time: '08:15:00', event: 'Reciprocal station started. Purge cycles active.', status: 'info' },
      { time: '08:45:00', event: 'Oil pressure safety switch dropped to critical 0.8 BAR.', status: 'warn' },
      { time: '09:02:15', event: 'Thermal runaway: main bearing temperatures spiked to 142°C.', status: 'error' },
      { time: '09:03:00', event: 'Interlock tripped automatically. Shaft seized.', status: 'error' }
    ]
  },
  {
    id: 'F-2026-03',
    equipmentId: 'E-102',
    equipmentName: 'Crude Column Pre-heater E-102',
    failureMode: 'Gasket Degradation & Blowout',
    severity: 'High',
    date: '2026-06-28',
    downtimeMinutes: 360,
    rcaStatus: 'Pending',
    incidentSummary: 'Crude oil seepage reported from the main inlet channel flange. The standard Teflon gasket suffered local blowout and severe embrittlement due to continuous thermal stress exceedance.',
    timeline: [
      { time: '22:15:00', event: 'Pre-heater bypass control valve V-401 experienced hunting cycles.', status: 'info' },
      { time: '23:30:00', event: 'Inlet channel temperature spiked to 305°C (design limit 280°C).', status: 'warn' },
      { time: '00:10:00', event: 'Physical hydrocarbon vapors detected by sniffers near pre-heater flange.', status: 'error' },
      { time: '00:30:00', event: 'Hot isolation bypass engaged; pre-heater depressurized for seal replacement.', status: 'info' }
    ]
  },
  {
    id: 'F-2026-04',
    equipmentId: 'GD-301',
    equipmentName: 'Hazardous Gas Detector GD-301',
    failureMode: 'Zero-point Drift',
    severity: 'Medium',
    date: '2026-06-15',
    downtimeMinutes: 120,
    rcaStatus: 'Published',
    incidentSummary: 'Scheduled validation check noted that gas detector GD-301 zero-point drifted outside acceptable regulatory limits, showing false-positive methane gas leak readings (+6% LEL).',
    timeline: [
      { time: '14:00:00', event: 'Weekly field loop checking initiated by safety specialist.', status: 'info' },
      { time: '14:20:00', event: 'Calibration span gas (50% LEL) triggered an actual reading of 58% LEL.', status: 'warn' },
      { time: '14:35:00', event: 'Zero reference gas registered +6% LEL (limit ±2%). Unit failed validation.', status: 'error' }
    ]
  },
  {
    id: 'F-2026-05',
    equipmentId: 'B-502',
    equipmentName: 'High-Pressure Steam Utility Boiler',
    failureMode: 'Boiler Tube Leak',
    severity: 'High',
    date: '2026-06-10',
    downtimeMinutes: 420,
    rcaStatus: 'Pending',
    incidentSummary: 'Steam pressure loss on boiler B-502 traced to a microscopic pinhole rupture in bottom bend tube #4. High dissolved oxygen levels (12 ppb) accelerated internal pitting corrosion.',
    timeline: [
      { time: '04:10:00', event: 'Deaerator dome vent nozzle efficiency started dropping.', status: 'info' },
      { time: '06:00:00', event: 'Feedwater dissolved oxygen readings rose to 12 ppb.', status: 'warn' },
      { time: '07:30:00', event: 'Main steam manifold pressure dropped by 1.2 BAR; feedwater makeup rate doubled.', status: 'warn' },
      { time: '08:00:00', event: 'Boiler shutdown issued due to acoustic leak detection confirmation.', status: 'error' }
    ]
  }
];

export const MOCK_RCA_CASES: Record<string, RcaCase> = {
  'F-2026-01': {
    failureId: 'F-2026-01',
    rankedCauses: [
      {
        cause: 'Hydraulic Cavitation via Suction Starvation',
        confidence: 88,
        evidence: [
          { source: 'WO-1890 Maintenance Record', text: 'Pre-check noted butterfly isolation valve V-230 position feedback mismatch.', link: '#maintenance' },
          { source: 'OEM manual page 42', text: 'Section 4.2 states NPSH (Net Positive Suction Head) must exceed 1.5m to avoid blade cavitation.', link: '#documents' },
          { source: 'HMI Telemetry Log', text: 'Suction pressure dropped to 0.4 BAR at 12:15:30 while motor current rose to 120A.', link: '#admin/audit-log' }
        ]
      },
      {
        cause: 'Impeller Blade Erosion (Normal wear)',
        confidence: 42,
        evidence: [
          { source: 'Physical Inspection', text: 'Slight micro-pitting observed on impeller rim, but not sufficient for complete pressure loss.' }
        ]
      }
    ],
    whys: [
      'Why did P-101 discharge pressure drop to zero? - Because the impeller experienced a total vibration stall and cavitation lock.',
      'Why did the impeller experience vibration stall and cavitation? - Because the suction fluid rate fell below the nominal 140 m³/h requirement, creating vacuum pockets.',
      'Why did the suction fluid rate drop below minimum limits? - Because the upstream butterfly valve V-230 remained stuck in 10% partially-closed position.',
      'Why did butterfly valve V-230 remain stuck in a partially-closed position? - Because the pneumatic actuator seal ruptured, preventing full air pressure stroke.',
      'Why did the pneumatic actuator seal rupture? - Because the actuator was operated beyond its certified 5-year PM overhaul window.'
    ],
    fishbone: {
      manpower: ['Operator overlooked remote limit switch mismatch', 'Technician LOTO took longer than expected'],
      machinery: ['Ruptured pneumatic actuator seal', 'Worn pressure sensor transmitter diaphragm'],
      materials: ['Incompatible seal grease applied in 2025', 'Off-spec Nitrile seal gasket'],
      methods: ['LOTO bypass was authorized verbally instead of formal check', 'Inspection interval set to 12 months instead of 6'],
      measurement: ['HMI telemetry polling rate delayed by 5 seconds', 'PG-104 zero-point was drifted by 4%'],
      environment: ['Extreme ambient heat (44°C) in Sector A', 'High refinery dust scaling on valve shafts']
    },
    correctiveActions: [
      { id: 'ca-1', action: 'Overhaul pneumatic actuator on V-230 and replace seal with high-temp Viton material.', assignee: 'Arun Kumar' },
      { id: 'ca-2', action: 'Update preventative maintenance intervals for Sector A butterfly actuators from 12 to 6 months.', assignee: 'Priya Sharma' },
      { id: 'ca-3', action: 'Recalibrate Zero/Span on PG-104 sensor and replace with stainless diaphragm.', assignee: 'Arun Kumar' }
    ]
  },
  'F-2026-03': {
    failureId: 'F-2026-03',
    rankedCauses: [
      {
        cause: 'Gasket Degradation under Thermal Stress',
        confidence: 94,
        evidence: [
          { source: 'OEM Specs (E-102)', text: 'Standard gaskets certified up to 280°C. Temperature spikes up to 305°C logged on June 28.', link: '#documents' },
          { source: 'Inspection report #912', text: 'Hardened Teflon shards found in the high-point drain separator.' }
        ]
      }
    ],
    whys: [
      'Why did pre-heater E-102 leak? - Because the flange gasket ruptured near the crude inlet nozzle.',
      'Why did the gasket rupture? - Because it hardened and crystallized under extreme heat cycle.',
      'Why did it experience extreme heat cycles? - Because the hot side crude bypass controller fluctuated.',
      'Why did the bypass controller fluctuate? - Because the electronic positioner loop was untuned.',
      'Why was the loop untuned? - Because the control room was operating under default factory coefficients.'
    ],
    fishbone: {
      manpower: ['Control room ignored bypass alarm', 'Tuning technician unassigned'],
      machinery: ['Failing bypass valve positioner', 'Pre-heater tube bundle scaling'],
      materials: ['Standard Teflon gasket used instead of metal spiral wound', 'Off-spec alloy studs'],
      methods: ['No high-temperature alarm interlock on controller', 'Control loop manual override'],
      measurement: ['Inlet thermocouple calibration drifted', 'Flow transmitter dampening too high'],
      environment: ['High ambient sulfur levels accelerated stud oxidation', 'Vibrating deck mountings']
    },
    correctiveActions: [
      { id: 'ca-4', action: 'Install Spiral Wound Metallic Gasket (Inconel 625) on E-102 crude inlet flange.', assignee: 'Arun Kumar' },
      { id: 'ca-5', action: 'Tune PID coefficients on bypass valve loop and verify dynamic response.', assignee: 'Priya Sharma' }
    ]
  },
  'F-2026-05': {
    failureId: 'F-2026-05',
    rankedCauses: [
      {
        cause: 'Localized Oxygen Corrosion Pit',
        confidence: 82,
        evidence: [
          { source: 'Boiler feed water analysis', text: 'Dissolved oxygen reached 12 ppb, exceeding the 5 ppb target limit on June 8.', link: '#documents' },
          { source: 'Metallurgical sample', text: 'Ultrasonic thickness scan showed 45% wall thinning near bottom bend tube #4.' }
        ]
      }
    ],
    whys: [
      'Why did Boiler B-502 experience tube leakage? - Because a pinhole puncture developed in tube #4.',
      'Why did a pinhole puncture develop? - Because localized oxygen pitting corroded the carbon steel wall.',
      'Why did oxygen pitting occur? - Because dissolved oxygen in the boiler feed water exceeded safe parameters.',
      'Why did dissolved oxygen exceed safe parameters? - Because the deaerator mechanical dome venting valve was clogged.',
      'Why was the venting valve clogged? - Because mineral scale deposits blocked the steam vent nozzle.'
    ],
    fishbone: {
      manpower: ['Water chemistry logs reviewed weekly instead of daily', 'No dedicated boiler specialist'],
      machinery: ['Scale blockage on deaerator vent nozzle', 'Feedwater dosing pump failure'],
      materials: ['Low-grade carbon steel tubes prone to oxygen attack', 'Off-spec de-foaming chemicals'],
      methods: ['No automated oxygen monitoring on feedwater line', 'Chemical blowdown interval skipped'],
      measurement: ['Manual oxygen titration kit was expired', 'Vent valve flowmeter stuck'],
      environment: ['Hard water scaling in main plant aquifer supply', 'Boiler room humidity levels high']
    },
    correctiveActions: [
      { id: 'ca-6', action: 'Acid-clean deaerator dome venting nozzle and install visual flow indicator.', assignee: 'Arun Kumar' },
      { id: 'ca-7', action: 'Integrate continuous dissolved oxygen sensor with HMI safety alarm cascade.', assignee: 'Priya Sharma' }
    ]
  }
};

export const MOCK_PREDICTIONS: RiskPrediction[] = [
  {
    id: 'PR-101',
    equipmentId: 'P-101',
    equipmentName: 'Centrifugal Crude Feed Pump',
    area: 'Crude Distillation C-3',
    riskScore: 92,
    predictedFailureMode: 'Impeller Flange Gasket Blow-out',
    predictionWindow: '3 - 5 Days',
    drivers: [
      { text: 'Vibration trend +18% in last 30 days', link: '#equipment' },
      { text: 'Discharge pressure fluctuations exceeding 2.4 BAR', link: '#equipment' },
      { text: 'Similar signature matched past failure F-2026-01 on V-230 valve starvation', link: '#maintenance' }
    ],
    recommendedAction: 'Isolate pump casing during next shift transition, inspect flange seal gasket integrity, and torque casing bolts to 120 N·m.',
    status: 'active'
  },
  {
    id: 'PR-102',
    equipmentId: 'C-302B',
    equipmentName: 'High-Pressure Reciprocating Compressor',
    area: 'Compressors C-3',
    riskScore: 78,
    predictedFailureMode: 'Hydraulic Cushion Fluid Depletion',
    predictionWindow: '10 - 14 Days',
    drivers: [
      { text: 'Radial vibration trend elevated to 4.2 mm/s (limits 4.5 mm/s)', link: '#equipment' },
      { text: 'Cushion oil pressure decay rate: -0.12 BAR per day', link: '#equipment' }
    ],
    recommendedAction: 'Refill hydraulic damper reservoir with heavy mineral oil and inspect radial seals for active weep lines.',
    status: 'active'
  },
  {
    id: 'PR-103',
    equipmentId: 'B-502',
    equipmentName: 'High-Pressure Steam Utility Boiler',
    area: 'Utilities B-5',
    riskScore: 45,
    predictedFailureMode: 'Boiler Tube Scale Deposition',
    predictionWindow: '30 Days',
    drivers: [
      { text: 'Feedwater dissolved oxygen tracking slightly above 6 ppb', link: '#equipment' },
      { text: 'Flue gas heat recovery efficiency dropped by 1.8%', link: '#equipment' }
    ],
    recommendedAction: 'Initiate scheduled chemical blowdown cycle and verify vent nozzle flow indicator.',
    status: 'active'
  },
  {
    id: 'PR-104',
    equipmentId: 'GD-301',
    equipmentName: 'Hazardous Gas Detector GD-301',
    area: 'Utilities B-5',
    riskScore: 64,
    predictedFailureMode: 'Sensor Zero-point Drift Out of Band',
    predictionWindow: '7 Days',
    drivers: [
      { text: 'Detector boards reporting cumulative drift value of +3.8% LEL', link: '#equipment' },
      { text: 'Calibration due date exceeded by 4 days', link: '#equipment' }
    ],
    recommendedAction: 'Deploy standard 50% Methane calibration span gas and calibrate zero span trimmer resistance.',
    status: 'active'
  }
];

export const INITIAL_SCHEDULED_PMS: ScheduledPm[] = [
  { id: 'SCH-101', title: 'P-101 Cavitation Check', equipmentId: 'P-101', equipmentName: 'Centrifugal Crude Feed Pump', date: '2026-07-14', durationHours: 4, type: 'Inspection', color: '#0E7C86', crew: 'Mechanical Crew', priority: 'High', estimatedHours: 4 },
  { id: 'SCH-102', title: 'C-302B Recip Damper Refill', equipmentId: 'C-302B', equipmentName: 'High-Pressure Reciprocating Compressor', date: '2026-07-18', durationHours: 2, type: 'PM', color: '#F5A524', crew: 'Mechanical Crew', priority: 'Medium', estimatedHours: 2 },
  { id: 'SCH-103', title: 'B-502 Safety Valve Pop-Test', equipmentId: 'B-502', equipmentName: 'High-Pressure Steam Utility Boiler', date: '2026-07-22', durationHours: 6, type: 'Inspection', color: '#10B981', crew: 'Electrical Crew', priority: 'Critical', estimatedHours: 6 },
  { id: 'SCH-104', title: 'GD-301 Calibration Loop', equipmentId: 'GD-301', equipmentName: 'Hazardous Gas Detector GD-301', date: '2026-07-12', durationHours: 1.5, type: 'PM', color: '#0E7C86', crew: 'Instrumentation', priority: 'High', estimatedHours: 1.5 },
  { id: 'SCH-105', title: 'C-3 Column Turnaround prep', equipmentId: 'C-3', equipmentName: 'Crude Distillation Column C-3', date: '2026-07-26', durationHours: 24, type: 'Turnaround', color: '#EF4444', crew: 'Vibration Techs', priority: 'Critical', estimatedHours: 24 }
];

