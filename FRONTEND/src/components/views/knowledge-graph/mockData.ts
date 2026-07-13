export interface GraphNodeData {
  id: string;
  label: string;
  type: 'Equipment' | 'Document' | 'FailureEvent' | 'FailureMode' | 'Regulation' | 'Person' | 'Parameter' | 'Procedure' | 'Lesson';
  status?: 'ok' | 'warn' | 'critical' | 'info';
  properties: Record<string, string>;
  connectedDocs?: { name: string; url: string }[];
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: 'MENTIONS' | 'PART_OF' | 'FAILED_WITH' | 'HAS_MODE' | 'GOVERNED_BY' | 'PERFORMED_BY' | 'REFERENCES' | 'APPLIES_TO' | 'DERIVED_FROM';
}

export const mockGraphStats = {
  totalNodes: 1284,
  totalEdges: 4102,
  typesCount: 9,
  typesBreakdown: {
    Equipment: 342,
    Document: 418,
    FailureEvent: 112,
    FailureMode: 84,
    Regulation: 65,
    Person: 42,
    Parameter: 110,
    Procedure: 78,
    Lesson: 33
  }
};

export const mockNodes: GraphNodeData[] = [
  // --- STORY CORE: P-101 & IMMEDIATE PARTS ---
  {
    id: 'P-101',
    label: 'Centrifugal Feed Pump P-101A',
    type: 'Equipment',
    status: 'critical',
    properties: {
      'Asset Tag': 'P-101A',
      'Name': 'Centrifugal Crude Feed Pump A',
      'Location': 'Crude Distillation Unit (CDU-1)',
      'Criticality': 'Critical',
      'Manufacturer': 'Sulzer Pumps',
      'Install Date': '2019-04-12',
      'Design Flow': '450 m³/h',
      'Operating Temp': '145 °C'
    },
    connectedDocs: [
      { name: 'OEM-VALVE-BUTTERFLY-MANUAL.pdf', url: '#documents' },
      { name: 'PID-992-SCHEMATIC-REFINERY.pdf', url: '#documents' }
    ]
  },
  {
    id: 'P-101-MOTOR',
    label: 'P-101 Induction Motor (M-101)',
    type: 'Equipment',
    status: 'warn',
    properties: {
      'Asset Tag': 'M-101A',
      'Power Rating': '315 kW',
      'RPM': '2950 rpm',
      'Voltage': '6.6 kV',
      'Frame Type': 'Ex-d Flameproof'
    }
  },
  {
    id: 'P-101-SEAL',
    label: 'Mechanical Seal Assembly (S-101)',
    type: 'Equipment',
    status: 'critical',
    properties: {
      'Part Number': 'John Crane Type 5620',
      'Sealing Plan': 'API Plan 53A (Dual pressurized)',
      'Barrier Fluid': 'Synthetic Ester (Shell Fluid)',
      'Max Pressure': '40 bar'
    }
  },
  {
    id: 'P-101-IMPELLER',
    label: 'Closed Impeller Shroud (I-101)',
    type: 'Equipment',
    status: 'ok',
    properties: {
      'Material': 'Super Duplex Stainless Steel (ASTM A890)',
      'Diameter': '345 mm',
      'Vane Count': '5',
      'Balance Grade': 'ISO G2.5'
    }
  },

  // --- RELATED COOPERATIVE EQUIPMENT ---
  {
    id: 'P-102',
    label: 'Standby Feed Pump P-101B',
    type: 'Equipment',
    status: 'ok',
    properties: {
      'Asset Tag': 'P-101B',
      'Role': 'Auto-start standby node',
      'Status': 'Standby (Warm)',
      'Last Maint': '2026-06-24'
    }
  },
  {
    id: 'T-100',
    label: 'Crude Feed Buffer Tank T-100',
    type: 'Equipment',
    status: 'ok',
    properties: {
      'Asset Tag': 'T-100-CDU',
      'Volume': '12,500 m³',
      'Static Head': '18.4 m',
      'Max Safe Temp': '65 °C'
    }
  },
  {
    id: 'V-230',
    label: 'Main Fuel Gas Isolation Valve V-230',
    type: 'Equipment',
    status: 'ok',
    properties: {
      'Asset Tag': 'V-230',
      'Valve Class': 'Butterfly Class 300',
      'Actuator': 'Pneumatic Spring-Return',
      'Fail State': 'Close'
    }
  },

  // --- DOCUMENTS MAPPED IN PORTAL ---
  {
    id: 'DOC-OEM-P101',
    label: 'Sulzer P-101 OEM Manual (Rev.4)',
    type: 'Document',
    properties: {
      'Document ID': 'OEM-MAN-SULZER-P101',
      'Author': 'Sulzer Engineering Dept',
      'Published': '2019-01-15',
      'Verification': 'Manufacturer Approved',
      'Classification': 'Technical Confidential'
    },
    connectedDocs: [{ name: 'View Full PDF', url: '#documents' }]
  },
  {
    id: 'DOC-PID-992',
    label: 'PID-992-SCHEMATIC-REFINERY.pdf',
    type: 'Document',
    properties: {
      'Document ID': 'PID-992',
      'Sheet': '01 of 03',
      'Title': 'Crude Distillation Unit Piping & Instrumentation',
      'CAD Version': 'v11.4'
    },
    connectedDocs: [{ name: 'Open Schematic Vault', url: '#documents' }]
  },
  {
    id: 'DOC-WO-3021',
    label: 'Work Order #3021: Seal Maintenance',
    type: 'Document',
    properties: {
      'WO Code': 'CDU-WO-2026-3021',
      'Logged Date': '2026-06-12',
      'Assigned To': 'Alex Chen',
      'Priority': 'Emergency',
      'Status': 'Completed'
    }
  },
  {
    id: 'DOC-WO-3042',
    label: 'Work Order #3042: Vibration Calibration',
    type: 'Document',
    properties: {
      'WO Code': 'CDU-WO-2026-3042',
      'Logged Date': '2026-07-02',
      'Assigned To': 'Alex Chen',
      'Priority': 'Routine',
      'Status': 'Completed'
    }
  },
  {
    id: 'DOC-WO-3055',
    label: 'Work Order #3055: Impeller Swapping',
    type: 'Document',
    properties: {
      'WO Code': 'CDU-WO-2025-3055',
      'Logged Date': '2025-11-20',
      'Assigned To': 'Priya Sharma',
      'Priority': 'High',
      'Status': 'Archived'
    }
  },
  {
    id: 'DOC-SOP-START',
    label: 'SOP-CDU-015: Cold Feed Pump Startup',
    type: 'Document',
    properties: {
      'SOP ID': 'SOP-CDU-015',
      'Effective Date': '2025-05-10',
      'Review Cycle': 'Annual',
      'Signoff': 'Operations Panel'
    }
  },
  {
    id: 'DOC-HAZOP-CDU',
    label: 'CDU HAZOP Review Report (2025)',
    type: 'Document',
    properties: {
      'Report ID': 'HAZOP-REF-2025-04',
      'Section': '4.1: Feed Delivery Fault Tree',
      'Scribe': 'Sarah Jenkins'
    }
  },

  // --- FAILURE EVENTS ---
  {
    id: 'EV-2026-06',
    label: 'Mechanical Seal Leakage Event (June 2026)',
    type: 'FailureEvent',
    status: 'critical',
    properties: {
      'Event Date': '2026-06-12',
      'Symptom': 'Volatile hydrocarbon sniffing alarm trigger + fluid spill',
      'Down Time': '18.5 hours',
      'Severity': 'Catastrophic Loss of Primary Containment'
    }
  },
  {
    id: 'EV-2026-02',
    label: 'High Vibration Alarm Event (Feb 2026)',
    type: 'FailureEvent',
    status: 'warn',
    properties: {
      'Event Date': '2026-02-18',
      'Symptom': 'Radial vibration velocity reached 7.2 mm/s RMS',
      'Action': 'Tripped and switched manually to standby P-101B',
      'Severity': 'Moderate Warn Node'
    }
  },
  {
    id: 'EV-2025-11',
    label: 'Impeller Cavitation Pitting Event (Nov 2025)',
    type: 'FailureEvent',
    status: 'critical',
    properties: {
      'Event Date': '2025-11-18',
      'Symptom': 'Decline in discharge pressure with loud pop noises',
      'Action': 'Drained casing, discovered metal pitting on blades',
      'Severity': 'High Equipment Wear'
    }
  },
  {
    id: 'EV-2026-07',
    label: 'Startup Stator Misalignment (July 2026)',
    type: 'FailureEvent',
    status: 'info',
    properties: {
      'Event Date': '2026-07-01',
      'Symptom': 'Axial friction detected immediately on post-maint test run',
      'Correction': 'Laser shim adjustment applied within 2 hours',
      'Severity': 'Minor Commissioning Snag'
    }
  },

  // --- FAILURE MODES ---
  {
    id: 'MODE-SEAL-FAIL',
    label: 'Mechanical Seal Thermal Failure (F-SEAL-01)',
    type: 'FailureMode',
    properties: {
      'Failure Code': 'F-SEAL-01',
      'Mechanism': 'Dry running causing carbon face blistering',
      'Root Cause': 'Barrier fluid starvation or thermal pocket accumulation',
      'Mitigation': 'Ensure vapor flushing / API Plan 11 override'
    }
  },
  {
    id: 'MODE-CAVITATION',
    label: 'Suction Cavitation Pitting (F-IMPELLER-03)',
    type: 'FailureMode',
    properties: {
      'Failure Code': 'F-IMPELLER-03',
      'Mechanism': 'NPSHa < NPSHr leading to vapor pocket collapse',
      'Root Cause': 'Clogged suction strainer or high fluid vapor pressure',
      'Mitigation': 'Strainer purge cycles + suction throttling interlocks'
    }
  },
  {
    id: 'MODE-MISALIGN',
    label: 'Rotor-Stator Angular Misalignment (F-SHAFT-02)',
    type: 'FailureMode',
    properties: {
      'Failure Code': 'F-SHAFT-02',
      'Mechanism': 'Unbalanced shear strain forces across flexible coupling',
      'Root Cause': 'Inadequate shimming or pipe-strain loading on nozzle',
      'Mitigation': 'Laser-guided dial alignment checks post-overhaul'
    }
  },
  {
    id: 'MODE-BEARING-WEAR',
    label: 'Radial Bearing Radial Wear (F-BEAR-05)',
    type: 'FailureMode',
    properties: {
      'Failure Code': 'F-BEAR-05',
      'Mechanism': 'Micro-contact metal fatiguing on inner raceway',
      'Root Cause': 'Lube oil oxidation or moisture ingress (Monsoon humidity)',
      'Mitigation': 'Automated grease injection + moisture venting desiccants'
    }
  },

  // --- REGULATION & CODES ---
  {
    id: 'REG-OISD-118-C64',
    label: 'OISD-STD-118 Clause 6.4 (Sealing)',
    type: 'Regulation',
    properties: {
      'Authority': 'Oil Industry Safety Directorate',
      'Standard Title': 'Layouts & Safety Systems for Hydrocarbon Pumps',
      'Clause Number': 'Clause 6.4',
      'Requirement': 'Double mechanical seal system is mandatory for high-vapor-pressure and highly flammable pump nodes.'
    }
  },
  {
    id: 'REG-API-682',
    label: 'API 682 Shaft Sealing Standard',
    type: 'Regulation',
    properties: {
      'Authority': 'American Petroleum Institute',
      'Scope': 'Shaft sealing systems for centrifugal and rotary pumps',
      'Edition': '4th Edition',
      'Core Rule': 'Category 2/3 gas seals must use external barrier fluid reservoirs with pressure transmitters.'
    }
  },
  {
    id: 'REG-OSHA-1910',
    label: 'OSHA 1910.119 PSM Clause (j)',
    type: 'Regulation',
    properties: {
      'Authority': 'US Department of Labor / OSHA',
      'Scope': 'Process Safety Management (Mechanical Integrity)',
      'Requirement': 'Employer must establish and implement written procedures to maintain the ongoing integrity of primary process pump nodes.'
    }
  },
  {
    id: 'REG-ISO-10816',
    label: 'ISO 10816-3 Vibration Guidelines',
    type: 'Regulation',
    properties: {
      'Authority': 'International Standards Org',
      'Scope': 'Industrial pumps > 15 kW (Zone Limits)',
      'Zone A (Good)': '< 1.8 mm/s RMS',
      'Zone C (Alert)': '4.5 - 7.1 mm/s RMS',
      'Zone D (Trip)': '> 7.1 mm/s RMS (Emergency Action)'
    }
  },

  // --- PEOPLE / ROLES ---
  {
    id: 'USER-PRIYA',
    label: 'Priya Sharma (Lead Rotating Engineer)',
    type: 'Person',
    properties: {
      'Role': 'Lead Mechanical & Rotating Equipment Engineer',
      'Credentials': 'B.Tech Mechanical, 12 Yrs Refining exp',
      'Email': 'priya.sharma@indusrefineries.net',
      'Clearance': 'L3 Engineer / Admin'
    }
  },
  {
    id: 'USER-ALEX',
    label: 'Alex Chen (Senior Millwright Technician)',
    type: 'Person',
    properties: {
      'Role': 'Senior Millwright & Maintenance Team Lead',
      'Credentials': 'Certified Rotary Machinery Specialist',
      'Email': 'alex.chen@indusrefineries.net',
      'Clearance': 'L2 Maintenance'
    }
  },
  {
    id: 'USER-MANISH',
    label: 'Manish Kumar (Compliance Inspector)',
    type: 'Person',
    properties: {
      'Role': 'HSE & Statutory Compliance Inspector',
      'Credentials': 'Regulatory Safety Auditor',
      'Email': 'manish.kumar@indusrefineries.net',
      'Clearance': 'L3 Auditor'
    }
  },
  {
    id: 'USER-SARAH',
    label: 'Sarah Jenkins (CDU-1 Operations Manager)',
    type: 'Person',
    properties: {
      'Role': 'Area Operations Superintendent',
      'Credentials': 'M.S. Chemical Engineering',
      'Email': 'sarah.jenkins@indusrefineries.net',
      'Clearance': 'L4 Superintendent'
    }
  },

  // --- SYSTEM PARAMETERS ---
  {
    id: 'PAR-VIB-VEL',
    label: 'Vibration Velocity RMS (mm/s)',
    type: 'Parameter',
    status: 'warn',
    properties: {
      'Sensor Tag': 'CDU-P101-VIB-01',
      'Frequency Range': '10 Hz - 1000 Hz',
      'Normal Limit': '< 2.8 mm/s',
      'Current Value': '3.2 mm/s',
      'Alarm Threshold': '4.5 mm/s'
    }
  },
  {
    id: 'PAR-SEAL-PRESS',
    label: 'Barrier Fluid Pressure (bar)',
    type: 'Parameter',
    status: 'critical',
    properties: {
      'Sensor Tag': 'CDU-P101-SEAL-PT-12',
      'Pressure Spec': 'Differential (P_seal = P_pump + 2 bar)',
      'Normal Range': '12.0 - 15.0 bar',
      'Current Value': '8.4 bar (Starved)',
      'Alarm Threshold': '9.5 bar (Low Press Trip)'
    }
  },
  {
    id: 'PAR-TEMP-BEAR',
    label: 'Bearing Housing Temp (°C)',
    type: 'Parameter',
    status: 'ok',
    properties: {
      'Sensor Tag': 'CDU-P101-TE-04',
      'Coupling Type': 'Thermocouple K-Type',
      'Normal Range': '50 - 75 °C',
      'Current Value': '62.4 °C',
      'Alarm Threshold': '85 °C'
    }
  },
  {
    id: 'PAR-FLOW-RATE',
    label: 'Discharge Flow Rate (m³/h)',
    type: 'Parameter',
    status: 'ok',
    properties: {
      'Sensor Tag': 'CDU-CDU1-FT-105',
      'Instrument': 'Coriolis Mass Flow Meter',
      'Normal Range': '380 - 460 m³/h',
      'Current Value': '412 m³/h',
      'Alarm Threshold': '< 300 m³/h'
    }
  },

  // --- PROCEDURES / WORK PROTOCOLS ---
  {
    id: 'PROC-SEAL-FLUSH',
    label: 'API Plan 53A Sealing System Purge Protocol',
    type: 'Procedure',
    properties: {
      'Document Code': 'PROC-CDU-ROT-05',
      'Cycle Time': 'Pre-startup & Post-overhaul',
      'Est Duration': '45 minutes',
      'Steps Count': '12 sequential checks'
    }
  },
  {
    id: 'PROC-START-COLD',
    label: 'Cold Startup Procedure for CDU Feed Pumps',
    type: 'Procedure',
    properties: {
      'Document Code': 'PROC-CDU-OPS-012',
      'Requirements': 'Suction valve fully open, bypass throttle 15% open',
      'Pre-start Log': 'Must log bearing temperatures & barrier fluid levels'
    }
  },
  {
    id: 'PROC-LUB-CYCLE',
    label: 'Lubricant Quality Check & Replenishment',
    type: 'Procedure',
    properties: {
      'Document Code': 'PROC-MAINT-LUB-01',
      'Frequency': 'Every 180 Operating Hours',
      'Oil Grade': 'Mobil SHC 626 (Synthetic)',
      'Sample Lab': 'On-site ASTM analysis'
    }
  },

  // --- HISTORIC LESSONS LEARNED ---
  {
    id: 'LES-MONSOON',
    label: 'Lesson: Monsoon Startup Seal Failures',
    type: 'Lesson',
    properties: {
      'Lesson Code': 'LES-2024-CDU-09',
      'Origin Date': '2024-07-15',
      'Findings': 'Extreme monsoon humidity causes condensation in thermal pockets on double mechanical seals. Hot product entry causes severe thermal shock & face fracture.',
      'Action Approved': 'Add dry nitrogen purge blanket to seal barrier reservoirs before July. Add moisture-trap desiccants.'
    }
  },
  {
    id: 'LES-CAVIT-SUCT',
    label: 'Lesson: Cavitation Avoidance via Suction Head',
    type: 'Lesson',
    properties: {
      'Lesson Code': 'LES-2023-CDU-02',
      'Origin Date': '2023-11-04',
      'Findings': 'Suction strainer clogging by corrosion scales reduces NPSH available below safety threshold. Pump trips occurred during heavy tank bottom unloading.',
      'Action Approved': 'Install differential pressure transmitter across suction strainers with DCS alarm linkage at 0.35 bar delta.'
    }
  },
  {
    id: 'LES-ALIGN-LASER',
    label: 'Lesson: Post-Overhaul Alignment Protocol',
    type: 'Lesson',
    properties: {
      'Lesson Code': 'LES-2025-GEN-14',
      'Origin Date': '2025-05-18',
      'Findings': 'Traditional dial indicator alignment leaves minor angular displacement undetected. Leads to bearing failure in less than 4000 operating hours.',
      'Action Approved': 'Mandate laser alignment tool usage with secondary validation signature by L3 mechanical engineer.'
    }
  },

  // --- STORY 2 DEEPER NODES (Compressor C-302B & Maintenance Context) ---
  {
    id: 'C-302B',
    label: 'Reciprocating Compressor C-302B',
    type: 'Equipment',
    status: 'critical',
    properties: {
      'Asset Tag': 'C-302B',
      'Name': 'High-Pressure Reciprocating Compressor B',
      'Process': 'Refining Hydrotreater Feed Gas',
      'Criticality': 'Critical',
      'Health Index': '46%'
    }
  },
  {
    id: 'C-302B-VALVE',
    label: 'C-302B Discharge Unloader Valve',
    type: 'Equipment',
    status: 'warn',
    properties: {
      'Asset Tag': 'UV-302B',
      'Material': 'Stellite-Faced Disk',
      'Action': 'Solenoid-Controlled Unloader'
    }
  },
  {
    id: 'DOC-WO-C302',
    label: 'Work Order #4109: Compressor Head Gasket',
    type: 'Document',
    properties: {
      'WO Code': 'HT-WO-2026-4109',
      'Status': 'Scheduled',
      'Target Date': '2026-07-20'
    }
  },
  {
    id: 'EV-2026-05',
    label: 'C-302B Gas Leak Alarm (May 2026)',
    type: 'FailureEvent',
    status: 'critical',
    properties: {
      'Date': '2026-05-30',
      'Symptom': 'Combustible gas sensor CDU-LEL-14 went to 25%',
      'Resolution': 'Replaced dynamic packing seals'
    }
  },
  {
    id: 'MODE-PACK-LEAK',
    label: 'Reciprocating Packing Seal Degradation',
    type: 'FailureMode',
    properties: {
      'Code': 'F-COMP-PACK',
      'Failure Mechanism': 'Frictional wear of PTFE rings against piston shaft',
      'Mitigation': 'Lubricating oil pressure maintenance Interlock'
    }
  },
  {
    id: 'REG-OISD-142',
    label: 'OISD-GDN-142 Reciprocating Compressor Inspection',
    type: 'Regulation',
    properties: {
      'Standard': 'OISD Guidance 142',
      'Scope': 'Inspection of gas compressor cylinders and dynamic packaging'
    }
  },
  {
    id: 'PAR-COMP-TEMP',
    label: 'Compressor Stage-2 Cylinder Temp (°C)',
    type: 'Parameter',
    status: 'warn',
    properties: {
      'Tag': 'CDU-C302-TE-104',
      'Current Value': '114.5 °C',
      'Trip Limit': '125.0 °C'
    }
  },
  {
    id: 'PROC-COMP-OVERHAUL',
    label: 'Overhaul Protocol for Multi-Stage Compressors',
    type: 'Procedure',
    properties: {
      'Document': 'PROC-MAINT-COMP-004',
      'Mandatory Checks': 'Clearance checking, dial readings, piston alignment'
    }
  },
  {
    id: 'LES-COMP-LIQUID',
    label: 'Lesson: Preventing Liquid Slugging in Cylinder',
    type: 'Lesson',
    properties: {
      'Lesson Code': 'LES-2022-COMP-01',
      'Findings': 'Condensation in suction knockout drum allowed liquid droplets to enter Stage-1 cylinders, causing dynamic head cracking.',
      'Action': 'Install auto-drain float valves on knockout drums with high level interlocks.'
    }
  },

  // --- FLOATING ADDITIONAL NODES FOR GRAPH RICHNESS (~60 total) ---
  {
    id: 'V-230-ACTUATOR',
    label: 'Pneumatic Actuator (ACT-230)',
    type: 'Equipment',
    status: 'ok',
    properties: { 'Tag': 'ACT-230', 'Type': 'Double-acting piston', 'Air Supply': '5.5 bar' }
  },
  {
    id: 'DOC-PID-995',
    label: 'PID-995-HYDROTREATER-FEED.pdf',
    type: 'Document',
    properties: { 'Document ID': 'PID-995', 'CAD Title': 'Hydrotreating Plant Schematic' }
  },
  {
    id: 'DOC-WO-1102',
    label: 'Work Order #1102: Buffer Tank Head Check',
    type: 'Document',
    properties: { 'WO Code': 'TANK-WO-1102', 'Status': 'Archived' }
  },
  {
    id: 'EV-2024-09',
    label: 'Tank T-100 High-Level Alarm Event',
    type: 'FailureEvent',
    status: 'info',
    properties: { 'Date': '2024-09-12', 'Resolution': 'Automatic feed bypass diverted crude flow' }
  },
  {
    id: 'MODE-VALVE-SEIZE',
    label: 'Pneumatic Valve Seat Seizure',
    type: 'FailureMode',
    properties: { 'Code': 'F-VALVE-SEIZE', 'Mechanism': 'Particulate deposit sticking seat sleeve' }
  },
  {
    id: 'REG-ASME-SEC8',
    label: 'ASME Sec VIII Pressure Vessel Design',
    type: 'Regulation',
    properties: { 'Standard': 'ASME BPVC Section VIII', 'Scope': 'Design criteria for crude storage buffer' }
  },
  {
    id: 'PAR-TANK-LEVEL',
    label: 'Crude Storage Level (m)',
    type: 'Parameter',
    status: 'ok',
    properties: { 'Tag': 'T100-LI-01', 'Current Value': '12.4 m', 'Max Height': '16.5 m' }
  },
  {
    id: 'PROC-VALVE-STROKE',
    label: 'Partial Stroke Testing Procedure (PST)',
    type: 'Procedure',
    properties: { 'Code': 'PROC-ESD-VALVE-PST', 'Interval': 'Monthly', 'Target': 'Verify seat movement' }
  },
  {
    id: 'LES-VALVE-DRIFT',
    label: 'Lesson: Pneumatic Solenoid Vent Clogging',
    type: 'Lesson',
    properties: { 'Lesson Code': 'LES-2023-VALVE-12', 'Findings': 'Sand/dust blocking vent exhaust ports delayed ESD shutdown.' }
  },
  {
    id: 'P-101B-MOTOR',
    label: 'Standby Pump Induction Motor (M-101B)',
    type: 'Equipment',
    status: 'ok',
    properties: { 'Tag': 'M-101B', 'Power Rating': '315 kW' }
  },
  {
    id: 'DOC-SOP-STANDBY',
    label: 'SOP-CDU-016: Automatic Standby Cut-In',
    type: 'Document',
    properties: { 'SOP ID': 'SOP-CDU-016', 'Scope': 'DCS auto-start matrix settings' }
  },
  {
    id: 'EV-2025-08',
    label: 'Emergency Standby Cut-in Test (August 2025)',
    type: 'FailureEvent',
    status: 'ok',
    properties: { 'Date': '2025-08-11', 'Result': 'Auto-start achieved within 3.2 seconds' }
  },
  {
    id: 'MODE-MOTOR-OVERHEAT',
    label: 'Stator Core Winding Insulation Thermal Failure',
    type: 'FailureMode',
    properties: { 'Code': 'F-MOTOR-STATOR', 'Cause': 'Blocked cooling fan cowling' }
  },
  {
    id: 'REG-IEEE-841',
    label: 'IEEE 841 Severe Duty Motor Standard',
    type: 'Regulation',
    properties: { 'Standard': 'IEEE Std 841', 'Scope': 'Premium efficiency severe duty motors' }
  },
  {
    id: 'PAR-MOTOR-TEMP',
    label: 'Induction Motor Winding Temp (°C)',
    type: 'Parameter',
    status: 'ok',
    properties: { 'Tag': 'CDU-M101-TE-02', 'Current Value': '78.2 °C', 'Alarm Limit': '135 °C' }
  },
  {
    id: 'PROC-MOTOR-MEGGER',
    label: 'Insulation Resistance Testing (Megger)',
    type: 'Procedure',
    properties: { 'Code': 'PROC-ELEC-MEGGER-01', 'Test Voltage': '1000 V DC' }
  },
  {
    id: 'LES-MOTOR-BEARING',
    label: 'Lesson: Insulated Non-Drive End Bearings',
    type: 'Lesson',
    properties: { 'Lesson Code': 'LES-2024-ELEC-05', 'Findings': 'VFD shaft current discharge caused pitting in non-drive bearings.' }
  }
];

export const mockEdges: GraphEdgeData[] = [
  // --- P-101 RELATIONSHIPS ---
  { id: 'e1', source: 'P-101', target: 'P-101-MOTOR', label: 'PART_OF' },
  { id: 'e2', source: 'P-101', target: 'P-101-SEAL', label: 'PART_OF' },
  { id: 'e3', source: 'P-101', target: 'P-101-IMPELLER', label: 'PART_OF' },
  { id: 'e4', source: 'P-101', target: 'P-102', label: 'REFERENCES' }, // Standby reference
  { id: 'e5', source: 'T-100', target: 'P-101', label: 'APPLIES_TO' }, // Buffer feeds pump
  { id: 'e6', source: 'P-101', target: 'V-230', label: 'REFERENCES' },

  // --- DOCUMENT MAPPINGS ---
  { id: 'e7', source: 'DOC-OEM-P101', target: 'P-101', label: 'MENTIONS' },
  { id: 'e8', source: 'DOC-PID-992', target: 'P-101', label: 'MENTIONS' },
  { id: 'e9', source: 'DOC-PID-992', target: 'P-101-SEAL', label: 'MENTIONS' },
  { id: 'e10', source: 'DOC-PID-992', target: 'V-230', label: 'MENTIONS' },
  { id: 'e11', source: 'DOC-WO-3021', target: 'P-101-SEAL', label: 'REFERENCES' },
  { id: 'e12', source: 'DOC-WO-3042', target: 'P-101-MOTOR', label: 'REFERENCES' },
  { id: 'e13', source: 'DOC-WO-3055', target: 'P-101-IMPELLER', label: 'REFERENCES' },
  { id: 'e14', source: 'DOC-SOP-START', target: 'P-101', label: 'MENTIONS' },
  { id: 'e15', source: 'DOC-HAZOP-CDU', target: 'P-101', label: 'MENTIONS' },

  // --- FAILURE EVENTS AND MODES ---
  { id: 'e16', source: 'P-101-SEAL', target: 'EV-2026-06', label: 'FAILED_WITH' },
  { id: 'e17', source: 'EV-2026-06', target: 'MODE-SEAL-FAIL', label: 'HAS_MODE' },
  { id: 'e18', source: 'P-101-MOTOR', target: 'EV-2026-02', label: 'FAILED_WITH' },
  { id: 'e19', source: 'EV-2026-02', target: 'MODE-MISALIGN', label: 'HAS_MODE' },
  { id: 'e20', source: 'P-101-IMPELLER', target: 'EV-2025-11', label: 'FAILED_WITH' },
  { id: 'e21', source: 'EV-2025-11', target: 'MODE-CAVITATION', label: 'HAS_MODE' },
  { id: 'e22', source: 'P-101-MOTOR', target: 'EV-2026-07', label: 'FAILED_WITH' },
  { id: 'e23', source: 'EV-2026-07', target: 'MODE-MISALIGN', label: 'HAS_MODE' },

  // --- REGULATIONS AND CODES ---
  { id: 'e24', source: 'REG-OISD-118-C64', target: 'P-101-SEAL', label: 'GOVERNED_BY' },
  { id: 'e25', source: 'REG-API-682', target: 'P-101-SEAL', label: 'GOVERNED_BY' },
  { id: 'e26', source: 'REG-OSHA-1910', target: 'P-101', label: 'GOVERNED_BY' },
  { id: 'e27', source: 'REG-ISO-10816', target: 'PAR-VIB-VEL', label: 'GOVERNED_BY' },

  // --- PEOPLE AND ASSIGNMENTS ---
  { id: 'e28', source: 'USER-PRIYA', target: 'P-101', label: 'PERFORMED_BY' },
  { id: 'e29', source: 'USER-ALEX', target: 'DOC-WO-3021', label: 'PERFORMED_BY' },
  { id: 'e30', source: 'USER-ALEX', target: 'DOC-WO-3042', label: 'PERFORMED_BY' },
  { id: 'e31', source: 'USER-MANISH', target: 'REG-OISD-118-C64', label: 'PERFORMED_BY' },
  { id: 'e32', source: 'USER-SARAH', target: 'DOC-HAZOP-CDU', label: 'PERFORMED_BY' },

  // --- PARAMETERS AND TELEMETRY ---
  { id: 'e33', source: 'P-101', target: 'PAR-VIB-VEL', label: 'APPLIES_TO' },
  { id: 'e34', source: 'P-101-SEAL', target: 'PAR-SEAL-PRESS', label: 'APPLIES_TO' },
  { id: 'e35', source: 'P-101-MOTOR', target: 'PAR-TEMP-BEAR', label: 'APPLIES_TO' },
  { id: 'e36', source: 'P-101', target: 'PAR-FLOW-RATE', label: 'APPLIES_TO' },

  // --- PROCEDURES AND WORK STEPS ---
  { id: 'e37', source: 'PROC-SEAL-FLUSH', target: 'P-101-SEAL', label: 'APPLIES_TO' },
  { id: 'e38', source: 'PROC-START-COLD', target: 'P-101', label: 'APPLIES_TO' },
  { id: 'e39', source: 'PROC-LUB-CYCLE', target: 'P-101-MOTOR', label: 'APPLIES_TO' },

  // --- LESSONS LEARNED ---
  { id: 'e40', source: 'LES-MONSOON', target: 'P-101-SEAL', label: 'DERIVED_FROM' },
  { id: 'e41', source: 'LES-MONSOON', target: 'EV-2026-06', label: 'DERIVED_FROM' },
  { id: 'e42', source: 'LES-CAVIT-SUCT', target: 'P-101-IMPELLER', label: 'DERIVED_FROM' },
  { id: 'e43', source: 'LES-CAVIT-SUCT', target: 'EV-2025-11', label: 'DERIVED_FROM' },
  { id: 'e44', source: 'LES-ALIGN-LASER', target: 'P-101-MOTOR', label: 'DERIVED_FROM' },
  { id: 'e45', source: 'LES-ALIGN-LASER', target: 'EV-2026-07', label: 'DERIVED_FROM' },

  // --- COMPRESSOR C-302B BRANCH RELATIONSHIPS ---
  { id: 'e46', source: 'C-302B', target: 'C-302B-VALVE', label: 'PART_OF' },
  { id: 'e47', source: 'DOC-WO-C302', target: 'C-302B', label: 'REFERENCES' },
  { id: 'e48', source: 'C-302B', target: 'EV-2026-05', label: 'FAILED_WITH' },
  { id: 'e49', source: 'EV-2026-05', target: 'MODE-PACK-LEAK', label: 'HAS_MODE' },
  { id: 'e50', source: 'REG-OISD-142', target: 'C-302B', label: 'GOVERNED_BY' },
  { id: 'e51', source: 'C-302B', target: 'PAR-COMP-TEMP', label: 'APPLIES_TO' },
  { id: 'e52', source: 'PROC-COMP-OVERHAUL', target: 'C-302B', label: 'APPLIES_TO' },
  { id: 'e53', source: 'LES-COMP-LIQUID', target: 'C-302B', label: 'DERIVED_FROM' },

  // --- FLOATING ADDITIONAL LINKS (Making it fully connected) ---
  { id: 'e54', source: 'V-230', target: 'V-230-ACTUATOR', label: 'PART_OF' },
  { id: 'e55', source: 'DOC-PID-995', target: 'C-302B', label: 'MENTIONS' },
  { id: 'e56', source: 'DOC-WO-1102', target: 'T-100', label: 'REFERENCES' },
  { id: 'e57', source: 'T-100', target: 'EV-2024-09', label: 'FAILED_WITH' },
  { id: 'e58', source: 'V-230-ACTUATOR', target: 'MODE-VALVE-SEIZE', label: 'FAILED_WITH' },
  { id: 'e59', source: 'REG-ASME-SEC8', target: 'T-100', label: 'GOVERNED_BY' },
  { id: 'e60', source: 'T-100', target: 'PAR-TANK-LEVEL', label: 'APPLIES_TO' },
  { id: 'e61', source: 'PROC-VALVE-STROKE', target: 'V-230', label: 'APPLIES_TO' },
  { id: 'e62', source: 'LES-VALVE-DRIFT', target: 'V-230-ACTUATOR', label: 'DERIVED_FROM' },
  { id: 'e63', source: 'P-102', target: 'P-101B-MOTOR', label: 'PART_OF' },
  { id: 'e64', source: 'DOC-SOP-STANDBY', target: 'P-102', label: 'MENTIONS' },
  { id: 'e65', source: 'P-102', target: 'EV-2025-08', label: 'FAILED_WITH' },
  { id: 'e66', source: 'P-101B-MOTOR', target: 'MODE-MOTOR-OVERHEAT', label: 'FAILED_WITH' },
  { id: 'e67', source: 'REG-IEEE-841', target: 'P-101B-MOTOR', label: 'GOVERNED_BY' },
  { id: 'e68', source: 'P-101B-MOTOR', target: 'PAR-MOTOR-TEMP', label: 'APPLIES_TO' },
  { id: 'e69', source: 'PROC-MOTOR-MEGGER', target: 'P-101B-MOTOR', label: 'APPLIES_TO' },
  { id: 'e70', source: 'LES-MOTOR-BEARING', target: 'P-101B-MOTOR', label: 'DERIVED_FROM' }
];
