/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EquipmentSpec {
  label: string;
  value: string;
}

export interface EvidenceLink {
  label: string;
  route: string;
}

export interface AiSummary {
  text: string;
  confidence: number;
  evidenceLinks: EvidenceLink[];
}

export interface KeyMetrics {
  mtbf: string;
  mttr: string;
  availability: string;
  mtbfSparkline: number[];
  mttrSparkline: number[];
  availSparkline: number[];
}

export interface EventLog {
  id: string;
  date: string;
  type: 'work_order' | 'failure' | 'inspection' | 'document';
  title: string;
  desc: string;
  status: string;
  link: string;
}

export interface LinkedDocument {
  id: string;
  name: string;
  type: string;
  reason: 'mentioned in' | 'OEM manual' | 'P&ID' | string;
  size: string;
}

export interface ScheduledWo {
  id: string;
  title: string;
  schedule: string;
  priority: 'High' | 'Critical' | 'Medium' | 'Low';
  status: 'In Progress' | 'Scheduled' | 'Overdue' | 'Approved';
}

export interface ClauseStatus {
  code: string;
  title: string;
  status: 'compliant' | 'gap' | 'unmapped';
}

export interface EgoRelationship {
  id: string;
  label: string;
  type: 'Equipment' | 'Document' | 'Failure' | 'Regulation';
  rel: string;
}

export interface PredictionCard {
  riskScore: number;
  predictedMode: string;
  drivers: string[];
  recommendedAction: {
    title: string;
    desc: string;
  };
}

export interface RcaSummary {
  date: string;
  title: string;
  rootCause: string;
  actionTaken: string;
}

export interface EquipmentAsset {
  id: string;
  tag: string;
  name: string;
  type: string;
  criticality: 'A' | 'B' | 'C';
  health: number;
  status: 'ok' | 'warn' | 'critical';
  lastMaint: string;
  openWos: number;
  compliance: 'compliant' | 'gap' | 'unmapped';
  plant: string;
  area: string;
  unit: string;
  specs: EquipmentSpec[];
  aiSummary: AiSummary;
  metrics: KeyMetrics;
  history: EventLog[];
  documents: LinkedDocument[];
  scheduledWos: ScheduledWo[];
  clauses: ClauseStatus[];
  relationships: EgoRelationship[];
  predictions: PredictionCard;
  pastRca: RcaSummary[];
}

export const mockEquipmentAssets: EquipmentAsset[] = [
  {
    id: 'P-101',
    tag: 'P-101',
    name: 'Centrifugal Crude Feed Pump',
    type: 'Pump',
    criticality: 'A',
    health: 84,
    status: 'warn',
    lastMaint: '2026-07-02',
    openWos: 2,
    compliance: 'gap',
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Area A - Crude Block',
    unit: 'Crude Distillation Unit (CDU-1)',
    specs: [
      { label: 'Flow Rate', value: '140 m³/h' },
      { label: 'Speed', value: '2900 RPM' },
      { label: 'Power', value: '45 kW' },
      { label: 'Inlet Pressure', value: '2.1 BAR' },
      { label: 'Discharge Pressure', value: '15.4 BAR' },
      { label: 'Sealing Plan', value: 'API Plan 53A' },
      { label: 'Impeller Dia.', value: '240 mm' },
    ],
    aiSummary: {
      text: 'Transient suction cavitation observed on start-up. Risk of early impeller wear is medium. Alignment is within nominal tolerance but seal pressure is trending slightly high.',
      confidence: 92,
      evidenceLinks: [
        { label: 'Vibration Logs (July)', route: '#documents' },
        { label: 'SOP-REF-112 Section 4', route: '#documents' },
      ],
    },
    metrics: {
      mtbf: '342 hrs',
      mttr: '2.1 hrs',
      availability: '96.4%',
      mtbfSparkline: [280, 295, 310, 305, 320, 335, 342],
      mttrSparkline: [3.4, 3.1, 2.9, 2.7, 2.5, 2.3, 2.1],
      availSparkline: [93.2, 94.1, 94.8, 95.2, 95.8, 96.1, 96.4],
    },
    history: [
      {
        id: 'EV-101',
        date: '2026-07-10',
        type: 'inspection',
        title: 'Vibration & Thermal Diagnostics',
        desc: 'Stator alignment and axial thrust displacement scans completed. Minor vibration detected in radial plane (2.4 mm/s).',
        status: 'Pass',
        link: '#admin/audit-log',
      },
      {
        id: 'EV-102',
        date: '2026-07-02',
        type: 'work_order',
        title: 'WO-2041: Preventive Manifold Alignment',
        desc: 'Realigned suction coupler bolts and verified lock nut torques. Completed by Arun Kumar (Tech).',
        status: 'Completed',
        link: '#maintenance',
      },
      {
        id: 'EV-103',
        date: '2026-06-15',
        type: 'document',
        title: 'P&ID Schematic Revision Mapped',
        desc: 'System auto-processed PID-992-SCHEMATIC-REFINERY.pdf and mapped P-101 node references.',
        status: 'Active',
        link: '#documents',
      },
      {
        id: 'EV-104',
        date: '2026-05-12',
        type: 'failure',
        title: 'Impeller Hydraulic Cavitation Loss',
        desc: 'Suction pressure dropped below 1.1 BAR resulting in minor vacuum pockets. System triggered low suction shut-down.',
        status: 'Resolved',
        link: '#maintenance',
      },
    ],
    documents: [
      { id: 'doc-1', name: 'PID-992-SCHEMATIC-REFINERY.pdf', type: 'P&ID Schematic', reason: 'P&ID', size: '12.4 MB' },
      { id: 'doc-2', name: 'OEM-PUMP-CENTRIFUGAL-MANUAL.pdf', type: 'OEM Technical Manual', reason: 'OEM manual', size: '8.1 MB' },
      { id: 'doc-3', name: 'SOP-REF-112-CRUDE-PUMPING.pdf', type: 'Standard Operating Procedure', reason: 'mentioned in', size: '2.3 MB' },
    ],
    scheduledWos: [
      { id: 'WO-2041', title: 'Calibrate Pressure Gauge PG-104', schedule: 'Due Today', priority: 'High', status: 'In Progress' },
      { id: 'WO-2042', title: 'Apply Machinery Warning Safety Labels', schedule: 'Due in 3 days', priority: 'Medium', status: 'Scheduled' },
    ],
    clauses: [
      { code: 'Factory Act Section 21', title: 'Mandatory Shielding & Warning Signs for Rotating Machinery', status: 'gap' },
      { code: 'OISD-STD-118 Clause 6.4', title: 'Routine Fire & Hazard Protective Enclosure Drills', status: 'compliant' },
      { code: 'PESO-PRESS-REG-2016', title: 'High Pressure Recipient Seal Certifications', status: 'compliant' },
    ],
    relationships: [
      { id: 'V-230', label: 'Fuel Gas Isolation Valve V-230', type: 'Equipment', rel: 'Upstream Feeder' },
      { id: 'TF-2', label: 'Crude Storage Tank TF-2', type: 'Equipment', rel: 'Suction Source' },
      { id: 'OISD-118', label: 'OISD-STD-118 Clause 6.4', type: 'Regulation', rel: 'Governing Policy' },
      { id: 'PID-992', label: 'PID-992-SCHEMATIC-REFINERY.pdf', type: 'Document', rel: 'P&ID Reference' },
    ],
    predictions: {
      riskScore: 35,
      predictedMode: 'Impeller Wear / Hydraulic Cavitation',
      drivers: [
        'Slight pressure differential mismatch (0.4 BAR delta)',
        'Upstream V-230 butterfly restriction',
        'High transient vibration spikes during hot startup',
      ],
      recommendedAction: {
        title: 'Inspect V-230 Butterfly Valve coupling',
        desc: 'Verify that upstream butterfly valve can achieve 100% full-bore clearance. Tighten actuator coupling backlash.',
      },
    },
    pastRca: [
      {
        date: '2026-05-12',
        title: 'Impeller Hydraulic Cavitation Root-Cause Analysis',
        rootCause: 'Upstream isolation valve V-230 was 10% stuck partially closed due to pneumatic actuator seal backlash.',
        actionTaken: 'Re-calibrated manual actuator stem. Implemented weekly stroke-test check.',
      },
    ],
  },
  {
    id: 'C-3',
    tag: 'C-3',
    name: 'Reciprocating Stage-2 Compressor',
    type: 'Compressor',
    criticality: 'A',
    health: 46,
    status: 'critical',
    lastMaint: '2026-06-12',
    openWos: 3,
    compliance: 'gap',
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Area A - Crude Block',
    unit: 'Gas Compression Unit (GCU-4)',
    specs: [
      { label: 'Flow Rate', value: '1200 Nm³/h' },
      { label: 'Discharge Press.', value: '42.0 BAR' },
      { label: 'Stroke Length', value: '180 mm' },
      { label: 'Cylinder Temp.', value: '112 °C' },
      { label: 'Piston Speed', value: '4.2 m/s' },
      { label: 'Lubricant Type', value: 'Synth ISO 150' },
    ],
    aiSummary: {
      text: 'Stage-2 discharge cylinder temperature is running 14°C above baseline limits. AI analysis estimates high risk of bypass discharge valve leakage due to thermal stress and seal erosion.',
      confidence: 95,
      evidenceLinks: [
        { label: 'Cylinder Heat Logs (June)', route: '#documents' },
        { label: 'SOP-GCU-COMPRESSION-99', route: '#documents' },
      ],
    },
    metrics: {
      mtbf: '210 hrs',
      mttr: '4.8 hrs',
      availability: '91.2%',
      mtbfSparkline: [250, 240, 230, 225, 215, 208, 210],
      mttrSparkline: [3.8, 4.0, 4.2, 4.4, 4.6, 4.7, 4.8],
      availSparkline: [94.5, 93.8, 93.2, 92.5, 91.9, 91.4, 91.2],
    },
    history: [
      {
        id: 'EV-201',
        date: '2026-07-11',
        type: 'failure',
        title: 'Thermal Cylinder-2 Thermal Alarm',
        desc: 'Discharge temp hit 115°C, exceeding high-limit threshold. Intercooler coolant stream adjusted manually.',
        status: 'Active',
        link: '#admin/audit-log',
      },
      {
        id: 'EV-202',
        date: '2026-06-12',
        type: 'work_order',
        title: 'WO-1891: Intercooler Coil Flushing',
        desc: 'Descled internal condenser tubes using mild solvent. Restored pressure differential metrics.',
        status: 'Completed',
        link: '#maintenance',
      },
      {
        id: 'EV-203',
        date: '2026-05-20',
        type: 'inspection',
        title: 'Crankcase Oil Iron-Particulate Scan',
        desc: 'Lab spectrography shows Fe index at 12 ppm (within safe range). Recommended resampling in 60 days.',
        status: 'Pass',
        link: '#admin/audit-log',
      },
    ],
    documents: [
      { id: 'doc-4', name: 'OEM-COMPRESSOR-C3-MANUAL.pdf', type: 'OEM Technical Manual', reason: 'OEM manual', size: '14.2 MB' },
      { id: 'doc-5', name: 'PID-GCU-4-COMPRESSION.pdf', type: 'P&ID Schematic', reason: 'P&ID', size: '10.5 MB' },
    ],
    scheduledWos: [
      { id: 'WO-2055', title: 'Replace Stage-2 Cylinder Discharge Valve', schedule: 'Immediate Execution', priority: 'Critical', status: 'Approved' },
      { id: 'WO-1984', title: 'Perform Cylinder Pressure Recalibration', schedule: 'Due Tomorrow', priority: 'High', status: 'Scheduled' },
    ],
    clauses: [
      { code: 'OISD-STD-118 Clause 6.4', title: 'Weekly Validation of Safety Shut-down Logic Controls', status: 'gap' },
      { code: 'Factory Act Section 21', title: 'Protective Casing for Stator and Drive Shafts', status: 'compliant' },
    ],
    relationships: [
      { id: 'TF-2', label: 'Crude Storage Tank TF-2', type: 'Equipment', rel: 'Suction Gas Provider' },
      { id: 'PID-GCU', label: 'PID-GCU-4-COMPRESSION.pdf', type: 'Document', rel: 'P&ID Reference' },
    ],
    predictions: {
      riskScore: 94,
      predictedMode: 'Discharge Valve Seal Erosion',
      drivers: [
        'Discharge temperature spike to 112°C against 98°C baseline',
        'Fluctuating multi-stage intercooler pressure curves',
        'Stator piston ring wear indicators close to maximum lifespan',
      ],
      recommendedAction: {
        title: 'Dispatch Cylinder Discharge Valve Assembly Kit',
        desc: 'Halt cylinder compression stack immediately, isolate gas manifold, and replace valve seals on Stage 2 head.',
      },
    },
    pastRca: [
      {
        date: '2026-03-10',
        title: 'Crankshaft Main Bearing Thermal Seizure',
        rootCause: 'Lubricant oil viscosity dropped abruptly due to high sulfur sour gas fuel dilution.',
        actionTaken: 'Exchanged bearing shell. Replaced baseline oil with premium heavy-duty high-viscosity synthetic.',
      },
    ],
  },
  {
    id: 'V-230',
    tag: 'V-230',
    name: 'Fuel Gas Header Isolation Butterfly Valve',
    type: 'Valve',
    criticality: 'B',
    health: 91,
    status: 'ok',
    lastMaint: '2026-05-18',
    openWos: 0,
    compliance: 'compliant',
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Area A - Crude Block',
    unit: 'Feed Manifold Block (FMB-2)',
    specs: [
      { label: 'Valve Size', value: '12 inch' },
      { label: 'Rating', value: 'ANSI Class 300' },
      { label: 'Actuator Type', value: 'Pneumatic Double Acting' },
      { label: 'Seal Type', value: 'PTFE Metal-Reinforced Seat' },
      { label: 'Air Supply', value: '5.5 BAR nominal' },
    ],
    aiSummary: {
      text: 'Sealing disc integrity is high. Leak rate is minimal. Pneumatic actuator transit stroke cycle is clocked at 2.4s, well within the safety criteria.',
      confidence: 97,
      evidenceLinks: [
        { label: 'Valve Stroke Logs (May)', route: '#documents' },
      ],
    },
    metrics: {
      mtbf: '1240 hrs',
      mttr: '0.8 hrs',
      availability: '99.9%',
      mtbfSparkline: [1150, 1180, 1200, 1210, 1220, 1235, 1240],
      mttrSparkline: [1.2, 1.1, 1.0, 0.9, 0.9, 0.8, 0.8],
      availSparkline: [99.7, 99.8, 99.8, 99.9, 99.9, 99.9, 99.9],
    },
    history: [
      {
        id: 'EV-301',
        date: '2026-05-18',
        type: 'work_order',
        title: 'Pneumatic Pack Gland Replaced',
        desc: 'Re-stuffed double Teflon ring packing to prevent future micro-vent gas leakage. Re-zeroed pneumatic actuator.',
        status: 'Completed',
        link: '#maintenance',
      },
      {
        id: 'EV-302',
        date: '2026-05-15',
        type: 'inspection',
        title: 'Acoustic Leak-Rate Verification',
        desc: 'Ultrasonic sensor shows absolute zero leak rate across the metal seat (Class VI criteria).',
        status: 'Pass',
        link: '#admin/audit-log',
      },
    ],
    documents: [
      { id: 'doc-6', name: 'OEM-VALVE-BUTTERFLY-MANUAL.pdf', type: 'OEM Technical Manual', reason: 'OEM manual', size: '5.4 MB' },
      { id: 'doc-7', name: 'PID-FEED-MANIFOLD.pdf', type: 'P&ID Schematic', reason: 'P&ID', size: '7.8 MB' },
    ],
    scheduledWos: [],
    clauses: [
      { code: 'PESO-PRESS-REG-2016', title: 'High-Pressure Safety Seal Verification Requirements', status: 'compliant' },
    ],
    relationships: [
      { id: 'P-101', label: 'Centrifugal Crude Feed Pump P-101', type: 'Equipment', rel: 'Suction Throttle' },
      { id: 'C-3', label: 'Reciprocating Stage-2 Compressor C-3', type: 'Equipment', rel: 'Venting Isolation' },
    ],
    predictions: {
      riskScore: 8,
      predictedMode: 'PTFE Seat Degradation',
      drivers: [
        'Routine operating abrasion coefficient',
        'Standard stem friction metrics show a normal 2% rise over 90 days',
      ],
      recommendedAction: {
        title: 'Apply Stem Lubricant Grease',
        desc: 'Grease actuator stem during regular field operator walkdown. No process isolation required.',
      },
    },
    pastRca: [],
  },
  {
    id: 'TF-2',
    tag: 'TF-2',
    name: 'Floating Roof Crude Tank 10,000 m³',
    type: 'Tank',
    criticality: 'B',
    health: 95,
    status: 'ok',
    lastMaint: '2026-04-10',
    openWos: 1,
    compliance: 'compliant',
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Area A - Crude Block',
    unit: 'Tank Farm Storage (TFS-1)',
    specs: [
      { label: 'Capacity', value: '10,000 m³' },
      { label: 'Height', value: '18 m' },
      { label: 'Diameter', value: '32 m' },
      { label: 'Storage Medium', value: 'Sour Crude Oil' },
      { label: 'Roof Design', value: 'Internal Floating double-deck' },
      { label: 'Ground Earth', value: '6 copper ribbons' },
    ],
    aiSummary: {
      text: 'Floating deck altitude and liquid level trackers coordinate perfectly. Peripheral volatile hydrocarbon sniffing grid registers zero ppm leakage.',
      confidence: 94,
      evidenceLinks: [
        { label: 'Vapor Sniff Grid (July)', route: '#documents' },
      ],
    },
    metrics: {
      mtbf: '4500 hrs',
      mttr: '12.0 hrs',
      availability: '99.5%',
      mtbfSparkline: [4200, 4300, 4400, 4450, 4480, 4490, 4500],
      mttrSparkline: [14.5, 14.0, 13.5, 13.0, 12.5, 12.2, 12.0],
      availSparkline: [99.2, 99.3, 99.4, 99.5, 99.5, 99.5, 99.5],
    },
    history: [
      {
        id: 'EV-401',
        date: '2026-04-10',
        type: 'work_order',
        title: 'Primary Foam Deck Seal Swapped',
        desc: 'Replaced secondary rim elastomeric scraper. Inspected guide poles for vertical alignment.',
        status: 'Completed',
        link: '#maintenance',
      },
      {
        id: 'EV-402',
        date: '2026-03-22',
        type: 'inspection',
        title: 'Ultrasonic Annular Plate Thickness Scan',
        desc: 'Measured wall thickness at 36 radial positions. Corrosion rate calculated at <0.05 mm/year.',
        status: 'Pass',
        link: '#admin/audit-log',
      },
    ],
    documents: [
      { id: 'doc-8', name: 'OEM-TANK-TF2-SPEC.pdf', type: 'OEM Technical Manual', reason: 'OEM manual', size: '15.6 MB' },
      { id: 'doc-9', name: 'PID-TANK-FARM.pdf', type: 'P&ID Schematic', reason: 'P&ID', size: '11.2 MB' },
    ],
    scheduledWos: [
      { id: 'WO-2101', title: 'Inspect Primary Foam Seal Elastomer', schedule: 'Due in 15 days', priority: 'Low', status: 'Scheduled' },
    ],
    clauses: [
      { code: 'OISD-STD-118 Clause 6.4', title: 'Secondary Containment Bund Walls and Siphon Drain Valve Protocols', status: 'compliant' },
      { code: 'Factory Act Section 21', title: 'Shielding Warnings around Power Transmission Parts', status: 'unmapped' },
    ],
    relationships: [
      { id: 'P-101', label: 'Centrifugal Crude Feed Pump P-101', type: 'Equipment', rel: 'Suction Reservoir Source' },
    ],
    predictions: {
      riskScore: 4,
      predictedMode: 'Primary Foam Seal Friction Wear',
      drivers: [
        'Floating roof cumulative travel index reaches 82% of seal design cycle',
      ],
      recommendedAction: {
        title: 'Perform Visual Rim Scan',
        desc: 'Conduct visual confirmation of foam seal from shell platform. Check for any liquid crude bleed or dark stains.',
      },
    },
    pastRca: [],
  },
  {
    id: 'FW-P1',
    tag: 'FW-P1',
    name: 'Emergency Diesel Firewater Booster Pump',
    type: 'Pump',
    criticality: 'A',
    health: 62,
    status: 'warn',
    lastMaint: '2025-11-20',
    openWos: 1,
    compliance: 'gap',
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Utilities & Offsites',
    unit: 'Fire Water Station (FWS-3)',
    specs: [
      { label: 'Capacity', value: '450 m³/h' },
      { label: 'Test Pressure', value: '12.5 BAR' },
      { label: 'Engine Model', value: 'Cummins 6BTA Diesel' },
      { label: 'Tank Capacity', value: '400 Liters' },
      { label: 'Battery System', value: '24V Lead-Acid dual bank' },
    ],
    aiSummary: {
      text: 'Diesel starter solenoid triggers successfully but pressure transducer records erratic fluctuation. Crucially, the mandatory weekly run verification standard is overdue by 4 shifts.',
      confidence: 89,
      evidenceLinks: [
        { label: 'Weekly Engine Cranking Logs', route: '#documents' },
        { label: 'OISD-STD-118 Fire Standards', route: '#documents' },
      ],
    },
    metrics: {
      mtbf: '180 hrs',
      mttr: '3.5 hrs',
      availability: '85.0%',
      mtbfSparkline: [220, 210, 200, 195, 188, 182, 180],
      mttrSparkline: [2.5, 2.8, 3.0, 3.1, 3.3, 3.4, 3.5],
      availSparkline: [92.0, 91.0, 89.5, 88.0, 86.8, 85.5, 85.0],
    },
    history: [
      {
        id: 'EV-501',
        date: '2026-07-01',
        type: 'failure',
        title: 'Starter Motor Solenoid Relay Sticking',
        desc: 'Emergency engine cranking was delayed by 45s due to rusted relay contact bridge.',
        status: 'Resolved',
        link: '#maintenance',
      },
      {
        id: 'EV-502',
        date: '2025-11-20',
        type: 'work_order',
        title: 'Diesel Drive Shaft Complete Overhaul',
        desc: 'Replaced coupling sleeve, swapped fuel injection nozzles, and load tested generator block for 4 hours.',
        status: 'Completed',
        link: '#maintenance',
      },
    ],
    documents: [
      { id: 'doc-10', name: 'OEM-CUMMINS-FIREPUMP-MANUAL.pdf', type: 'OEM Technical Manual', reason: 'OEM manual', size: '9.2 MB' },
      { id: 'doc-11', name: 'OISD-STD-118-FIRE-PROTECTION.pdf', type: 'Regulatory Safety Code', reason: 'mentioned in', size: '14.5 MB' },
    ],
    scheduledWos: [
      { id: 'WO-2042', title: 'Weekly Engine Cranking and Flow Verification Test', schedule: 'Overdue (4 Shifts)', priority: 'High', status: 'Overdue' },
    ],
    clauses: [
      { code: 'OISD-STD-118 Clause 6.4', title: 'Mandatory Weekly Mechanical Cranking and Pressure Booster Drills', status: 'gap' },
    ],
    relationships: [
      { id: 'TF-2', label: 'Crude Storage Tank TF-2', type: 'Equipment', rel: 'Fire suppression reserve water draw' },
      { id: 'OISD-118', label: 'OISD-STD-118 Clause 6.4', type: 'Regulation', rel: 'Regulatory Compliance Standard' },
    ],
    predictions: {
      riskScore: 65,
      predictedMode: 'Starter Motor Relay Insulation Breakdowns',
      drivers: [
        'Humid weather factors on copper terminals',
        'Engine cold start intervals exceeded 14 days without active heating cycles',
      ],
      recommendedAction: {
        title: 'Manually Crank Diesel Engine & Log Flow',
        desc: 'Conduct the mandatory OISD-STD-118 run test. Record startup timing logs and check automatic water pressure transfer loop.',
      },
    },
    pastRca: [
      {
        date: '2026-07-01',
        title: 'Starter Motor Sticking Relay Malfunction',
        rootCause: 'Salt moisture micro-oxidation accumulated on ignition contacts inside the solenoid.',
        actionTaken: 'Manually sanded relay bridge. Applied high-temperature dielectric contact silicone gel.',
      },
    ],
  },
];

export interface TreeNode {
  id: string;
  label: string;
  type: 'plant' | 'area' | 'unit' | 'equipment';
  childrenIds?: string[];
  equipmentId?: string;
}

export const mockEquipmentTree: Record<string, TreeNode> = {
  'plant-1': {
    id: 'plant-1',
    label: 'Reliance Jamnagar Refinery - Sector A',
    type: 'plant',
    childrenIds: ['area-1', 'area-2'],
  },
  'area-1': {
    id: 'area-1',
    label: 'Area A - Crude Block',
    type: 'area',
    childrenIds: ['unit-1', 'unit-2', 'unit-3'],
  },
  'unit-1': {
    id: 'unit-1',
    label: 'Crude Distillation Unit (CDU-1)',
    type: 'unit',
    childrenIds: ['equip-p101', 'equip-v230'],
  },
  'equip-p101': {
    id: 'equip-p101',
    label: 'P-101 Centrifugal Crude Pump',
    type: 'equipment',
    equipmentId: 'P-101',
  },
  'equip-v230': {
    id: 'equip-v230',
    label: 'V-230 Butterfly Isolation Valve',
    type: 'equipment',
    equipmentId: 'V-230',
  },
  'unit-2': {
    id: 'unit-2',
    label: 'Gas Compression Unit (GCU-4)',
    type: 'unit',
    childrenIds: ['equip-c3'],
  },
  'equip-c3': {
    id: 'equip-c3',
    label: 'C-3 Reciprocating Compressor',
    type: 'equipment',
    equipmentId: 'C-3',
  },
  'unit-3': {
    id: 'unit-3',
    label: 'Tank Farm Storage (TFS-1)',
    type: 'unit',
    childrenIds: ['equip-tf2'],
  },
  'equip-tf2': {
    id: 'equip-tf2',
    label: 'TF-2 Floating Roof Tank',
    type: 'equipment',
    equipmentId: 'TF-2',
  },
  'area-2': {
    id: 'area-2',
    label: 'Utilities & Offsites',
    type: 'area',
    childrenIds: ['unit-4'],
  },
  'unit-4': {
    id: 'unit-4',
    label: 'Fire Water Station (FWS-3)',
    type: 'unit',
    childrenIds: ['equip-fwp1'],
  },
  'equip-fwp1': {
    id: 'equip-fwp1',
    label: 'FW-P1 Diesel Firewater Pump',
    type: 'equipment',
    equipmentId: 'FW-P1',
  },
};
