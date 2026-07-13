import { DocumentFile } from '../../types';

export const MOCK_LOOKUPS: Record<string, string[]> = {
  doc_types: [
    'P&ID Schematic',
    'Equipment Manual',
    'Safety Procedure',
    'Regulatory Audit',
    'Work Order Record',
    'Incident Report',
    'Inspection Report'
  ],
  plants: [
    'Reliance Jamnagar Refinery - Sector A',
    'Reliance Jamnagar Refinery - Sector B',
    'Hazira Petrochemicals Complex - Unit 4',
    'KG-D6 Deepwater Gas Field Terminal'
  ],
  areas: [
    'Crude Unit 1',
    'Hydrocracker Block',
    'Boiler Room Unit',
    'LPG Tank Farm',
    'Venting Station A',
    'Compressor Shed 4'
  ],
  tags: [
    'P-101A',
    'V-230',
    'C-302B',
    'PG-104',
    'K-401',
    'T-102',
    'V-105',
    'P-101B'
  ],
  statuses: [
    'pending',
    'ocr',
    'parsing',
    'chunking',
    'embedding',
    'extracting',
    'graphing',
    'completed',
    'failed'
  ]
};

export const SEED_DOCUMENTS: DocumentFile[] = [
  {
    id: 'doc-1',
    name: 'PID-992-SECTOR-A-REFINERY.DWG.PDF',
    type: 'P&ID Schematic',
    tags: ['P-101A', 'V-230'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Aditya Vardhan',
    date: '2026-07-11',
    version: 'V1.2',
    status: 'completed',
    confidence: 94,
    fileSize: '14.2 MB',
    content: 'Piping & Instrumentation Diagram for Sector A Refinery Crude Block 1. Illustrates main crude feed line entering vacuum pre-heater. Feed pump P-101A discharges into pre-heat train. Isolation butterfly valve V-230 is positioned upstream of pre-heater. Safety bypass line 3-inch high-temp venting valve connects directly to pressure relief manifold.',
    extractedEntities: [
      { key: 'P-101A', value: 'Main Crude Feed Pump', confidence: 98, category: 'Equipment Tag' },
      { key: 'V-230', value: 'Manifold Isolation Butterfly Valve', confidence: 92, category: 'Equipment Tag' },
      { key: 'OISD-STD-118', value: 'Weekly Firewater testing standard compliance', confidence: 88, category: 'Standard Reference' },
      { key: 'Hydraulic Cavitation', value: 'Vibration and vapor pocketing risk on pump start', confidence: 91, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-2',
    name: 'OEM-VALVE-V230-BUTTERFLY-MANUAL.PDF',
    type: 'Equipment Manual',
    tags: ['V-230'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Priya Sharma',
    date: '2026-07-09',
    version: 'V3.0',
    status: 'completed',
    confidence: 98,
    fileSize: '8.4 MB',
    content: 'Operations and Maintenance manual for the model V230 triple-offset high-performance butterfly valve. Maximum operating pressure: 40 bar. Maximum operating temperature: 450C. Standard torque requirements for pneumatic actuator configuration is 180 N-m. Seat leak rate complies with ANSI FCI 70-2 Class VI.',
    extractedEntities: [
      { key: 'V-230', value: 'Triple-offset butterfly valve', confidence: 99, category: 'Equipment Tag' },
      { key: 'ANSI FCI 70-2', value: 'Seat leakage testing guidelines', confidence: 95, category: 'Standard Reference' },
      { key: 'Seat Leakage', value: 'Mechanical seat degradation leading to process bypass', confidence: 90, category: 'Failure Mode' },
      { key: 'Torque limit 180 N-m', value: 'Prevent actuator stem shearing', confidence: 92, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-3',
    name: 'SOP-REF-V2-STANDARD-VALVE-MAINTENANCE.DOCX',
    type: 'Safety Procedure',
    tags: ['V-230'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Arun Kumar',
    date: '2026-07-07',
    version: 'V2.1',
    status: 'completed',
    confidence: 96,
    fileSize: '1.8 MB',
    content: 'Standard Operating Procedure for isolation, cleaning, and seal replacement on butterfly valves in crude feed pipelines. Requires active Hot Work Permit #PER-883. Ensure double LOTO (Lock-Out, Tag-Out) is applied at manifold breakers. Spray calibration inlet with certified contact cleaner only; wire brush scraping is strictly forbidden.',
    extractedEntities: [
      { key: 'V-230', value: 'Upstream Isolation Valve', confidence: 97, category: 'Equipment Tag' },
      { key: 'Hot Work Permit #PER-883', value: 'LOTO safety checklist authorization', confidence: 94, category: 'Safety Directive' },
      { key: 'Double LOTO', value: 'Electrical breaker lock out procedure', confidence: 96, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-4',
    name: 'OISD-STD-118-COMPLIANCE-GAP-REPORT.PDF',
    type: 'Regulatory Audit',
    tags: ['P-101A'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Meena Iyer',
    date: '2026-07-05',
    version: 'V1.0',
    status: 'completed',
    confidence: 91,
    fileSize: '3.1 MB',
    content: 'Compliance verification report under OISD-STD-118 guidelines. Main gap detected: Firewater booster pumps weekly mechanical run tests are overdue by 4 shifts on sector A refinery crude block. Standard operating procedures lack mapped links to explicit logging database.',
    extractedEntities: [
      { key: 'P-101A', value: 'Firewater Booster Pump Unit', confidence: 93, category: 'Equipment Tag' },
      { key: 'OISD-STD-118 Section 6.4', value: 'Weekly pressure gauges and booster testing standards', confidence: 95, category: 'Standard Reference' },
      { key: 'Log Overdue', value: 'Failure to perform mechanical check within statutory 7-day window', confidence: 89, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-5',
    name: 'WO-2041-PRESSURE-GAUGE-CALIBRATION.PDF',
    type: 'Work Order Record',
    tags: ['PG-104', 'P-101A'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Compressor Shed 4',
    uploader: 'Arun Kumar',
    date: '2026-07-04',
    version: 'V1.0',
    status: 'completed',
    confidence: 95,
    fileSize: '0.9 MB',
    content: 'Calibration work order records for pressure transmitter gauge PG-104 mounted on feed pump line P-101A. Gauge showed deviation of +0.35 bar. Recalibrated against master pneumatic hand-pump calibrator. Post-calibration drift was noted as less than 0.01% span.',
    extractedEntities: [
      { key: 'PG-104', value: 'Manifold Pressure Transmitter', confidence: 98, category: 'Equipment Tag' },
      { key: 'P-101A', value: 'Crude Feed Pump Station', confidence: 96, category: 'Equipment Tag' },
      { key: 'Calibration Drift', value: 'Sensor deviation causing pre-heater pre-mature shutdown', confidence: 92, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-6',
    name: 'INC-991-IMPELLER-CAVITATION-REPORT.PDF',
    type: 'Incident Report',
    tags: ['P-101A'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Aditya Vardhan',
    date: '2026-07-02',
    version: 'V1.0',
    status: 'completed',
    confidence: 93,
    fileSize: '4.5 MB',
    content: 'Post-failure forensic analysis report. Crude feed pump P-101A experienced sudden discharge pressure collapse and extreme housing vibration reaching 8.4 mm/s RMS. Impeller disassembly revealed intense pitting and material loss due to micro-bubble cavitation collapse.',
    extractedEntities: [
      { key: 'P-101A', value: 'Crude Feed Pump Station', confidence: 98, category: 'Equipment Tag' },
      { key: 'Hydraulic Cavitation', value: 'Suction pressure dropping below vapor limit', confidence: 96, category: 'Failure Mode' },
      { key: 'Impeller Pitting', value: 'Erosion of bronze blade vanes', confidence: 94, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-7',
    name: 'SOP-302B-SEAL-GAS-SYSTEM-OPERATIONS.PDF',
    type: 'Safety Procedure',
    tags: ['C-302B'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Compressor Shed 4',
    uploader: 'Priya Sharma',
    date: '2026-06-29',
    version: 'V2.2',
    status: 'completed',
    confidence: 92,
    fileSize: '2.5 MB',
    content: 'Operating standard for dry gas seal (DGS) supply module on reciprocating compressor C-302B. Requires maintaining seal gas differential pressure at a minimum of 1.4 bar above suction pressure. Cleanliness of nitrogen gas buffer must exceed 99.9%.',
    extractedEntities: [
      { key: 'C-302B', value: 'High-Pressure Reciprocating Compressor', confidence: 96, category: 'Equipment Tag' },
      { key: 'Dry Gas Seal Module', confidence: 94, value: 'Prevent hydrocarbon leakage to atmosphere', category: 'Safety Directive' },
      { key: 'Gas Seal Blowout', value: 'Seal face friction welding failure due to particulate load', confidence: 89, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-8',
    name: 'OEM-COMPRESSOR-C302B-MAINTENANCE-GUIDE.PDF',
    type: 'Equipment Manual',
    tags: ['C-302B'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Compressor Shed 4',
    uploader: 'Rajesh Nair',
    date: '2026-06-25',
    version: 'V1.5',
    status: 'completed',
    confidence: 97,
    fileSize: '19.4 MB',
    content: 'Original manufacturer maintenance specifications for C-302B compressor series. Detailing crankshaft clearance tolerances (0.08mm to 0.12mm) and cylinder lubrication viscosity requirements. Cross-head pin assembly requires hydraulic torque clamping to 240 N-m.',
    extractedEntities: [
      { key: 'C-302B', value: 'High-Pressure Compressor', confidence: 99, category: 'Equipment Tag' },
      { key: 'Clearance 0.12mm', value: 'Crankcase journal pin operating clearance', confidence: 95, category: 'Safety Directive' },
      { key: 'Pin Shear', value: 'Dynamic high-torque stress pin shear fatigue', confidence: 91, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-9',
    name: 'PID-1044-COMPRESSOR-STATION-4.DWG.PDF',
    type: 'P&ID Schematic',
    tags: ['C-302B', 'PG-104'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Compressor Shed 4',
    uploader: 'Aditya Vardhan',
    date: '2026-06-20',
    version: 'V1.0',
    status: 'completed',
    confidence: 95,
    fileSize: '15.8 MB',
    content: 'Piping schematic and logic diagrams for Compressor Station 4. Shows process suction gas header entering knock-out drum V-105. Compressor C-302B discharges to high pressure storage sphere. Control loop 44 regulates recirculation cooling line to avoid compressor surging.',
    extractedEntities: [
      { key: 'C-302B', value: 'Compressor', confidence: 97, category: 'Equipment Tag' },
      { key: 'PG-104', value: 'Suction pressure monitoring element', confidence: 94, category: 'Equipment Tag' },
      { key: 'V-105', value: 'Suction Knock-Out Drum', confidence: 95, category: 'Equipment Tag' },
      { key: 'Surge Stall', value: 'Discharge backflow causing compressor blade flutter and shaft stress', confidence: 93, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-10',
    name: 'OISD-STD-118-FIREWATER-WEEKLY-TESTING-LOG.PDF',
    type: 'Inspection Report',
    tags: ['P-101A'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Venting Station A',
    uploader: 'Meena Iyer',
    date: '2026-06-18',
    version: 'V1.1',
    status: 'failed',
    confidence: 82,
    fileSize: '1.2 MB',
    content: 'Weekly firewater system inspections record. Firewater diesel pump P-101A was initiated for test sequence. Start failed due to battery charge depletion. Fuel level is below 40%. Operator skipped scheduled weekly testing. CRITICAL non-compliance flag raised.',
    extractedEntities: [
      { key: 'P-101A', value: 'Emergency Firewater Diesel Pump', confidence: 92, category: 'Equipment Tag' },
      { key: 'OISD-STD-118 Section 6.4', value: 'Weekly start-test regulatory mandate', confidence: 95, category: 'Standard Reference' },
      { key: 'Battery Depletion', value: 'Alternator trickle charger failure preventing automated backup startup', confidence: 84, category: 'Failure Mode' },
      { key: 'Refill fuel line immediately', value: 'Mandatory standard operation', confidence: 81, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-11',
    name: 'LPG-STORAGE-EXPANSION-SAFETY-DISCLOSURE.PDF',
    type: 'Regulatory Audit',
    tags: ['T-102'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'LPG Tank Farm',
    uploader: 'Meena Iyer',
    date: '2026-06-15',
    version: 'V2.0',
    status: 'completed',
    confidence: 89,
    fileSize: '5.2 MB',
    content: 'Regulatory submittal documentation for expanding storage farm Capacity. Mounded bullets T-102. Conforms to PESO (Petroleum & Explosives Safety Organization) guidelines. Spacing between vessel walls complies with statutory 15-meter buffer limit.',
    extractedEntities: [
      { key: 'T-102', value: 'Mounded LPG Bullet Tank', confidence: 94, category: 'Equipment Tag' },
      { key: 'PESO Rules 2002', value: 'Statutory explosive storage standards', confidence: 91, category: 'Standard Reference' },
      { key: 'Gas Release Vapor', value: 'Atmospheric escape of liquefied propane gas forming cloud flash', confidence: 88, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-12',
    name: 'WO-1988-VALVE-REPACKING-SECTOR-B.PDF',
    type: 'Work Order Record',
    tags: ['V-230'],
    plant: 'Reliance Jamnagar Refinery - Sector B',
    area: 'Hydrocracker Block',
    uploader: 'Priya Sharma',
    date: '2026-06-12',
    version: 'V1.0',
    status: 'completed',
    confidence: 94,
    fileSize: '1.1 MB',
    content: 'Close-out report for valve repacking on upstream hydrogen isolation butterfly valve V-230. PTFE gland packing was replaced due to detection of micro-leak. Pressurized test completed at 32 bar with zero localized bubble leakage.',
    extractedEntities: [
      { key: 'V-230', value: 'PTFE Butterfly Valve', confidence: 97, category: 'Equipment Tag' },
      { key: 'Fugitive Emissions', value: 'Stem seal packing extrusion leaking hydrogen to deck', confidence: 92, category: 'Failure Mode' },
      { key: 'PTFE Gland Replacement', value: 'Maintenance repack task', confidence: 95, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-13',
    name: 'SOP-HYDROCRACKER-CATALYST-LOADING.DOCX',
    type: 'Safety Procedure',
    tags: ['K-401'],
    plant: 'Reliance Jamnagar Refinery - Sector B',
    area: 'Hydrocracker Block',
    uploader: 'Rajesh Nair',
    date: '2026-06-10',
    version: 'V1.0',
    status: 'completed',
    confidence: 96,
    fileSize: '2.9 MB',
    content: 'Operational protocol for catalyst loading inside hydrocracker reactor vessel K-401. Requires complete nitrogen purge of the vessel interior until oxygen levels fall below 0.1%. Workers must wear specialized positive-pressure air hoods.',
    extractedEntities: [
      { key: 'K-401', value: 'Hydrocracker Reactor Vessel', confidence: 98, category: 'Equipment Tag' },
      { key: 'Oxygen limit 0.1%', value: 'Ensure inert atmosphere before loading self-heating catalysts', confidence: 97, category: 'Safety Directive' },
      { key: 'Pyrophoric Ignition', value: 'Active catalyst exposing to atmospheric oxygen causing fire', confidence: 93, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-14',
    name: 'OEM-REACTOR-R401-OPERATORS-MANUAL.PDF',
    type: 'Equipment Manual',
    tags: ['K-401'],
    plant: 'Reliance Jamnagar Refinery - Sector B',
    area: 'Hydrocracker Block',
    uploader: 'Rajesh Nair',
    date: '2026-06-05',
    version: 'V4.2',
    status: 'completed',
    confidence: 95,
    fileSize: '22.4 MB',
    content: 'Operator manual and technical data for Hydrocracker R-401 (Vessel registered tag K-401). Design pressure rating: 160 bar. Design temperature rating: 480C. Vessel wall constructed of 2.25Cr-1Mo-V steel clad with weld overlay.',
    extractedEntities: [
      { key: 'K-401', value: 'Hydrocracker Reactor Unit', confidence: 97, category: 'Equipment Tag' },
      { key: 'Thermal Crack Fatigue', value: 'High stress thermal cycling leading to welding clad micro-cracking', confidence: 91, category: 'Failure Mode' },
      { key: '2.25Cr-1Mo-V alloy', value: 'Hydrogen embrittlement resistant steel specs', confidence: 96, category: 'Standard Reference' }
    ]
  },
  {
    id: 'doc-15',
    name: 'INC-882-CATALYST-OVERHEAT-INVESTIGATION.PDF',
    type: 'Incident Report',
    tags: ['K-401'],
    plant: 'Reliance Jamnagar Refinery - Sector B',
    area: 'Hydrocracker Block',
    uploader: 'Aditya Vardhan',
    date: '2026-06-02',
    version: 'V1.0',
    status: 'completed',
    confidence: 90,
    fileSize: '3.8 MB',
    content: 'Detailed investigation of exothermic run-away event in bed 3 of hydrocracker K-401. Feed flow rate drops caused local temperature spike to 465C. Emergency quench hydrogen gas injection was initiated, safely dampening runaway.',
    extractedEntities: [
      { key: 'K-401', value: 'Hydrocracker Bed 3 Vessel', confidence: 95, category: 'Equipment Tag' },
      { key: 'Exothermic Runaway', value: 'Hydrogen and crude reaction runaway spiking temperatures', confidence: 94, category: 'Failure Mode' },
      { key: 'Quench Hydrogen Injection', value: 'Automated rapid emergency cooling system response', confidence: 92, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-16',
    name: 'PID-201-HYDROCRACKER-VALVE-MANIFOLD.DWG.PDF',
    type: 'P&ID Schematic',
    tags: ['V-230', 'K-401'],
    plant: 'Reliance Jamnagar Refinery - Sector B',
    area: 'Hydrocracker Block',
    uploader: 'Aditya Vardhan',
    date: '2026-05-28',
    version: 'V1.1',
    status: 'completed',
    confidence: 93,
    fileSize: '12.9 MB',
    content: 'Piping schematics for hydrocracker manifold. Valve V-230 regulates high pressure feed input line directly discharging into K-401. Safety isolation systems include high speed shutoff valve configured on high pressure interlock.',
    extractedEntities: [
      { key: 'V-230', value: 'Feed isolation valve', confidence: 96, category: 'Equipment Tag' },
      { key: 'K-401', value: 'Hydrocracker Reactor', confidence: 98, category: 'Equipment Tag' },
      { key: 'Hydrogen Leakage', value: 'High pressure flange packing failure venting explosive hydrogen gas', confidence: 91, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-17',
    name: 'SOP-BOILER-FEEDWATER-TREATMENT.DOCX',
    type: 'Safety Procedure',
    tags: ['PG-104'],
    plant: 'Hazira Petrochemicals Complex - Unit 4',
    area: 'Boiler Room Unit',
    uploader: 'Arun Kumar',
    date: '2026-05-25',
    version: 'V1.3',
    status: 'completed',
    confidence: 97,
    fileSize: '2.1 MB',
    content: 'Water treatment standards for boiler feed lines. Detailing oxygen scavenger dosing and pH regulation levels (8.8 to 9.2) to prevent boiler tube corrosion. Manual pressure gauges must be verified daily by shift technician.',
    extractedEntities: [
      { key: 'PG-104', value: 'Boiler Feed Pressure Gauge', confidence: 96, category: 'Equipment Tag' },
      { key: 'Boiler Tube Scaling', value: 'Calcium and magnesium mineral deposit reducing thermodynamic efficiency', confidence: 91, category: 'Failure Mode' },
      { key: 'Scavenger Dosing', value: 'Inject hydrazine compounds to reduce localized oxygen pitting', confidence: 94, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-18',
    name: 'OEM-TURBINE-T102-GENERATOR-SPECS.PDF',
    type: 'Equipment Manual',
    tags: ['T-102'],
    plant: 'Hazira Petrochemicals Complex - Unit 4',
    area: 'Boiler Room Unit',
    uploader: 'Priya Sharma',
    date: '2026-05-20',
    version: 'V2.0',
    status: 'completed',
    confidence: 98,
    fileSize: '16.7 MB',
    content: 'Turbine model T102 technical handbook. Speed limits: 3000 RPM. Generator output: 45 MW. Includes high-pressure steam stator blades disassembly steps, seal ring sizing chart, and bearing clearance limits (0.05mm).',
    extractedEntities: [
      { key: 'T-102', value: 'Steam Turbine Generator', confidence: 99, category: 'Equipment Tag' },
      { key: 'Overspeed Trip Fail', value: 'Governor control failure causing turbine centrifugal disintegration', confidence: 95, category: 'Failure Mode' },
      { key: 'Clearance 0.05mm', value: 'Bearing journal oil film clearance target', confidence: 93, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-19',
    name: 'PID-502-UTILITIES-STEAM-HEADER.DWG.PDF',
    type: 'P&ID Schematic',
    tags: ['T-102'],
    plant: 'Hazira Petrochemicals Complex - Unit 4',
    area: 'Boiler Room Unit',
    uploader: 'Aditya Vardhan',
    date: '2026-05-18',
    version: 'V1.0',
    status: 'completed',
    confidence: 94,
    fileSize: '11.4 MB',
    content: 'Steam distribution piping schematic. Steam outlet line from turbine T-102 leads directly to low pressure steam headers. Main pressure controller steam relief valve discharging to boiler flash tank drum.',
    extractedEntities: [
      { key: 'T-102', value: 'Steam Turbine Generator', confidence: 97, category: 'Equipment Tag' },
      { key: 'Steam Piping Rupture', value: 'High temperature steam thermal stress fatigue crack blowout', confidence: 92, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-20',
    name: 'OISD-STD-189-SAFETY-AUDIT-UTILITIES.PDF',
    type: 'Regulatory Audit',
    tags: ['T-102'],
    plant: 'Hazira Petrochemicals Complex - Unit 4',
    area: 'Boiler Room Unit',
    uploader: 'Meena Iyer',
    date: '2026-05-12',
    version: 'V1.0',
    status: 'completed',
    confidence: 92,
    fileSize: '4.1 MB',
    content: 'Safety review and gap analysis according to OISD-STD-189 for industrial utility blocks. Steam turbine emergency trip lever must undergo monthly actuation tests. Records for T-102 are compliant and verified.',
    extractedEntities: [
      { key: 'T-102', value: 'Steam Turbine unit', confidence: 95, category: 'Equipment Tag' },
      { key: 'OISD-STD-189 Clause 4.2', value: 'Emergency trip lever actuation testing frequency', confidence: 96, category: 'Standard Reference' },
      { key: 'Governor Lock', value: 'Trip solenoid mechanical sticking preventing steam valve rapid shutdown', confidence: 90, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-21',
    name: 'WO-2055-TURBINE-BLADE-INSPECTION-LOG.PDF',
    type: 'Work Order Record',
    tags: ['T-102'],
    plant: 'Hazira Petrochemicals Complex - Unit 4',
    area: 'Boiler Room Unit',
    uploader: 'Arun Kumar',
    date: '2026-05-08',
    version: 'V1.0',
    status: 'completed',
    confidence: 95,
    fileSize: '1.4 MB',
    content: 'Work order logs for turbine blade non-destructive testing (NDT). Stator blades on turbine T-102 inspected using liquid penetrant. No microscopic stress cracks or blade root deformation detected.',
    extractedEntities: [
      { key: 'T-102', value: 'Steam Turbine Generator Rotor', confidence: 98, category: 'Equipment Tag' },
      { key: 'Blade Micro-Cracking', value: 'Vibrational fatigue causing blade root cracking and rupture', confidence: 93, category: 'Failure Mode' },
      { key: 'Liquid Penetrant Check', value: 'Mandatory standard rotor NDT procedure', confidence: 96, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-22',
    name: 'INC-773-HIGH-PRESSURE-STEAM-LEAK.PDF',
    type: 'Incident Report',
    tags: ['T-102'],
    plant: 'Hazira Petrochemicals Complex - Unit 4',
    area: 'Boiler Room Unit',
    uploader: 'Aditya Vardhan',
    date: '2026-05-02',
    version: 'V1.0',
    status: 'completed',
    confidence: 89,
    fileSize: '3.4 MB',
    content: 'Incident report for low pressure steam flange gasket failure upstream of T-102. Steam venting forced partial room evacuation. Gasket replaced with upgraded spiral wound metallic style.',
    extractedEntities: [
      { key: 'T-102', value: 'Steam turbine feed manifold', confidence: 92, category: 'Equipment Tag' },
      { key: 'Gasket Blowout', value: 'Thermal degradation of non-metallic flange seals', confidence: 95, category: 'Failure Mode' },
      { key: 'Spiral-Wound Gaskets', value: 'Incorporate metallic core gaskets in steam lines', confidence: 93, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-23',
    name: 'SOP-TANK-FARM-VAPOR-RECOVERY-SYSTEMS.DOCX',
    type: 'Safety Procedure',
    tags: ['T-102'],
    plant: 'KG-D6 Deepwater Gas Field Terminal',
    area: 'LPG Tank Farm',
    uploader: 'Arun Kumar',
    date: '2026-04-28',
    version: 'V1.1',
    status: 'completed',
    confidence: 95,
    fileSize: '2.4 MB',
    content: 'Operating guidelines for the vapor recovery unit (VRU) on LPG spheres T-102. Requires maintaining tank vapor space pressure at 0.15 bar to avoid atmospheric venting. Nitrogen sweep activation is automatic on high oxygen warnings.',
    extractedEntities: [
      { key: 'T-102', value: 'LPG Storage Tank Farm', confidence: 97, category: 'Equipment Tag' },
      { key: 'VRU Sweep Pressure', value: 'Maintain positive pressure of nitrogen to seal tank venting', confidence: 94, category: 'Safety Directive' },
      { key: 'Vapor Venting Explosion', value: 'Vapor venting forming ground-level fuel aerosol clouds', confidence: 91, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-24',
    name: 'PID-883-LPG-TANK-STORAGE-MATRIX.DWG.PDF',
    type: 'P&ID Schematic',
    tags: ['T-102'],
    plant: 'KG-D6 Deepwater Gas Field Terminal',
    area: 'LPG Tank Farm',
    uploader: 'Aditya Vardhan',
    date: '2026-04-24',
    version: 'V1.0',
    status: 'completed',
    confidence: 96,
    fileSize: '14.8 MB',
    content: 'P&ID for LPG sphere T-102 and vapor manifold. Showing emergency shutoff valves (ESDV) on liquid inlet lines. Vacuum breaker valves are installed at the crown of T-102 to avert vessel implosions.',
    extractedEntities: [
      { key: 'T-102', value: 'LPG Sphere Vessel', confidence: 98, category: 'Equipment Tag' },
      { key: 'Vacuum Implosion', value: 'Rapid liquid discharge causing negative tank pressure and walls collapse', confidence: 94, category: 'Failure Mode' },
      { key: 'Crown Vacuum Breaker', value: 'Emergency air intake breaker valve safety interlock', confidence: 95, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-25',
    name: 'OISD-STD-150-LPG-MOUNDED-BULLET-STANDARDS.PDF',
    type: 'Regulatory Audit',
    tags: ['T-102'],
    plant: 'KG-D6 Deepwater Gas Field Terminal',
    area: 'LPG Tank Farm',
    uploader: 'Meena Iyer',
    date: '2026-04-20',
    version: 'V1.0',
    status: 'completed',
    confidence: 91,
    fileSize: '6.1 MB',
    content: 'Statutory compliance validation report for deepwater terminal storage. Tank bullets T-102 conform to OISD-STD-150 guidelines. Fire protection water spray rings provide 10.2 liters/min/sq-m coverage area.',
    extractedEntities: [
      { key: 'T-102', value: 'Mounded Bullet LPG Tanks', confidence: 95, category: 'Equipment Tag' },
      { key: 'OISD-STD-150 Clause 5.3', value: 'Firewater ring spray density standards', confidence: 97, category: 'Standard Reference' },
      { key: 'BLEVE Thermal Rupture', value: 'Boiling Liquid Expanding Vapor Explosion due to thermal flame impingement', confidence: 92, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-26',
    name: 'INC-661-VAPOR-SENSOR-DRIFT-ALARM.PDF',
    type: 'Incident Report',
    tags: ['T-102'],
    plant: 'KG-D6 Deepwater Gas Field Terminal',
    area: 'LPG Tank Farm',
    uploader: 'Aditya Vardhan',
    date: '2026-04-15',
    version: 'V1.0',
    status: 'completed',
    confidence: 93,
    fileSize: '3.1 MB',
    content: 'Investigation into false high LPG hydrocarbon vapor detection alarms at bullet T-102. Sensor calibration was found to have drifted due to moisture pooling. Re-positioned sensor housings with weather shield protective covers.',
    extractedEntities: [
      { key: 'T-102', value: 'LPG Storage Yard', confidence: 96, category: 'Equipment Tag' },
      { key: 'Sensor Drift False Trip', value: 'Moisture corrosion leading to false emergency shutdown activation', confidence: 92, category: 'Failure Mode' },
      { key: 'Sensor Shield Install', value: 'Install rain protection shields', confidence: 94, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-27',
    name: 'WO-2101-TANK-LEVEL-TRANSMITTER-CALIBRATION.PDF',
    type: 'Work Order Record',
    tags: ['T-102'],
    plant: 'KG-D6 Deepwater Gas Field Terminal',
    area: 'LPG Tank Farm',
    uploader: 'Arun Kumar',
    date: '2026-04-10',
    version: 'V1.0',
    status: 'completed',
    confidence: 94,
    fileSize: '1.2 MB',
    content: 'Work order logs for the level transmitter LT-102 on LPG sphere T-102. Calibrated radar sensor against mechanical dip tape level. Deviation of 8mm corrected. Re-anchored radar horn assembly to reduce echo vibrations.',
    extractedEntities: [
      { key: 'T-102', value: 'LPG Sphere Tank', confidence: 97, category: 'Equipment Tag' },
      { key: 'Radar Echo Signal Loss', value: 'Fluid turbulence causing signal loss and false low-level trip', confidence: 91, category: 'Failure Mode' },
      { key: 'LT-102 calibration', value: 'Routine quarterly radar calibration', confidence: 95, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-28',
    name: 'OEM-VALVE-STATION-ACTUATOR-DATASHEETS.PDF',
    type: 'Equipment Manual',
    tags: ['V-230'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Venting Station A',
    uploader: 'Priya Sharma',
    date: '2026-04-05',
    version: 'V1.0',
    status: 'completed',
    confidence: 97,
    fileSize: '11.1 MB',
    content: 'Manufacturer datasheets for heavy-duty pneumatic actuators fitted on bypass butterfly valves V-230. Operating air supply: 5.5 bar. Air filter regulator must be drained weekly to prevent solenoid water fouling.',
    extractedEntities: [
      { key: 'V-230', value: 'Manifold Isolation Valve Station', confidence: 98, category: 'Equipment Tag' },
      { key: 'Solenoid Pneumatic Jam', value: 'Water condensation freezing in pneumatic exhaust port', confidence: 93, category: 'Failure Mode' },
      { key: 'Weekly regulator drain', value: 'Operator maintenance routine checklist', confidence: 95, category: 'Safety Directive' }
    ]
  },
  {
    id: 'doc-29',
    name: 'SOP-EMERGENCY-SHUTDOWN-ESD-REFINERY.DOCX',
    type: 'Safety Procedure',
    tags: ['P-101A', 'V-230'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Arun Kumar',
    date: '2026-03-28',
    version: 'V3.2',
    status: 'completed',
    confidence: 99,
    fileSize: '4.8 MB',
    content: 'Refinery main Emergency Shutdown (ESD) SOP. Manual trip button located on main control console overrides all local PLC loops. Dispatches rapid spring-loaded closures to valve V-230 and trips power to crude feed pump P-101A.',
    extractedEntities: [
      { key: 'V-230', value: 'Crude line ESDV isolation valve', confidence: 99, category: 'Equipment Tag' },
      { key: 'P-101A', value: 'Crude pump unit', confidence: 98, category: 'Equipment Tag' },
      { key: 'Rapid closure fail', value: 'Actuator mechanical spring relaxation preventing complete line closure', confidence: 94, category: 'Failure Mode' },
      { key: 'Annual ESD verification', value: 'Regulatory emergency shutdown test loop', confidence: 96, category: 'Standard Reference' }
    ]
  },
  {
    id: 'doc-30',
    name: 'PID-101-CRUDE-DESALTER-MANIFOLD.DWG.PDF',
    type: 'P&ID Schematic',
    tags: ['P-101A'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Aditya Vardhan',
    date: '2026-03-24',
    version: 'V1.0',
    status: 'completed',
    confidence: 94,
    fileSize: '13.5 MB',
    content: 'Piping schematic and water draw manifolds for crude desalter block. Feed pump P-101A pumps pre-heated crude directly into desalter vessel. Water wash piping manifold controls grid salt wash dispersion loops.',
    extractedEntities: [
      { key: 'P-101A', value: 'Crude pre-heat booster pump', confidence: 96, category: 'Equipment Tag' },
      { key: 'Desalter Grid Arc Short', value: 'Water wash pooling causing electrode arc short circuit and vessel trip', confidence: 92, category: 'Failure Mode' }
    ]
  },
  {
    id: 'doc-31',
    name: 'OISD-STD-118-WEEKLY-GAUGE-INSPECTION-JULY.PDF',
    type: 'Inspection Report',
    tags: ['PG-104'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Compressor Shed 4',
    uploader: 'Meena Iyer',
    date: '2026-03-20',
    version: 'V1.0',
    status: 'completed',
    confidence: 91,
    fileSize: '1.5 MB',
    content: 'Statutory weekly mechanical check report under OISD guidelines. Checked pressure indicator transmitter PG-104. Visual inspection shows glass cover is secure and zero-calibration seal remains unbroken.',
    extractedEntities: [
      { key: 'PG-104', value: 'Discharge pressure gauge', confidence: 95, category: 'Equipment Tag' },
      { key: 'OISD-STD-118 Section 6.4', value: 'Weekly field mechanical audit and log checklist', confidence: 97, category: 'Standard Reference' }
    ]
  },
  {
    id: 'doc-32',
    name: 'WO-1882-CRUDE-FEED-PUMP-MOTOR-REWIND.PDF',
    type: 'Work Order Record',
    tags: ['P-101A'],
    plant: 'Reliance Jamnagar Refinery - Sector A',
    area: 'Crude Unit 1',
    uploader: 'Arun Kumar',
    date: '2026-03-15',
    version: 'V1.0',
    status: 'completed',
    confidence: 95,
    fileSize: '6.4 MB',
    content: 'Completed work order files for motor stator winding rewind on pump P-101A. Class H insulating materials applied. Post-rewind winding resistance checks completed at 0.44 ohms per phase. Full load mechanical run test stable.',
    extractedEntities: [
      { key: 'P-101A', value: 'Crude feed pump induction motor', confidence: 98, category: 'Equipment Tag' },
      { key: 'Phase Overheating Short', value: 'Stator winding insulation breakdown leading to localized phase-ground arc', confidence: 94, category: 'Failure Mode' },
      { key: 'Winding resistance test', value: 'Standard motor inspection after rebuild', confidence: 96, category: 'Safety Directive' }
    ]
  }
];
