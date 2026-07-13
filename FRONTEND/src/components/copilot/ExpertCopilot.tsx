/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Bot, Send, Sparkles, User, Mic, ThumbsUp, ThumbsDown, Bookmark, 
  ExternalLink, HelpCircle, AlertCircle, FileText, Check, ShieldAlert, 
  Pin, Trash2, Edit2, Plus, X, ListFilter, Calendar, Copy, ChevronLeft, 
  ChevronRight, Menu, CheckSquare, Search, SlidersHorizontal, Info, Play
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api/client';
import { ConfidenceBadge } from '../shared';

// ============================================================================
// Types
// ============================================================================
interface Message {
  id: string;
  sender: 'user' | 'system';
  text: string;
  time: string;
  isStreaming?: boolean;
  citations?: { title: string; page: number; link: string }[];
  confidence?: 'High' | 'Med' | 'Low';
  confidencePct?: number;
  timeToAnswer?: string;
  suggestions?: string[];
}

interface ChatSession {
  id: string;
  name: string;
  createdTime: number; // Timestamp
  messages: Message[];
  pinned?: boolean;
}

interface ScopeFilters {
  plant: string;
  tags: string[];
  docTypes: string[];
  dateRange: string;
}

// ============================================================================
// Mock Data and Lookups
// ============================================================================
const ALL_PLANTS = [
  'Reliance Jamnagar Refinery - Sector A',
  'Reliance Jamnagar Refinery - Sector B',
  'Hazira Petrochemicals Complex - Unit 4',
  'KG-D6 Deepwater Gas Field Terminal'
];

const AVAILABLE_TAGS = ['P-101A', 'V-230', 'C-302B', 'PG-104', 'K-401', 'T-102', 'V-105', 'TF-2'];

const AVAILABLE_DOC_TYPES = [
  'P&ID Schematic',
  'Equipment Manual',
  'Safety Procedure',
  'Regulatory Audit',
  'Work Order Record',
  'Incident Report'
];

const STARTER_PROMPTS_BY_ROLE: Record<string, string[]> = {
  'Field Technician': [
    "Torque spec for valve V-230 bonnet bolts",
    "Last 3 failures on pump P-101 and what fixed them",
    "Where is the bypass valve located on P&ID diagram PID-992?"
  ],
  'Maintenance Engineer': [
    "Last 3 failures on pump P-101 and what fixed them",
    "Torque spec for valve V-230 bonnet bolts",
    "Correlate past stator coil breakdowns on COMP-302B compressor."
  ],
  'Compliance Officer': [
    "Which OISD-118 clauses apply to tank farm TF-2?",
    "Detail the gap regarding overdue safety valve testing on Area UTILITIES.",
    "Explain Factory Act Clause 21 guarding requirements."
  ],
  'Plant Manager': [
    "Summarize this week's downtime drivers",
    "What is the overall OEE impact of the Utilities block failure last shift?",
    "Summarize active safety permit gaps at sector REF-A."
  ],
  'Admin': [
    "What is the current token throughput rate on the Gemini 1.5 model?",
    "Audit system access logs for Meena Iyer (Compliance).",
    "Reprocess failed DWG documents in the ingestion queue."
  ]
};

// Map citation titles to real document explorer IDs and snippets
const CITATION_DOCS_MAP: Record<string, { id: string; type: string; confidence: string; snippet: string }> = {
  'OEM Butterfly Valve Manual': {
    id: 'doc-2',
    type: 'Equipment Manual',
    confidence: '98%',
    snippet: 'Section 4.2: Triple-offset Valve V-230 Bonnet Bolting Torque. Bonnet bolts must be torqued in a cross-star sequence in three stages (40 N·m -> 80 N·m -> 120 N·m). Apply copper anti-seize paste prior to assembly. Replace the stainless steel spiral wound gasket Type SS-316L after any disassembly cycle. Under-torquing leads to body-to-bonnet seat blow-by leaks.'
  },
  'SOP-REF-V2: Standard Valve Bolt Maintenance Procedure': {
    id: 'doc-3',
    type: 'Safety Procedure',
    confidence: '95%',
    snippet: 'Clause 2.3: Torque requirements for pneumatic actuators. When mounting actuated assemblies to V-230 isolating seats, engineers must execute bolt tightness audits. Ensure the calibration certificate for the hydraulic torque wrench is active.'
  },
  'INC-991 Impeller Cavitation Report': {
    id: 'doc-6',
    type: 'Incident Report',
    confidence: '91%',
    snippet: 'Oct 2025: Pump P-101A shut down due to severe suction cavitation and pressure oscillations. Impeller showed severe pitting. Replaced with hard-faced impeller. Adjust minimum flow bypass to maintain flow > 45 m3/h.'
  },
  'WO-1873 Bearing Overheat Repair': {
    id: 'doc-4',
    type: 'Work Order Record',
    confidence: '96%',
    snippet: 'Feb 2026: Outboard motor bearing on P-101A seized on grease starvation. Corrected auto-lube timer, flushed bearings, and returned to production service with standard vibration limits.'
  },
  'SOP-REF-112 Pump Maintenance': {
    id: 'doc-1',
    type: 'Safety Procedure',
    confidence: '94%',
    snippet: 'Section 12: Centrifugal Pump startup validation. Ensure barrier fluid Plan 53A accumulator registers between 2.4 and 2.8 BAR. Open suction line fully. Never operate pump dry.'
  },
  'OISD-STD-118 Fire Protection Standard': {
    id: 'doc-8',
    type: 'Regulatory Audit',
    confidence: '93%',
    snippet: 'Section 6.4: Firewater booster pumps and emergency diesel drivers shall be cranked weekly and run for a minimum duration of 30 minutes. Section 6.2: Medium-expansion foam monitors must cover all tank seal areas in LPG storage yards. Automatic monitor valves shall actuate upon flame or thermal sensor alarm trigger.'
  },
  'Compliance Gap Audit #2': {
    id: 'doc-9',
    type: 'Regulatory Audit',
    confidence: '89%',
    snippet: 'Overdue validation: Diesel Firewater pump P-101A shows no logged run test records for the preceding week, in violation of fire prevention guidelines. Immediate local audit required.'
  },
  'Maintenance Vibration Log': {
    id: 'doc-12',
    type: 'Inspection Report',
    confidence: '92%',
    snippet: 'High-frequency stator readings on Compressor C-302B indicated minor structural misalignment. Realignment was scheduled and executed under hot-work certification, resolving downtime drivers.'
  },
  'System Knowledge Index Core': {
    id: 'doc-1',
    type: 'P&ID Schematic',
    confidence: '84%',
    snippet: 'Consolidated index mapping Sector A terminal coordinates to functional assets. Primary guidelines include weekly OISD standard checks and thermal inspection matrices.'
  }
};

const MOCK_ANSWERS: Record<string, {
  text: string;
  citations: { title: string; page: number; link: string }[];
  confidence: 'High' | 'Med' | 'Low';
  confidencePct: number;
  timeToAnswer: string;
  suggestions: string[];
}> = {
  "torque spec for valve v-230 bonnet bolts": {
    text: "According to **OEM Butterfly Valve Manual Section 4.2**, the target torque specification for **Valve V-230 bonnet bolts** is **120 N·m (88.5 lb-ft)**. [1]\n\n* **Bolting Pattern:** Cross-pattern (star) sequence is mandatory in 3 equal increments (40 N·m → 80 N·m → 120 N·m) to prevent gasket pinching. [2]\n* **Lubricant:** Apply copper-based anti-seize paste to threads prior to fastening.\n* **Gasket Type:** Spiral Wound Gasket (Type SS-316L). Never re-use compressed gaskets. [2]",
    citations: [
      { title: "OEM Butterfly Valve Manual", page: 47, link: "#documents/doc-2" },
      { title: "SOP-REF-V2: Standard Valve Bolt Maintenance Procedure", page: 3, link: "#documents/doc-3" }
    ],
    confidence: "High",
    confidencePct: 94,
    timeToAnswer: "1.8s",
    suggestions: [
      "Show bolt pattern diagram",
      "Is anti-seize paste required for cold-service lines?",
      "Download safety permit template"
    ]
  },
  "last 3 failures on pump p-101 and what fixed them": {
    text: "Based on our unified asset log, **Pump P-101A** has recorded three significant failure modes over the last 12 months:\n\n1. **Hydraulic Cavitation (Oct 2025):** Severe impeller erosion due to upstream vapor lock. *Resolution:* Replaced impeller with hard-faced SS-316 alternate and adjusted minimum flow line orifice. [1] [3]\n2. **Bearing Overheating (Feb 2026):** Elevated vibration (7.2 mm/s) due to grease starvation. *Resolution:* Flushed housing, re-lubricated with high-temp synthetic fluid, and synchronized automatic greasing pump. [2]\n3. **Mechanical Seal Leak (June 2026):** Face wear from abrasives. *Resolution:* Replaced primary seal faces and updated Plan 53A accumulator pressure. [3]\n\nThese failures demonstrate structural sensitivity to fluid velocity limits. Please review pump startup validation procedure. [3]",
    citations: [
      { title: "INC-991 Impeller Cavitation Report", page: 4, link: "#documents/doc-6" },
      { title: "WO-1873 Bearing Overheat Repair", page: 2, link: "#documents/doc-4" },
      { title: "SOP-REF-112 Pump Maintenance", page: 12, link: "#documents/doc-1" }
    ],
    confidence: "High",
    confidencePct: 91,
    timeToAnswer: "2.1s",
    suggestions: [
      "Access real-time vibration telemetry",
      "Draft 5-Why analysis framework",
      "View next scheduled maintenance"
    ]
  },
  "which oisd-118 clauses apply to tank farm tf-2?": {
    text: "**OISD-STD-118 (Fire Protection Facilities)** sets several strict compliance requirements for **Tank Farm TF-2**:\n\n* **Clause 6.2 (Medium-expansion foam systems):** Automatic foam monitors must cover all tank seal regions. System must actuate within 30 seconds of high-temperature alarm triggers. [1]\n* **Clause 6.4 (Firewater booster testing):** Diesel firewater pumps must run for 30 minutes weekly. Current logs indicate this check is overdue at TF-2. [1] [2]\n* **Clause 7.1 (Sump drainage):** Hydrocarbon drainage from bund areas must pass through grease traps prior to sewer routing.\n\nNon-compliance triggers severe plant-wide security alerts. Immediate audit validation is recommended.",
    citations: [
      { title: "OISD-STD-118 Fire Protection Standard", page: 8, link: "#documents/doc-8" },
      { title: "Compliance Gap Audit #2", page: 2, link: "#documents/doc-9" }
    ],
    confidence: "High",
    confidencePct: 92,
    timeToAnswer: "1.9s",
    suggestions: [
      "Generate OISD compliance evidence package",
      "Assign weekly firepump run-test task",
      "Review other safety gaps in TF-2"
    ]
  },
  "summarize this week's downtime drivers": {
    text: "Here is a summary of the active **downtime drivers** for the week ending July 12, 2026:\n\n| Equipment Tag | Description | Downtime | Root Cause | Actions | Confidence |\n|---|---|---|---|---|---|\n| **P-101A** | Main Crude Feed Pump | 14.5 hours | Hydraulic cavitation / vapor lock | Impeller replaced; bypass line updated | High [1] |\n| **C-302B** | Gas Reciprocating Compressor | 6.2 hours | Stator overheat / high vibration | Calibrated motor alignment & flushed oil | Medium [2] |\n| **V-230** | Isolation Butterfly Valve | 2.0 hours | Bonnet seat blow-by leak | Star sequence bolt re-torque | High [3] |\n\n*Total Downtime:* **22.7 hours** across Sector A refinery nodes. The major risk driver remains cavitative stress on suction nodes. Review SOP-REF-V2. [1]",
    citations: [
      { title: "INC-991 Impeller Cavitation Report", page: 1, link: "#documents/doc-6" },
      { title: "Maintenance Vibration Log", page: 12, link: "#documents/doc-12" },
      { title: "OEM Butterfly Valve Manual", page: 47, link: "#documents/doc-2" }
    ],
    confidence: "Med",
    confidencePct: 83, // Under 85% - will trigger our Amber confidence warning banner!
    timeToAnswer: "2.4s",
    suggestions: [
      "Compare against previous week's logs",
      "Draft incident review briefing for plant head",
      "Calculate OEE delta impact"
    ]
  }
};

// ============================================================================
// Markdown Bold and Clickable Citation Parser Helpers
// ============================================================================
function renderFormattedText(text: string, onCitationClick: (index: number) => void) {
  const citationRegex = /(\[\d+\])/g;
  const parts = text.split(citationRegex);
  
  return parts.map((part, idx) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const citeNum = parseInt(match[1], 10);
      return (
        <button
          key={idx}
          onClick={() => onCitationClick(citeNum - 1)}
          className="relative inline-flex items-center justify-center align-super px-1 py-0.5 mx-0.5 text-[9px] font-mono font-bold leading-none text-primary hover:text-on-primary bg-primary/10 hover:bg-primary border border-primary/20 hover:border-primary rounded transition-all cursor-pointer select-none"
        >
          {citeNum}
        </button>
      );
    }
    
    const boldRegex = /(\*\*[^*]+\*\*)/g;
    const subParts = part.split(boldRegex);
    return (
      <span key={idx}>
        {subParts.map((subPart, sIdx) => {
          if (subPart.startsWith('**') && subPart.endsWith('**')) {
            return (
              <strong key={sIdx} className="font-semibold text-white">
                {subPart.slice(2, -2)}
              </strong>
            );
          }
          return subPart;
        })}
      </span>
    );
  });
}

function MessageTextRenderer({ text, onCitationClick }: { text: string; onCitationClick: (index: number) => void }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  
  let currentTableRows: string[][] = [];
  let isInTable = false;
  
  const flushTable = (key: string | number) => {
    if (currentTableRows.length === 0) return null;
    
    const headers = currentTableRows[0];
    const rows = currentTableRows.slice(1).filter(r => r.some(cell => cell.trim().replace(/-+/g, '') !== '')); // Skip divider lines
    
    currentTableRows = [];
    isInTable = false;
    
    return (
      <div key={key} className="overflow-x-auto my-3 border border-border-custom rounded-md bg-surface-muted/30">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <thead>
            <tr className="bg-surface-muted border-b border-border-custom">
              {headers.map((h, i) => (
                <th key={i} className="p-2 font-mono font-bold text-white uppercase tracking-wider text-[10px]">
                  {h.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-custom">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-surface-muted/50 transition-colors">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-2 text-text-secondary">
                    {renderFormattedText(cell.trim(), onCitationClick)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim().startsWith('|')) {
      isInTable = true;
      const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const isSeparator = cells.every(c => c.replace(/-+/g, '') === '');
      if (!isSeparator) {
        currentTableRows.push(cells);
      }
      continue;
    } else {
      if (isInTable) {
        elements.push(flushTable(`table-${i}`));
      }
    }
    
    if (line.trim().startsWith('###')) {
      elements.push(
        <h4 key={i} className="font-display text-sm font-bold text-white mt-4 mb-2 uppercase tracking-wide">
          {renderFormattedText(line.replace('###', '').trim(), onCitationClick)}
        </h4>
      );
      continue;
    }
    
    if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
      const itemText = line.trim().substring(1).trim();
      elements.push(
        <ul key={i} className="list-disc pl-5 my-1.5 space-y-1 text-xs text-text-secondary">
          <li>{renderFormattedText(itemText, onCitationClick)}</li>
        </ul>
      );
      continue;
    }
    
    const numMatch = line.trim().match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      elements.push(
        <ol key={i} className="list-decimal pl-5 my-1.5 space-y-1 text-xs text-text-secondary">
          <li value={parseInt(numMatch[1], 10)}>
            {renderFormattedText(numMatch[2], onCitationClick)}
          </li>
        </ol>
      );
      continue;
    }
    
    if (line.trim() !== '') {
      elements.push(
        <p key={i} className="text-xs text-text-secondary leading-relaxed my-2">
          {renderFormattedText(line, onCitationClick)}
        </p>
      );
    }
  }
  
  if (isInTable) {
    elements.push(flushTable(`table-final`));
  }
  
  return <div className="space-y-1">{elements}</div>;
}

// ============================================================================
// Flagship Copilot Screen
// ============================================================================
export function ExpertCopilot() {
  const { user } = useAuthStore();
  
  // 1. Session state and persistence
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  
  // 2. UI layout states
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  
  // 3. Composer states
  const [input, setInput] = useState('');
  const [isMicActive, setIsMicActive] = useState(false);
  const [composerPlaceholder, setComposerPlaceholder] = useState('Type industrial query...');
  
  // 4. Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // 5. Scoping Filters State
  const [filters, setFilters] = useState<ScopeFilters>({
    plant: 'all',
    tags: [],
    docTypes: [],
    dateRange: 'All Time'
  });

  // 6. Inline Feedback Dialog States
  const [feedbackDialog, setFeedbackDialog] = useState<{ isOpen: boolean; msgId: string; type: 'up' | 'down' } | null>(null);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [aiFeedbackReasons, setAiFeedbackReasons] = useState<string[]>([]);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, { score: number; reason?: string; comment?: string }>>({});

  useEffect(() => {
    api.get<string[]>('/lookups?type=ai_feedback_reason')
      .then(res => setAiFeedbackReasons(res || []))
      .catch(e => console.error("Failed to load feedback reasons", e));
  }, []);

  useEffect(() => {
    // Read previous feedback to show accurate highlighted thumb shapes
    const stored = localStorage.getItem('indusmind_ai_feedback');
    if (stored) {
      try {
        const list = JSON.parse(stored);
        const mapped: Record<string, any> = {};
        list.forEach((item: any) => {
          mapped[item.messageId] = { score: item.score, reason: item.reason, comment: item.comment };
        });
        setMessageFeedback(mapped);
      } catch (e) {}
    }
  }, [feedbackDialog]);

  // 7. Citation Popover state
  const [activeCitationPopover, setActiveCitationPopover] = useState<{ messageId: string; index: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<any>(null);

  // Auto-grow composer textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  // Toast feedback timeout helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Web Speech API check on mount
  const SpeechRecognition = useMemo(() => {
    if (typeof window !== 'undefined') {
      return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    }
    return null;
  }, []);

  const isSpeechSupported = !!SpeechRecognition;

  // Initialize sessions on mount (with seeding of pre-populated sessions)
  useEffect(() => {
    const saved = localStorage.getItem('indusmind_chat_sessions');
    let parsed: ChatSession[] = [];
    if (saved) {
      try {
        parsed = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }

    if (parsed.length === 0) {
      // Seed historical high-fidelity data to populate Tomorrow/Today/Older categories and showcase beautiful data
      const now = Date.now();
      const seeded: ChatSession[] = [
        {
          id: 'session-seeded-1',
          name: 'Calibration for V-230 Valve',
          createdTime: now, // Today
          pinned: true,
          messages: [
            { id: 'welcome-1', sender: 'system', text: "HMI AI COPILOT NODE ONLINE. I am linked to the unified operations brain containing P&IDs, safety manuals, work histories, and federal compliance clauses.\n\nHow can I support your operational tasks today?", time: '10:00' },
            { id: 'user-1', sender: 'user', text: "What is the torque specification for Valve V-230 bonnet bolts?", time: '10:01' },
            {
              id: 'bot-1',
              sender: 'system',
              text: MOCK_ANSWERS["torque spec for valve v-230 bonnet bolts"].text,
              time: '10:01',
              citations: MOCK_ANSWERS["torque spec for valve v-230 bonnet bolts"].citations,
              confidence: MOCK_ANSWERS["torque spec for valve v-230 bonnet bolts"].confidence,
              confidencePct: MOCK_ANSWERS["torque spec for valve v-230 bonnet bolts"].confidencePct,
              timeToAnswer: MOCK_ANSWERS["torque spec for valve v-230 bonnet bolts"].timeToAnswer,
              suggestions: MOCK_ANSWERS["torque spec for valve v-230 bonnet bolts"].suggestions
            }
          ]
        },
        {
          id: 'session-seeded-2',
          name: 'Pump P-101 Failures Review',
          createdTime: now - 2 * 24 * 60 * 60 * 1000, // This Week
          messages: [
            { id: 'welcome-2', sender: 'system', text: "HMI AI COPILOT NODE ONLINE. I am ready to evaluate safety files and asset failure histories.", time: '14:00' },
            { id: 'user-2', sender: 'user', text: "Last 3 failures on pump P-101 and what fixed them", time: '14:05' },
            {
              id: 'bot-2',
              sender: 'system',
              text: MOCK_ANSWERS["last 3 failures on pump p-101 and what fixed them"].text,
              time: '14:06',
              citations: MOCK_ANSWERS["last 3 failures on pump p-101 and what fixed them"].citations,
              confidence: MOCK_ANSWERS["last 3 failures on pump p-101 and what fixed them"].confidence,
              confidencePct: MOCK_ANSWERS["last 3 failures on pump p-101 and what fixed them"].confidencePct,
              timeToAnswer: MOCK_ANSWERS["last 3 failures on pump p-101 and what fixed them"].timeToAnswer,
              suggestions: MOCK_ANSWERS["last 3 failures on pump p-101 and what fixed them"].suggestions
            }
          ]
        },
        {
          id: 'session-seeded-3',
          name: 'TF-2 Foam Monitor Compliance Check',
          createdTime: now - 10 * 24 * 60 * 60 * 1000, // Older
          messages: [
            { id: 'welcome-3', sender: 'system', text: "Compliance engine connected. Send regulatory queries to search federal directives.", time: '09:12' },
            { id: 'user-3', sender: 'user', text: "Which OISD-118 clauses apply to tank farm TF-2?", time: '09:15' },
            {
              id: 'bot-3',
              sender: 'system',
              text: MOCK_ANSWERS["which oisd-118 clauses apply to tank farm tf-2?"].text,
              time: '09:16',
              citations: MOCK_ANSWERS["which oisd-118 clauses apply to tank farm tf-2?"].citations,
              confidence: MOCK_ANSWERS["which oisd-118 clauses apply to tank farm tf-2?"].confidence,
              confidencePct: MOCK_ANSWERS["which oisd-118 clauses apply to tank farm tf-2?"].confidencePct,
              timeToAnswer: MOCK_ANSWERS["which oisd-118 clauses apply to tank farm tf-2?"].timeToAnswer,
              suggestions: MOCK_ANSWERS["which oisd-118 clauses apply to tank farm tf-2?"].suggestions
            }
          ]
        }
      ];
      localStorage.setItem('indusmind_chat_sessions', JSON.stringify(seeded));
      parsed = seeded;
    }

    setSessions(parsed);

    // Sync active session based on hash parameter if possible
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const hashId = params.get('sessionId');
    if (hashId && parsed.some(s => s.id === hashId)) {
      setActiveSessionId(hashId);
    } else {
      setActiveSessionId(parsed[0].id);
    }
  }, []);

  // Listen for initial prefilled query from URL params (?q=...)
  useEffect(() => {
    const handleUrlQuery = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#copilot')) {
        const queryParams = new URLSearchParams(hash.split('?')[1] || '');
        const queryVal = queryParams.get('q');
        if (queryVal) {
          setInput(queryVal);
        }
      }
    };
    
    handleUrlQuery();
    window.addEventListener('hashchange', handleUrlQuery);
    return () => window.removeEventListener('hashchange', handleUrlQuery);
  }, []);

  // Save sessions to localStorage whenever state changes
  const saveSessions = (updated: ChatSession[]) => {
    setSessions(updated);
    localStorage.setItem('indusmind_chat_sessions', JSON.stringify(updated));
  };

  // Find active session
  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId);
  }, [sessions, activeSessionId]);

  // Scroll to bottom on messages load / change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, activeSession?.messages?.[(activeSession?.messages?.length || 0) - 1]?.text]);

  // Dynamic grouping for sessions (Today, This week, Older)
  const groupedSessions = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    const pinned: ChatSession[] = [];
    const today: ChatSession[] = [];
    const thisWeek: ChatSession[] = [];
    const older: ChatSession[] = [];

    sessions.forEach(s => {
      if (s.pinned) {
        pinned.push(s);
        return;
      }
      const time = s.createdTime || Date.now();
      if (time >= todayStart) {
        today.push(s);
      } else if (time >= weekStart) {
        thisWeek.push(s);
      } else {
        older.push(s);
      }
    });

    return { pinned, today, thisWeek, older };
  }, [sessions]);

  // ============================================================================
  // Session Actions
  // ============================================================================
  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    // Update hash route so it represents session ID correctly
    window.location.hash = `#copilot?sessionId=${id}`;
    setIsMobileDrawerOpen(false);
  };

  const handleCreateNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSess: ChatSession = {
      id: newId,
      name: `New Session ${sessions.length + 1}`,
      createdTime: Date.now(),
      messages: [
        {
          id: `welcome-${Date.now()}`,
          sender: 'system',
          text: `AI SECURE NODE ATTACHED. Plant profile: ${user?.plant || 'Reliance Jamnagar Sector A'}.\n\nHow can I support your operational tasks today?`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]
    };

    const updated = [newSess, ...sessions];
    saveSessions(updated);
    setActiveSessionId(newId);
    window.location.hash = `#copilot?sessionId=${newId}`;
    setInput('');
    setIsMobileDrawerOpen(false);
    triggerToast("Created new chat session node.");
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    if (updated.length === 0) {
      // Create empty fallback session immediately so list never collapses
      const fbId = `session-${Date.now()}`;
      const fbSess: ChatSession = {
        id: fbId,
        name: 'Default Operations Chat',
        createdTime: Date.now(),
        messages: [{ id: 'welcome-fb', sender: 'system', text: "HMI AI COPILOT NODE ONLINE. Ask me anything about plant operations.", time: '12:00' }]
      };
      saveSessions([fbSess]);
      setActiveSessionId(fbId);
      window.location.hash = `#copilot?sessionId=${fbId}`;
    } else {
      saveSessions(updated);
      if (activeSessionId === id) {
        setActiveSessionId(updated[0].id);
        window.location.hash = `#copilot?sessionId=${updated[0].id}`;
      }
    }
    triggerToast("Session purged successfully.");
  };

  const handleTogglePinSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.map(s => {
      if (s.id === id) {
        return { ...s, pinned: !s.pinned };
      }
      return s;
    });
    saveSessions(updated);
    triggerToast(sessions.find(s => s.id === id)?.pinned ? "Unpinned session." : "Pinned session to top.");
  };

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setRenameValue(name);
  };

  const saveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameValue.trim()) return;
    const updated = sessions.map(s => {
      if (s.id === id) {
        return { ...s, name: renameValue.trim() };
      }
      return s;
    });
    saveSessions(updated);
    setEditingSessionId(null);
    triggerToast("Rename committed successfully.");
  };

  // ============================================================================
  // Speech-to-Text mic button trigger
  // ============================================================================
  const toggleSpeechRecognition = () => {
    if (!isSpeechSupported) return;

    if (isMicActive) {
      if (recRef.current) {
        recRef.current.stop();
      }
      setIsMicActive(false);
      setComposerPlaceholder("Type industrial query...");
    } else {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsMicActive(true);
        setComposerPlaceholder("Listening to vocal dispatch... Speak now.");
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev ? prev + ' ' + transcript : transcript);
      };

      rec.onerror = (err: any) => {
        console.error("Speech Recognition Error:", err);
        setIsMicActive(false);
      };

      rec.onend = () => {
        setIsMicActive(false);
        setComposerPlaceholder("Type industrial query...");
      };

      recRef.current = rec;
      rec.start();
    }
  };

  // ============================================================================
  // Search scoping filter handlers
  // ============================================================================
  const toggleDocType = (type: string) => {
    setFilters(prev => {
      const exists = prev.docTypes.includes(type);
      return {
        ...prev,
        docTypes: exists ? prev.docTypes.filter(t => t !== type) : [...prev.docTypes, type]
      };
    });
  };

  const addTagToFilter = (tag: string) => {
    if (!filters.tags.includes(tag)) {
      setFilters(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagSearch('');
  };

  const removeTagFromFilter = (tag: string) => {
    setFilters(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const clearFilterParam = (key: keyof ScopeFilters, val?: string) => {
    setFilters(prev => {
      if (key === 'plant') return { ...prev, plant: 'all' };
      if (key === 'dateRange') return { ...prev, dateRange: 'All Time' };
      if (key === 'tags' && val) return { ...prev, tags: prev.tags.filter(t => t !== val) };
      if (key === 'docTypes' && val) return { ...prev, docTypes: prev.docTypes.filter(t => t !== val) };
      return prev;
    });
  };

  const isAnyFilterActive = useMemo(() => {
    return filters.plant !== 'all' || filters.tags.length > 0 || filters.docTypes.length > 0 || filters.dateRange !== 'All Time';
  }, [filters]);

  // ============================================================================
  // Message transmission & token-by-token streaming
  // ============================================================================
  const handleSend = (textToSend: string) => {
    if (!textToSend.trim() || !activeSessionId) return;

    // Stop recording if active
    if (isMicActive && recRef.current) {
      recRef.current.stop();
      setIsMicActive(false);
    }

    const cleanedText = textToSend.trim();

    // 1. Append user message
    const userMsgId = `user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: 'user',
      text: cleanedText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const sessionObj = sessions.find(s => s.id === activeSessionId);
    if (!sessionObj) return;

    const currentMsgList = [...sessionObj.messages, userMsg];
    
    // Automatically rename the session name if it was a default "New Session"
    let updatedSessName = sessionObj.name;
    if (sessionObj.name.startsWith('New Session')) {
      updatedSessName = cleanedText.length > 25 ? cleanedText.substring(0, 25) + '...' : cleanedText;
    }

    const updatedSessionsWithUser = sessions.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, name: updatedSessName, messages: currentMsgList };
      }
      return s;
    });
    saveSessions(updatedSessionsWithUser);
    setInput('');

    // 2. Select matched high-fidelity answer template, or generate smart custom response
    const queryLower = cleanedText.toLowerCase();
    let matchedAnswerKey = Object.keys(MOCK_ANSWERS).find(key => queryLower.includes(key) || key.includes(queryLower));

    // Handle generic tag fallbacks (e.g. searching only P-101 or V-230)
    if (!matchedAnswerKey) {
      if (queryLower.includes('v-230') || queryLower.includes('torque') || queryLower.includes('valve')) {
        matchedAnswerKey = 'torque spec for valve v-230 bonnet bolts';
      } else if (queryLower.includes('p-101') || queryLower.includes('failures') || queryLower.includes('pump')) {
        matchedAnswerKey = 'last 3 failures on pump p-101 and what fixed them';
      } else if (queryLower.includes('oisd') || queryLower.includes('118') || queryLower.includes('tf-2') || queryLower.includes('compliance')) {
        matchedAnswerKey = 'which oisd-118 clauses apply to tank farm tf-2?';
      } else if (queryLower.includes('downtime') || queryLower.includes('drivers') || queryLower.includes('week')) {
        matchedAnswerKey = 'summarize this week\'s downtime drivers';
      }
    }

    let answerTemplate = matchedAnswerKey 
      ? MOCK_ANSWERS[matchedAnswerKey]
      : {
          text: `### Industrial Core Engine Scan Results for **${cleanedText}**\n\nI have completed an indexing sweep of Sector A's knowledge graphs and documented files matching your query:\n\n* **Primary Assessment:** Swapped node context to synthesize matching variables. Found 2 related procedural logs under the ${user?.plant || 'current plant'} repository.\n* **Operations Directive:** Ensure all technicians wear standard thermal-resistant gloves during inspection or replacement loops. [1]\n\nTo see a rich, high-fidelity response, select one of the tailored engineering prompts or search for details on **Pump P-101**, **Valve V-230**, **TF-2**, or **Downtime drivers**!`,
          citations: [
            { title: "System Knowledge Index Core", page: 1, link: "#documents/doc-1" }
          ],
          confidence: "Med" as const,
          confidencePct: 78,
          timeToAnswer: "1.4s",
          suggestions: [
            "What is the torque specification for Valve V-230 bonnet bolts?",
            "Last 3 failures on pump P-101 and what fixed them",
            "Which OISD-118 clauses apply to tank farm TF-2?"
          ]
        };

    // Apply active scope constraints notification if filters are set
    if (isAnyFilterActive) {
      const scopeNotes: string[] = [];
      if (filters.plant !== 'all') scopeNotes.push(`Plant Node: ${filters.plant.split(' - ')[1]}`);
      if (filters.tags.length > 0) scopeNotes.push(`Equipment: ${filters.tags.join(', ')}`);
      if (filters.docTypes.length > 0) scopeNotes.push(`Document Types: ${filters.docTypes.join(', ')}`);
      if (filters.dateRange !== 'All Time') scopeNotes.push(`Date: ${filters.dateRange}`);

      const scopedHeader = `> **Search Filter Scope Applied:** ${scopeNotes.join(' | ')}\n\n`;
      answerTemplate = {
        ...answerTemplate,
        text: scopedHeader + answerTemplate.text
      };
    }

    // 3. Setup Streaming bot response
    const botMsgId = `bot-${Date.now()}`;
    const botPlaceholder: Message = {
      id: botMsgId,
      sender: 'system',
      text: '',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStreaming: true,
      citations: answerTemplate.citations,
      confidence: answerTemplate.confidence,
      confidencePct: answerTemplate.confidencePct,
      timeToAnswer: answerTemplate.timeToAnswer,
      suggestions: answerTemplate.suggestions
    };

    // Add placeholder to active session state
    const updatedSessWithPlaceholder = updatedSessionsWithUser.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, messages: [...s.messages, botPlaceholder] };
      }
      return s;
    });
    setSessions(updatedSessWithPlaceholder);

    // Simulate Token Stream (word-by-word)
    const tokens = answerTemplate.text.split(' ');
    let tokenIndex = 0;
    let accumulatedText = '';

    const streamInterval = setInterval(() => {
      if (tokenIndex < tokens.length) {
        accumulatedText += (tokenIndex === 0 ? '' : ' ') + tokens[tokenIndex];
        setSessions(prev => 
          prev.map(s => {
            if (s.id === activeSessionId) {
              return {
                ...s,
                messages: (s.messages || []).map(m => 
                  m.id === botMsgId ? { ...m, text: accumulatedText } : m
                )
              };
            }
            return s;
          })
        );
        tokenIndex++;
      } else {
        clearInterval(streamInterval);
        // Completed streaming
        setSessions(prev => {
          const finalSessions = prev.map(s => {
            if (s.id === activeSessionId) {
              return {
                ...s,
                messages: (s.messages || []).map(m => 
                  m.id === botMsgId ? { ...m, isStreaming: false } : m
                )
              };
            }
            return s;
          });
          // Persist the completed conversation to localStorage
          localStorage.setItem('indusmind_chat_sessions', JSON.stringify(finalSessions));
          return finalSessions;
        });
      }
    }, 35); // 35ms per word represents beautiful high-fidelity streaming
  };

  // Handle clicked suggestions
  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
    handleSend(prompt);
  };

  // ============================================================================
  // Citation detail retrievers
  // ============================================================================
  const getCitationType = (title: string) => CITATION_DOCS_MAP[title]?.type || 'Standard';
  const getCitationSnippet = (title: string) => CITATION_DOCS_MAP[title]?.snippet || 'No snippet preview available.';
  const getCitationDocId = (title: string) => CITATION_DOCS_MAP[title]?.id || 'doc-1';
  const getCitationConfidence = (title: string) => CITATION_DOCS_MAP[title]?.confidence || '90%';

  // Inline citation highlight & flash helper
  const handleInlineCitationClick = (msgId: string, index: number) => {
    setActiveCitationPopover({ messageId: msgId, index });
    const chipElement = document.getElementById(`cite-chip-${msgId}-${index}`);
    if (chipElement) {
      chipElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      chipElement.classList.add('ring-2', 'ring-primary', 'scale-105');
      setTimeout(() => {
        chipElement.classList.remove('ring-2', 'ring-primary', 'scale-105');
      }, 1500);
    }
  };

  // Helper to copy answer to clipboard
  const copyAnswerToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    triggerToast("Copied answer to clipboard.");
  };

  // Thumbs down feedback submission
  const submitFeedback = async () => {
    if (!feedbackDialog) return;
    
    let msgText = "AI Response";
    if (activeSession) {
      const msg = activeSession.messages.find(m => m.id === feedbackDialog.msgId);
      if (msg) msgText = msg.text;
    }

    const payload = {
      score: -1,
      reason: selectedReasons[0] || 'other',
      comment: feedbackReason.trim(),
      messageText: msgText
    };

    try {
      await api.post(`/chat/messages/${feedbackDialog.msgId}/feedback`, payload);
      triggerToast("Feedback logged to RLHF alignment registry.");
      
      setMessageFeedback(prev => ({
        ...prev,
        [feedbackDialog.msgId]: { score: -1, reason: payload.reason, comment: payload.comment }
      }));
    } catch (err) {
      console.error("Failed to save feedback:", err);
    } finally {
      setFeedbackDialog(null);
      setFeedbackReason('');
      setSelectedReasons([]);
    }
  };

  const handleThumbsUp = async (msgId: string, msgText: string) => {
    const payload = {
      score: 1,
      reason: null,
      comment: 'Thumbs up positive feedback',
      messageText: msgText
    };
    try {
      await api.post(`/chat/messages/${msgId}/feedback`, payload);
      triggerToast("Accurate directive logged. Model alignment weights strengthened.");
      setMessageFeedback(prev => ({
        ...prev,
        [msgId]: { score: 1 }
      }));
    } catch (err) {
      console.error("Failed to save thumbs up feedback:", err);
    }
  };

  const toggleFeedbackReasonCheckbox = (val: string) => {
    setSelectedReasons(prev => 
      prev.includes(val) ? prev.filter(r => r !== val) : [...prev, val]
    );
  };

  return (
    <div id="expert-copilot-container" className="flex-1 flex overflow-hidden bg-background-custom -mx-4 -my-4 md:-mx-6 md:-my-6 h-[calc(100vh-7.5rem)] md:h-[calc(100vh-3.5rem)] relative">
      
      {/* Toast Feedback Notification Overlay */}
      {toastMessage && (
        <div className="fixed top-18 right-6 z-50 bg-primary border border-primary/30 text-on-primary px-4 py-2.5 rounded shadow-2xl flex items-center space-x-2 animate-in slide-in-from-top-4 duration-200 text-xs font-mono">
          <Info className="w-4 h-4 text-on-primary animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ====================================================================
          1. SESSION LIST LEFT RAIL (Desktop persistent / Mobile sliding drawer)
          ==================================================================== */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-border-custom flex flex-col transition-transform duration-200 ease-in-out md:relative md:translate-x-0
        ${isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Left rail header */}
        <div className="h-12 border-b border-border-custom flex items-center justify-between bg-surface-muted px-4">
          <div className="flex items-center space-x-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span className="font-display font-semibold text-xs text-text-primary uppercase tracking-wider">HMI Session Nodes</span>
          </div>
          <button 
            onClick={handleCreateNewSession}
            className="p-1.5 rounded bg-primary/10 hover:bg-primary text-primary hover:text-on-primary transition-colors cursor-pointer border border-primary/20"
            title="Provision New Session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sessions scroll container */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          
          {/* PINNED SECTION */}
          {groupedSessions.pinned.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[9px] font-mono font-bold tracking-widest text-primary uppercase mb-1 flex items-center space-x-1">
                <Pin className="w-2.5 h-2.5" />
                <span>Pinned Terminal Links</span>
              </div>
              <div className="space-y-0.5">
                {groupedSessions.pinned.map(s => renderSessionItem(s))}
              </div>
            </div>
          )}

          {/* TODAY SECTION */}
          {groupedSessions.today.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[9px] font-mono font-bold tracking-widest text-text-muted uppercase mb-1">
                Today's Dispatches
              </div>
              <div className="space-y-0.5">
                {groupedSessions.today.map(s => renderSessionItem(s))}
              </div>
            </div>
          )}

          {/* THIS WEEK SECTION */}
          {groupedSessions.thisWeek.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[9px] font-mono font-bold tracking-widest text-text-muted uppercase mb-1">
                Active This Week
              </div>
              <div className="space-y-0.5">
                {groupedSessions.thisWeek.map(s => renderSessionItem(s))}
              </div>
            </div>
          )}

          {/* OLDER SECTION */}
          {groupedSessions.older.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[9px] font-mono font-bold tracking-widest text-text-muted uppercase mb-1">
                Older Archived Nodes
              </div>
              <div className="space-y-0.5">
                {groupedSessions.older.map(s => renderSessionItem(s))}
              </div>
            </div>
          )}

        </div>

        {/* Bottom Metadata */}
        <div className="p-3 border-t border-border-custom bg-background-custom text-[9px] font-mono text-text-muted space-y-1">
          <div className="flex items-center justify-between">
            <span>SECURE SYSTEM TUNNEL:</span>
            <span className="text-status-ok">ESTABLISHED</span>
          </div>
          <div>ACTIVE NODE ID: {user?.id.toUpperCase()}</div>
          <div>PLATFORM: CLOUD RUN COGNITIVE VAULT</div>
        </div>
      </aside>

      {/* Backdrop overlay for Mobile Drawer */}
      {isMobileDrawerOpen && (
        <div 
          onClick={() => setIsMobileDrawerOpen(false)}
          className="fixed inset-0 z-35 bg-black/60 md:hidden transition-opacity"
        />
      )}

      {/* ====================================================================
          2. MAIN CHAT CONTAINER AREA
          ==================================================================== */}
      <section className="flex-1 flex flex-col min-w-0 bg-background-custom relative overflow-hidden h-full">
        
        {/* Main Header bar */}
        <header className="h-12 border-b border-border-custom px-4 flex items-center justify-between bg-surface z-10">
          <div className="flex items-center space-x-2 min-w-0">
            {/* Mobile Sidebar toggle hamburger */}
            <button 
              onClick={() => setIsMobileDrawerOpen(true)}
              className="p-1 rounded hover:bg-surface-muted text-text-secondary md:hidden mr-1 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <Bot className="w-4 h-4 text-primary flex-shrink-0" />
            <h2 className="font-display font-bold text-xs text-text-primary truncate max-w-[180px] sm:max-w-xs">
              {activeSession ? activeSession.name : 'IndusMind Agent Console'}
            </h2>
            {activeSession?.pinned && (
              <Pin className="w-3 h-3 text-primary fill-primary/20 flex-shrink-0 transform rotate-45" />
            )}
          </div>

          <div className="flex items-center space-x-3 text-[10px] font-mono">
            {isAnyFilterActive && (
              <div className="hidden sm:flex items-center space-x-1 text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                <SlidersHorizontal className="w-3 h-3" />
                <span>Filters Active</span>
              </div>
            )}
            <div className="hidden sm:flex items-center space-x-1.5 text-text-muted">
              <span>HOLOGRAPHIC HMI INTEL</span>
              <span className="w-1.5 h-1.5 rounded-full bg-status-ok animate-pulse" />
            </div>
          </div>
        </header>

        {/* Scrollable messages core frame */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 scrollbar-none">
          {activeSession?.messages?.map((msg, mIdx) => (
            <div 
              key={msg.id}
              className={`flex items-start space-x-3 max-w-4xl ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse space-x-reverse' : ''
              }`}
            >
              {/* User / Agent Avatar badge */}
              <div className={`p-1.5 rounded border flex-shrink-0 ${
                msg.sender === 'user' 
                  ? 'bg-primary/20 text-primary border-primary/30 shadow' 
                  : 'bg-surface text-ai border-border-custom shadow-md'
              }`}>
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Chat bubble main block */}
              <div className={`flex flex-col relative max-w-[85%] ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}>
                <div className={`p-4 rounded-xl border text-xs shadow-lg leading-relaxed relative ${
                  msg.sender === 'user'
                    ? 'bg-primary/10 text-text-primary border-primary/20 rounded-tr-none'
                    : 'bg-surface-muted text-text-primary border-border-custom rounded-tl-none'
                }`}>
                  
                  {/* Dynamic Markdown/Table parsing content */}
                  <MessageTextRenderer 
                    text={msg.text} 
                    onCitationClick={(citeIdx) => handleInlineCitationClick(msg.id, citeIdx)} 
                  />

                  {/* Blinking streaming cursor */}
                  {msg.isStreaming && (
                    <span className="inline-flex items-center ml-1 space-x-1">
                      <span className="w-1.5 h-3.5 bg-primary animate-pulse" />
                    </span>
                  )}

                  {/* ========================================================
                      Citations, confidence & actions under system messages
                      ======================================================== */}
                  {msg.sender === 'system' && !msg.isStreaming && (
                    <div className="mt-4 pt-3 border-t border-border-custom/40 space-y-3">
                      
                      {/* Metric Badges Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        {msg.confidence && (
                          <ConfidenceBadge confidence={msg.confidence} percentage={msg.confidencePct} />
                        )}
                        {msg.timeToAnswer && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-surface-muted border border-border-custom text-text-muted">
                            LATENCY: {msg.timeToAnswer} · vs ~45m traditional search
                          </span>
                        )}
                      </div>

                      {/* Amber Warning Banner for Lower Confidence (< 85%) */}
                      {msg.confidencePct && msg.confidencePct < 85 && (
                        <div className="flex items-start space-x-2 p-2 bg-status-warn/10 border border-status-warn/25 rounded text-[11px] text-status-warn">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 animate-bounce" />
                          <span>Lower confidence index — Verify details against cited source manuals carefully.</span>
                        </div>
                      )}

                      {/* Desktop Citation Chips (Grid layout with absolute popup hover support) */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="hidden md:block">
                          <span className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
                            VERIFIED CITATION SOURCE INDEX:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {msg.citations.map((cite, i) => (
                              <div 
                                key={i} 
                                id={`cite-chip-${msg.id}-${i}`}
                                className="relative transition-all duration-200"
                              >
                                <button
                                  onClick={() => handleInlineCitationClick(msg.id, i)}
                                  className={`
                                    inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-surface-muted hover:bg-primary/10 border transition-all text-[10px] font-mono cursor-pointer
                                    ${activeCitationPopover && activeCitationPopover.messageId === msg.id && activeCitationPopover.index === i 
                                      ? 'border-primary text-primary font-bold shadow-lg bg-primary/5' 
                                      : 'border-border-custom text-text-secondary hover:text-text-primary'
                                    }
                                  `}
                                >
                                  <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                  <span className="max-w-[140px] truncate">[{i + 1}] {cite.title}</span>
                                  <span className="text-primary text-[9px] font-bold">p.{cite.page}</span>
                                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />
                                </button>

                                {/* CITATION PREVIEW POPOVER (Hover/Click modal) */}
                                {activeCitationPopover && activeCitationPopover.messageId === msg.id && activeCitationPopover.index === i && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-20" 
                                      onClick={() => setActiveCitationPopover(null)} 
                                    />
                                    <div className="absolute bottom-9 left-0 z-30 w-80 bg-surface border border-primary/30 rounded-lg p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-xs text-text-primary space-y-3">
                                      <div className="flex items-start justify-between">
                                        <div>
                                          <span className="inline-block text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                            {getCitationType(cite.title)}
                                          </span>
                                          <h4 className="font-semibold text-text-primary mt-1.5 truncate max-w-[210px]" title={cite.title}>
                                            {cite.title}
                                          </h4>
                                        </div>
                                        <button 
                                          onClick={() => setActiveCitationPopover(null)} 
                                          className="p-0.5 rounded hover:bg-surface-muted text-text-muted hover:text-text-primary cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      
                                      <div className="text-[11px] text-text-secondary italic leading-relaxed border-l-2 border-primary/40 pl-2 bg-surface-muted py-1.5 rounded-r">
                                        "{getCitationSnippet(cite.title)}"
                                      </div>

                                      <div className="flex items-center justify-between text-[9px] font-mono text-text-muted">
                                        <span>ACCURACY: {getCitationConfidence(cite.title)} MATCH</span>
                                        <span>PAGE {cite.page}</span>
                                      </div>

                                      <a
                                        href={`#documents/${getCitationDocId(cite.title)}`}
                                        onClick={() => setActiveCitationPopover(null)}
                                        className="flex items-center justify-center space-x-1 w-full py-1.5 bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold rounded transition-colors text-center cursor-pointer font-mono"
                                      >
                                        <span>OPEN DIGITAL ARCHIVE</span>
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mobile Citation Swipeable Cards Under Answer (< 768px) */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="block md:hidden w-full overflow-hidden">
                          <span className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
                            SOURCE REFERENCES (SWIPE LEFT/RIGHT):
                          </span>
                          <div className="flex overflow-x-auto gap-3 pb-3 snap-x snap-mandatory scrollbar-none max-w-full">
                            {msg.citations.map((cite, i) => (
                              <div 
                                key={i}
                                className="flex-shrink-0 w-64 bg-surface-2 border border-border-custom rounded-lg p-3 space-y-2 snap-center"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                    [{i + 1}] {getCitationType(cite.title)}
                                  </span>
                                  <span className="text-[9px] font-mono text-text-muted">Page {cite.page}</span>
                                </div>
                                <h5 className="font-semibold text-white truncate text-xs">{cite.title}</h5>
                                <p className="text-[10px] text-text-secondary line-clamp-2 leading-relaxed">
                                  "{getCitationSnippet(cite.title)}"
                                </p>
                                <a
                                  href={`#documents/${getCitationDocId(cite.title)}`}
                                  className="flex items-center justify-center space-x-1 w-full py-1 bg-primary text-white text-[10px] font-mono font-bold rounded"
                                >
                                  <span>ACTIVATE VIEWER</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bot feedback, copy & alignment panel */}
                      <div className="flex items-center justify-between pt-1 text-[10px]">
                        <div className="flex items-center space-x-2 text-text-muted">
                          <span className="text-[9px] font-mono">INTELLIGENCE ACCURACY?</span>
                          <button 
                            onClick={() => handleThumbsUp(msg.id, msg.text)}
                            className={`p-1 rounded hover:bg-surface-muted hover:text-status-ok transition-colors cursor-pointer ${
                              messageFeedback[msg.id]?.score === 1 ? 'text-status-ok' : ''
                            }`}
                            title="Match Accurate Directive"
                          >
                            <ThumbsUp className={`w-3.5 h-3.5 ${messageFeedback[msg.id]?.score === 1 ? 'fill-status-ok text-status-ok' : ''}`} />
                          </button>
                          <button 
                            onClick={() => setFeedbackDialog({ isOpen: true, msgId: msg.id, type: 'down' })}
                            className={`p-1 rounded hover:bg-surface-muted hover:text-status-critical transition-colors cursor-pointer ${
                              messageFeedback[msg.id]?.score === -1 ? 'text-status-critical' : ''
                            }`}
                            title="Flag Procedural Gaps"
                          >
                            <ThumbsDown className={`w-3.5 h-3.5 ${messageFeedback[msg.id]?.score === -1 ? 'fill-status-critical text-status-critical' : ''}`} />
                          </button>
                        </div>

                        <div className="flex space-x-2 font-mono text-text-muted">
                          <button 
                            onClick={() => copyAnswerToClipboard(msg.text)}
                            className="hover:text-white flex items-center space-x-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>[COPY]</span>
                          </button>
                          <span className="text-border-custom">|</span>
                          <button 
                            onClick={() => triggerToast("Answer cloned into unified system Knowledge Base successfully.")}
                            className="hover:text-white flex items-center space-x-1 cursor-pointer"
                          >
                            <Bookmark className="w-3 h-3" />
                            <span>[SAVE TO KB]</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  )}

                </div>
                
                {/* Timestamp below message */}
                <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider mt-1 px-1">
                  {msg.sender === 'user' ? 'Technician terminal' : 'IndusMind Core'} · {msg.time}
                </span>
              </div>
            </div>
          ))}

          {/* Core empty state (gallery of role-aware starters) */}
          {(!activeSession || !activeSession.messages || activeSession.messages.length <= 1) && user && (
            <div className="max-w-xl mx-auto py-10 px-4 text-center space-y-6">
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-full inline-block text-primary">
                <Sparkles className="w-10 h-10 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h3 className="font-display text-lg font-bold text-text-primary">IndusMind Engineering Intelligence</h3>
                <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
                  Welcome back, <span className="text-text-primary font-bold">{user.name}</span>. Linked as <span className="text-primary font-mono">{user.role}</span>. Select a tailored pre-test starter below or write a custom dispatch.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 text-left pt-2 font-mono">
                <div className="text-[9px] font-bold text-primary uppercase tracking-wider px-1">
                  CERTIFIED SUGGESTIONS FOR YOUR SECURITY PROFILE:
                </div>
                {(STARTER_PROMPTS_BY_ROLE[user.role] || STARTER_PROMPTS_BY_ROLE['Field Technician']).map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(prompt)}
                    className="w-full text-xs text-left p-3.5 bg-surface-2 hover:bg-primary/5 border border-border-custom hover:border-primary/40 rounded-lg transition-all text-text-secondary hover:text-text-primary flex items-center justify-between cursor-pointer group"
                  >
                    <span className="pr-4">{prompt}</span>
                    <Play className="w-3 h-3 text-primary flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating suggestion tags overlay above composer */}
        {activeSession && activeSession.messages && activeSession.messages.length > 1 && !activeSession.messages[activeSession.messages.length - 1].isStreaming && (
          <div className="absolute bottom-16 inset-x-0 bg-bg/95 border-t border-border-custom py-2 px-4 flex flex-wrap items-center gap-1.5 z-10 text-xs overflow-x-auto scrollbar-none">
            <span className="font-mono text-[9px] text-primary font-bold uppercase mr-1">FOLLOW UPS:</span>
            {activeSession.messages[activeSession.messages.length - 1].suggestions?.map((sug, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(sug)}
                className="px-2.5 py-1 rounded-full bg-surface-2 hover:bg-primary/15 border border-border-custom hover:border-primary/40 text-[10px] font-mono text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                {sug}
              </button>
            )) || (
              <button
                onClick={() => handleSuggestionClick("What is the mechanical layout for pump P-101?")}
                className="px-2.5 py-1 rounded-full bg-surface-2 hover:bg-primary/10 border border-border-custom text-[10px] font-mono text-text-secondary hover:text-text-primary transition-all cursor-pointer"
              >
                What is the mechanical layout for pump P-101?
              </button>
            )}
          </div>
        )}

        {/* ====================================================================
            3. STICKY COMPOSER CONTAINER BAR (with Scoping filter & Mic toggle)
            ==================================================================== */}
        <div className="absolute bottom-0 inset-x-0 bg-surface-2 border-t border-border-custom p-3 z-10">
          
          {/* Active scoping filter chips shown above textarea */}
          {isAnyFilterActive && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[10px] font-mono">
              <span className="text-[9px] text-text-muted uppercase font-bold tracking-wider mr-1">SEARCH BIAS:</span>
              
              {filters.plant !== 'all' && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-primary/10 border border-primary/30 rounded text-primary">
                  <span>Plant: {filters.plant.split(' - ')[1]}</span>
                  <button onClick={() => clearFilterParam('plant')} className="hover:text-text-primary"><X className="w-3 h-3" /></button>
                </span>
              )}

              {filters.tags.map(t => (
                <span key={t} className="inline-flex items-center space-x-1 px-2 py-0.5 bg-status-info/10 border border-status-info/30 rounded text-status-info">
                  <span>Tag: {t}</span>
                  <button onClick={() => clearFilterParam('tags', t)} className="hover:text-text-primary"><X className="w-3 h-3" /></button>
                </span>
              ))}

              {filters.docTypes.map(d => (
                <span key={d} className="inline-flex items-center space-x-1 px-2 py-0.5 bg-status-warn/10 border border-status-warn/30 rounded text-status-warn">
                  <span>Doc: {d}</span>
                  <button onClick={() => clearFilterParam('docTypes', d)} className="hover:text-text-primary"><X className="w-3 h-3" /></button>
                </span>
              ))}

              {filters.dateRange !== 'All Time' && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-status-ok/10 border border-status-ok/30 rounded text-status-ok">
                  <span>Date: {filters.dateRange}</span>
                  <button onClick={() => clearFilterParam('dateRange')} className="hover:text-text-primary"><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          )}

          {/* Interactive Input Composer Area */}
          <div className="flex items-end space-x-2 bg-bg border border-border-custom focus-within:border-primary rounded-lg p-2 transition-all">
            
            {/* Scoping Filters popover trigger */}
            <div className="relative">
              <button 
                onClick={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
                className={`p-1.5 rounded transition-colors cursor-pointer relative ${
                  isFilterPopoverOpen || isAnyFilterActive
                    ? 'bg-primary/20 text-primary border border-primary/30 shadow' 
                    : 'text-text-secondary hover:bg-surface-2 border border-transparent'
                }`}
                title="Search Scope Constraints"
              >
                <ListFilter className="w-4 h-4" />
                {isAnyFilterActive && (
                  <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary ring-2 ring-bg" />
                )}
              </button>

              {/* SCOPE FILTER POPOVER BLOCK */}
              {isFilterPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setIsFilterPopoverOpen(false)} />
                  <div className="absolute bottom-10 left-0 z-30 w-72 bg-surface border border-border-custom rounded-lg p-4 shadow-2xl font-sans text-xs space-y-4 animate-in slide-in-from-bottom-2 duration-150 text-text-primary">
                    <div className="flex items-center justify-between border-b border-border-custom pb-2">
                      <span className="font-display font-bold uppercase tracking-wider text-[10px] text-primary flex items-center space-x-1">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Search Scope Bias</span>
                      </span>
                      <button onClick={() => setIsFilterPopoverOpen(false)} className="text-text-muted hover:text-text-primary">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Plant Dropdown */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono text-text-muted uppercase">Target Plant Node</label>
                      <select 
                        value={filters.plant}
                        onChange={(e) => setFilters(prev => ({ ...prev, plant: e.target.value }))}
                        className="w-full bg-bg border border-border-custom p-1.5 rounded text-text-primary focus:outline-none focus:border-primary text-xs"
                      >
                        <option value="all">All Plant Nodes</option>
                        {ALL_PLANTS.map(p => (
                          <option key={p} value={p}>{p.split(' - ')[1]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tag Typeahead / multiselect */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono text-text-muted uppercase">Equipment Tags</label>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {filters.tags.map(t => (
                          <span key={t} className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/25 rounded text-[10px] font-mono">
                            <span>{t}</span>
                            <button onClick={() => removeTagFromFilter(t)}><X className="w-2.5 h-2.5" /></button>
                          </span>
                        ))}
                      </div>
                      <input 
                        type="text" 
                        placeholder="Type Tag (e.g. P-101A...)"
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        className="w-full bg-bg border border-border-custom p-1.5 rounded text-text-primary text-xs focus:outline-none focus:border-primary"
                      />
                      {tagSearch.trim() !== '' && (
                        <div className="bg-bg border border-border-custom rounded mt-1 max-h-24 overflow-y-auto divide-y divide-border-custom/50 font-mono text-[11px]">
                          {AVAILABLE_TAGS
                            .filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()) && !filters.tags.includes(t))
                            .map(t => (
                              <button 
                                key={t} 
                                onClick={() => addTagToFilter(t)}
                                className="w-full text-left p-1.5 hover:bg-primary/10 text-text-secondary hover:text-text-primary cursor-pointer"
                              >
                                {t}
                              </button>
                            ))
                          }
                        </div>
                      )}
                    </div>

                    {/* Doc Type selection */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono text-text-muted uppercase mb-1">Document Types</label>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] max-h-24 overflow-y-auto">
                        {AVAILABLE_DOC_TYPES.map(type => {
                          const checked = filters.docTypes.includes(type);
                          return (
                            <button
                              key={type}
                              onClick={() => toggleDocType(type)}
                              className={`flex items-center space-x-1.5 p-1 rounded border text-left truncate cursor-pointer transition-colors ${
                                checked 
                                  ? 'bg-primary/10 text-primary border-primary/40' 
                                  : 'bg-bg border-border-custom text-text-secondary hover:bg-surface-2'
                              }`}
                            >
                              <CheckSquare className={`w-3.5 h-3.5 flex-shrink-0 ${checked ? 'text-primary' : 'text-text-muted'}`} />
                              <span className="truncate">{type}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Date range dropdown */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono text-text-muted uppercase">History Depth</label>
                      <select 
                        value={filters.dateRange}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                        className="w-full bg-bg border border-border-custom p-1.5 rounded text-text-primary focus:outline-none focus:border-primary text-xs"
                      >
                        <option value="All Time">All Time Records</option>
                        <option value="Last 24 Hours">Last 24 Hours</option>
                        <option value="Last 7 Days">Last 7 Days</option>
                        <option value="Last 30 Days">Last 30 Days</option>
                        <option value="Custom Range">Custom Audit Range</option>
                      </select>
                    </div>

                    <button 
                      onClick={() => setIsFilterPopoverOpen(false)}
                      className="w-full py-1.5 bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold rounded font-mono cursor-pointer text-center"
                    >
                      APPLY SCAN CONSTRAINTS
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Composer Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder={composerPlaceholder}
              disabled={isMicActive}
              className="flex-1 bg-transparent text-text-primary text-xs min-h-[32px] max-h-[150px] resize-none border-none outline-none focus:ring-0 placeholder-text-muted py-1 pl-1 font-sans pr-4"
            />

            {/* Mic toggle (Hidden gracefully if Web Speech API isn't supported) */}
            {isSpeechSupported && (
              <button
                onClick={toggleSpeechRecognition}
                className={`p-1.5 rounded border transition-colors cursor-pointer relative ${
                  isMicActive 
                    ? 'bg-status-critical/10 text-status-critical border-status-critical animate-pulse' 
                    : 'border-transparent text-text-secondary hover:bg-surface-2'
                }`}
                title={isMicActive ? "Stop Vocal Stream" : "Speak Voice Command"}
              >
                <Mic className="w-4 h-4" />
                {isMicActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-status-critical animate-ping" />
                )}
              </button>
            )}

            {/* Send Dispatch Button */}
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim()}
              className={`
                p-1.5 rounded transition-colors shadow flex items-center justify-center cursor-pointer
                ${input.trim() 
                  ? 'bg-primary text-on-primary hover:bg-primary-hover' 
                  : 'bg-surface-2 text-text-muted border border-border-custom cursor-not-allowed'
                }
              `}
            >
              <Send className="w-4 h-4" />
            </button>

          </div>
        </div>

      </section>

      {/* ====================================================================
          4. THUMBS-DOWN FEEDBACK CAPTURE DIALOG OVERLAY MODAL
          ==================================================================== */}
      {feedbackDialog && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 font-sans backdrop-blur-sm">
          <div className="bg-surface border border-primary/30 w-full max-w-sm rounded-lg p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            
            <h3 className="font-display text-sm font-bold text-text-primary mb-2 uppercase tracking-wider flex items-center space-x-2">
              {feedbackDialog.type === 'up' 
                ? <ThumbsUp className="w-4 h-4 text-status-ok" /> 
                : <ThumbsDown className="w-4 h-4 text-status-critical" />
              }
              <span>RLHF AI Reinforcement Feedback</span>
            </h3>
            
            <p className="text-xs text-text-secondary mb-4 leading-relaxed">
              Help train IndusMind's local, privacy-shielded LLM weights. Flag formatting anomalies or technical hallucinations:
            </p>

            {/* Checkbox reasons for easy alignment */}
            <div className="space-y-1.5 mb-4 text-xs">
              <span className="block text-[9px] font-mono text-text-muted uppercase mb-1">Standard Alignment Faults:</span>
              {aiFeedbackReasons.map(reason => {
                const isChecked = selectedReasons.includes(reason);
                const formatReasonLabel = (r: string) => {
                  return r.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                };
                return (
                  <button
                    key={reason}
                    onClick={() => setSelectedReasons([reason])}
                    className={`w-full flex items-center space-x-2.5 p-2 rounded border text-left transition-colors cursor-pointer ${
                      isChecked 
                        ? 'bg-status-critical/10 text-status-critical border-status-critical/30 font-semibold' 
                        : 'bg-bg border-border-custom text-text-secondary hover:bg-surface-muted'
                    }`}
                  >
                    <CheckSquare className={`w-4 h-4 ${isChecked ? 'text-status-critical' : 'text-text-muted'}`} />
                    <span>{formatReasonLabel(reason)}</span>
                  </button>
                );
              })}
            </div>

            <textarea
              rows={3}
              value={feedbackReason}
              onChange={(e) => setFeedbackReason(e.target.value)}
              placeholder="Provide comments (e.g., Impeller failure resolution matches OEM Manual page 12, but torque limits were stated incorrectly)..."
              className="w-full bg-bg text-text-primary text-xs p-2 rounded border border-border-custom focus:outline-none focus:border-primary mb-4 resize-none focus:ring-1 focus:ring-primary"
            />

            <div className="flex justify-end space-x-2 text-xs font-mono font-bold">
              <button 
                onClick={() => {
                  setFeedbackDialog(null);
                  setFeedbackReason('');
                  setSelectedReasons([]);
                }}
                className="px-3 py-1.5 bg-surface-muted hover:bg-surface-2 text-text-secondary hover:text-text-primary rounded border border-border-custom cursor-pointer"
              >
                CANCEL
              </button>
              <button 
                onClick={submitFeedback}
                className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-on-primary rounded cursor-pointer"
              >
                SUBMIT ALIGNMENT LOGS
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  // ============================================================================
  // Session Item component rendering helper
  // ============================================================================
  function renderSessionItem(s: ChatSession) {
    const isActive = s.id === activeSessionId;
    const isEditing = editingSessionId === s.id;

    return (
      <div
        key={s.id}
        onClick={() => !isEditing && handleSelectSession(s.id)}
        className={`
          group w-full flex items-center justify-between p-2 rounded transition-all cursor-pointer border text-xs font-sans
          ${isActive 
            ? 'bg-primary/10 border-primary/35 text-text-primary font-semibold' 
            : 'bg-transparent border-transparent text-text-2 hover:bg-surface-2 hover:text-text-primary'
          }
        `}
      >
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-text-muted'}`} />
          {isEditing ? (
            <form 
              onSubmit={(e) => saveRename(s.id, e)} 
              onClick={e => e.stopPropagation()}
              className="flex-1 flex items-center"
            >
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => saveRename(s.id)}
                className="w-full bg-background-custom text-text-primary text-xs px-1 border border-primary outline-none focus:ring-1 focus:ring-primary rounded py-0.5"
                autoFocus
              />
            </form>
          ) : (
            <span className="truncate pr-1">{s.name}</span>
          )}
        </div>

        {/* Action icons (Pinned/Edit/Rename/Delete) shown on Hover or if Active */}
        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1.5 transition-opacity pl-1 flex-shrink-0">
            {/* Pin Toggle */}
            <button
              onClick={(e) => handleTogglePinSession(s.id, e)}
              className={`p-0.5 rounded hover:bg-surface-2 transition-colors cursor-pointer ${s.pinned ? 'text-primary' : 'text-text-muted hover:text-text-primary'}`}
              title={s.pinned ? "Unpin Dispatch Node" : "Pin Dispatch Node"}
            >
              <Pin className={`w-3 h-3 ${s.pinned ? 'fill-primary' : ''}`} />
            </button>
            {/* Rename Pencil */}
            <button
              onClick={(e) => startRename(s.id, s.name, e)}
              className="p-0.5 rounded hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              title="Rename Terminal Channel"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            {/* Delete Trash */}
            <button
              onClick={(e) => {
                if (confirm(`Are you sure you want to delete "${s.name}"?`)) {
                  handleDeleteSession(s.id, e);
                } else {
                  e.stopPropagation();
                }
              }}
              className="p-0.5 rounded hover:bg-status-critical/10 text-text-muted hover:text-status-critical transition-colors cursor-pointer"
              title="De-commission Dispatch Channel"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }
}
