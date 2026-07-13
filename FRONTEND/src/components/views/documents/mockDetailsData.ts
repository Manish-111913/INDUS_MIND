export interface OverlayEntity {
  id: string;
  page: number;
  bbox: { x: number; y: number; w: number; h: number }; // in % coords
  entity_type: 'equipment_tag' | 'parameter' | 'regulation_ref' | 'person' | 'date' | 'failure_mode';
  value: string;
  confidence: number;
  normalized: string;
  status: 'unverified' | 'confirmed' | 'corrected' | 'rejected';
}

export interface IngestionTimelineEvent {
  stage: string;
  timestamp: string;
  status: 'completed' | 'in_progress' | 'pending';
  operator: string;
}

export interface LinkedEquipment {
  tag: string;
  name: string;
  type: string;
  manufacturer: string;
  model: string;
  health: number;
  status: 'operational' | 'maintenance' | 'offline';
}

export interface DocVersion {
  version: string;
  date: string;
  author: string;
  notes: string;
  isReingested: boolean;
}

export interface RelatedDoc {
  id: string;
  name: string;
  type: string;
  relationship: 'REFERENCES' | 'SAME_EQUIPMENT' | 'REGULATORY_AUDIT' | 'FAILURE_HISTORY';
  confidence: number;
}

export interface DocComment {
  id: string;
  author: string;
  role: string;
  avatarText: string;
  timestamp: string;
  text: string;
}

export interface DocumentDetailMockData {
  id: string;
  name: string;
  timeline: IngestionTimelineEvent[];
  entities: OverlayEntity[];
  equipment: LinkedEquipment[];
  versions: DocVersion[];
  relatedDocs: RelatedDoc[];
  comments: DocComment[];
}

export const MOCK_DOCUMENT_DETAILS: Record<string, DocumentDetailMockData> = {
  'doc-1': {
    id: 'doc-1',
    name: 'PID-992-SECTOR-A-REFINERY.DWG.PDF',
    timeline: [
      { stage: 'OCR Text Scrape & Grid Scan', timestamp: '2026-07-11 14:21', status: 'completed', operator: 'System Pipeline' },
      { stage: 'Text Chunking & Embedding Mapping', timestamp: '2026-07-11 14:22', status: 'completed', operator: 'System Pipeline' },
      { stage: 'Entity Extraction (bge-large-en)', timestamp: '2026-07-11 14:23', status: 'completed', operator: 'AI Ingestion Engine' },
      { stage: 'Knowledge Graph Traversal & Sync', timestamp: '2026-07-11 14:24', status: 'completed', operator: 'Neo4j Core' },
      { stage: 'Operator Verification Sign-off', timestamp: '2026-07-11 15:30', status: 'completed', operator: 'Aditya Vardhan' }
    ],
    entities: [
      { id: 'e1-1', page: 1, bbox: { x: 15, y: 35, w: 12, h: 6 }, entity_type: 'equipment_tag', value: 'P-101A', confidence: 98, normalized: 'EQ_PUMP_P101A', status: 'confirmed' },
      { id: 'e1-2', page: 1, bbox: { x: 52, y: 48, w: 10, h: 5 }, entity_type: 'equipment_tag', value: 'V-230', confidence: 92, normalized: 'EQ_VALVE_V230', status: 'unverified' },
      { id: 'e1-3', page: 1, bbox: { x: 15, y: 62, w: 18, h: 6 }, entity_type: 'failure_mode', value: 'Hydraulic Cavitation', confidence: 91, normalized: 'FM_CAVITATION', status: 'unverified' },
      { id: 'e1-4', page: 2, bbox: { x: 22, y: 20, w: 14, h: 4 }, entity_type: 'parameter', value: '40 bar', confidence: 95, normalized: 'PARAM_OP_PRESS_40BAR', status: 'unverified' },
      { id: 'e1-5', page: 2, bbox: { x: 22, y: 32, w: 14, h: 4 }, entity_type: 'parameter', value: '450°C', confidence: 94, normalized: 'PARAM_MAX_TEMP_450C', status: 'unverified' },
      { id: 'e1-6', page: 3, bbox: { x: 10, y: 22, w: 22, h: 5 }, entity_type: 'regulation_ref', value: 'OISD-STD-118', confidence: 88, normalized: 'REG_OISD_118', status: 'unverified' },
      { id: 'e1-7', page: 3, bbox: { x: 15, y: 65, w: 18, h: 4 }, entity_type: 'person', value: 'Aditya Vardhan', confidence: 97, normalized: 'USR_ADITYA_V', status: 'confirmed' },
      { id: 'e1-8', page: 3, bbox: { x: 15, y: 77, w: 15, h: 4 }, entity_type: 'date', value: '2026-07-11', confidence: 99, normalized: 'DATE_2026_07_11', status: 'confirmed' }
    ],
    equipment: [
      { tag: 'P-101A', name: 'Main Crude Feed Pump', type: 'Centrifugal Pump', manufacturer: 'Sulzer', model: 'AHP-Crude-200', health: 94, status: 'operational' },
      { tag: 'V-230', name: 'Upstream Isolation Butterfly Valve', type: 'Butterfly Valve', manufacturer: 'Fisher Controls', model: 'HP-BV-V230', health: 98, status: 'operational' }
    ],
    versions: [
      { version: 'V1.2', date: '2026-07-11', author: 'Aditya Vardhan', notes: 'Approved P&ID update with safety bypass line 3-inch venting connection', isReingested: false },
      { version: 'V1.1', date: '2026-06-15', author: 'Priya Sharma', notes: 'OCR re-ingested with enhanced layout extraction rules for secondary text segments', isReingested: true },
      { version: 'V1.0', date: '2026-05-01', author: 'Arun Kumar', notes: 'Initial drawing import and automated graph construction', isReingested: false }
    ],
    relatedDocs: [
      { id: 'doc-2', name: 'OEM-VALVE-V230-BUTTERFLY-MANUAL.PDF', type: 'Equipment Manual', relationship: 'SAME_EQUIPMENT', confidence: 99 },
      { id: 'doc-3', name: 'SOP-REF-V2-STANDARD-VALVE-MAINTENANCE.DOCX', type: 'Safety Procedure', relationship: 'REFERENCES', confidence: 96 },
      { id: 'doc-6', name: 'INC-991-IMPELLER-CAVITATION-REPORT.PDF', type: 'Incident Report', relationship: 'FAILURE_HISTORY', confidence: 92 }
    ],
    comments: [
      { id: 'c1', author: 'Aditya Vardhan', role: 'Plant Manager', avatarText: 'AV', timestamp: 'July 11, 15:30', text: 'Verification completed. Pump P-101A and butterfly valve V-230 are fully connected to the active Crude Unit 1 knowledge graph nodes.' },
      { id: 'c2', author: 'Priya Sharma', role: 'Maintenance Engineer', avatarText: 'PS', timestamp: 'July 11, 16:15', text: 'Note that the torque limit in this schematic matches the Fisher manual but our local SOP has some conflicting guidelines. Let’s make sure standard valve maintenance SOP is aligned.' },
      { id: 'c3', author: 'Arun Kumar', role: 'Maintenance Engineer', avatarText: 'AK', timestamp: 'July 12, 09:45', text: 'Acknowledged. I checked the pneumatic actuator pressure on site and it is calibrating perfectly against PG-104.' }
    ]
  },
  'doc-2': {
    id: 'doc-2',
    name: 'OEM-VALVE-V230-BUTTERFLY-MANUAL.PDF',
    timeline: [
      { stage: 'OCR Scrape Completed', timestamp: '2026-07-09 10:15', status: 'completed', operator: 'System Pipeline' },
      { stage: 'Embedding Extraction Completed', timestamp: '2026-07-09 10:16', status: 'completed', operator: 'System Pipeline' },
      { stage: 'Graph Relationship Wired', timestamp: '2026-07-09 10:18', status: 'completed', operator: 'Neo4j Core' }
    ],
    entities: [
      { id: 'e2-1', page: 1, bbox: { x: 20, y: 15, w: 10, h: 5 }, entity_type: 'equipment_tag', value: 'V-230', confidence: 99, normalized: 'EQ_VALVE_V230', status: 'confirmed' },
      { id: 'e2-2', page: 1, bbox: { x: 30, y: 55, w: 20, h: 5 }, entity_type: 'regulation_ref', value: 'ANSI FCI 70-2', confidence: 95, normalized: 'REG_ANSI_FCI_70_2', status: 'unverified' },
      { id: 'e2-3', page: 2, bbox: { x: 15, y: 40, w: 18, h: 5 }, entity_type: 'failure_mode', value: 'Seat Leakage', confidence: 90, normalized: 'FM_SEAT_LEAKAGE', status: 'unverified' },
      { id: 'e2-4', page: 2, bbox: { x: 45, y: 40, w: 22, h: 5 }, entity_type: 'parameter', value: '180 N-m torque', confidence: 92, normalized: 'PARAM_MAX_TORQUE_180NM', status: 'unverified' },
      { id: 'e2-5', page: 3, bbox: { x: 20, y: 60, w: 15, h: 4 }, entity_type: 'parameter', value: '40 bar max', confidence: 96, normalized: 'PARAM_OP_PRESS_40BAR', status: 'confirmed' }
    ],
    equipment: [
      { tag: 'V-230', name: 'Upstream Isolation Butterfly Valve', type: 'Butterfly Valve', manufacturer: 'Fisher Controls', model: 'HP-BV-V230', health: 98, status: 'operational' }
    ],
    versions: [
      { version: 'V3.0', date: '2026-07-09', author: 'Priya Sharma', notes: 'Official manufacturer operations manual upload', isReingested: false }
    ],
    relatedDocs: [
      { id: 'doc-1', name: 'PID-992-SECTOR-A-REFINERY.DWG.PDF', type: 'P&ID Schematic', relationship: 'SAME_EQUIPMENT', confidence: 99 },
      { id: 'doc-3', name: 'SOP-REF-V2-STANDARD-VALVE-MAINTENANCE.DOCX', type: 'Safety Procedure', relationship: 'REFERENCES', confidence: 94 }
    ],
    comments: [
      { id: 'c4', author: 'Priya Sharma', role: 'Maintenance Engineer', avatarText: 'PS', timestamp: 'July 10, 11:20', text: 'Checked seat leak rate ratings. Class VI compliance verifies this is a tight shut-off valve suitable for high-risk isolation.' }
    ]
  }
};

export const MOCK_GENERIC_DETAILS: DocumentDetailMockData = {
  id: 'generic',
  name: 'DOCUMENT-SPECIFICATION-SHEET.PDF',
  timeline: [
    { stage: 'OCR Processing', timestamp: '2026-07-12 09:00', status: 'completed', operator: 'System Pipeline' },
    { stage: 'Graph Assembly', timestamp: '2026-07-12 09:01', status: 'completed', operator: 'Neo4j Core' }
  ],
  entities: [
    { id: 'eg-1', page: 1, bbox: { x: 15, y: 20, w: 10, h: 5 }, entity_type: 'equipment_tag', value: 'P-101A', confidence: 95, normalized: 'EQ_PUMP_P101A', status: 'unverified' },
    { id: 'eg-2', page: 1, bbox: { x: 50, y: 45, w: 15, h: 5 }, entity_type: 'parameter', value: '12 BAR max', confidence: 92, normalized: 'PARAM_MAX_PRESS_12BAR', status: 'unverified' }
  ],
  equipment: [
    { tag: 'P-101A', name: 'Main Crude Feed Pump', type: 'Centrifugal Pump', manufacturer: 'Sulzer', model: 'AHP-Crude-200', health: 94, status: 'operational' }
  ],
  versions: [
    { version: 'V1.0', date: '2026-07-12', author: 'System Ingest', notes: 'Initial ingestion run', isReingested: false }
  ],
  relatedDocs: [],
  comments: []
};

export function getDocumentDetails(id: string): DocumentDetailMockData {
  return MOCK_DOCUMENT_DETAILS[id] || {
    ...MOCK_GENERIC_DETAILS,
    id,
    name: id.toUpperCase() + '-EXTRACTED-DATA.PDF'
  };
}
