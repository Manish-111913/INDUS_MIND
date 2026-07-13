export interface LandingCopy {
  navbar: {
    logo: string;
    links: { label: string; href: string }[];
    signInLabel: string;
    launchDemoLabel: string;
  };
  hero: {
    headline: string;
    subline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trustStrip: string;
    mockCopilot: {
      question: string;
      answer: string;
      confidence: number;
      citations: string[];
    };
  };
  problemStrip: {
    title: string;
    stats: {
      value: string;
      targetVal: number; // For counting up
      suffix: string;
      caption: string;
    }[];
  };
  platform: {
    title: string;
    subtitle: string;
    features: {
      id: string;
      icon: string;
      title: string;
      description: string;
      signatureType: 'copilot' | 'ingestion' | 'graph' | 'predictive' | 'compliance' | 'lessons';
    }[];
  };
  howItWorks: {
    title: string;
    subtitle: string;
    steps: {
      number: string;
      title: string;
      description: string;
    }[];
  };
  roles: {
    title: string;
    subtitle: string;
    tabs: {
      id: string;
      label: string;
      valueProp: string;
      bullets: string[];
      vignette: {
        title: string;
        badge: string;
        status: string;
        metric: string;
        metricLabel: string;
      };
    }[];
  };
  impact: {
    title: string;
    subtitle: string;
    testimonial: {
      quote: string;
      author: string;
      role: string;
    };
    metrics: {
      label: string;
      oldVal: string;
      newVal: string;
      icon: string;
    }[];
  };
  faq: {
    title: string;
    subtitle: string;
    items: {
      question: string;
      answer: string;
    }[];
  };
  ctaBand: {
    headline: string;
    primaryCta: string;
    secondaryCta: string;
  };
  footer: {
    cols: {
      title: string;
      links: { label: string; href: string }[];
    }[];
    copyright: string;
    buildTag: string;
  };
}

export const landingCopy: LandingCopy = {
  navbar: {
    logo: "IndusMind",
    links: [
      { label: "Platform", href: "#platform" },
      { label: "How it works", href: "#how" },
      { label: "Solutions", href: "#solutions" },
      { label: "Impact", href: "#impact" },
      { label: "FAQ", href: "#faq" }
    ],
    signInLabel: "Sign in",
    launchDemoLabel: "Launch demo"
  },
  hero: {
    headline: "Every manual. Every failure. Every fix. One brain.",
    subline: "IndusMind unifies 30 years of manuals, work orders, P&IDs and inspection reports into an AI copilot your engineers can ask in plain language — with citations.",
    ctaPrimary: "Launch live demo",
    ctaSecondary: "Watch 2-min video",
    trustStrip: "OISD · IEC 61511 · ISO 55000 ALIGNED",
    mockCopilot: {
      question: "Why does pump P-101 keep failing?",
      answer: "Analysis of P-101B failure logs (Q2 2025) and standard vendor maintenance SOP-42 indicates that recurring impeller misalignment is due to thermal expansion under peak operating temperatures (>120°C). Secondary cause: improper torque specifications on casing bolts.",
      confidence: 94,
      citations: ["O&M-Manual-P100-Sec4.pdf", "Work-Order-WO-9082.csv", "SOP-Bolting-Specs.pdf"]
    }
  },
  problemStrip: {
    title: "The Industrial Knowledge Deficit",
    stats: [
      {
        value: "35%",
        targetVal: 35,
        suffix: "%",
        caption: "of professional engineering time lost searching for drawings and historic telemetry"
      },
      {
        value: "7-12",
        targetVal: 12,
        suffix: "",
        caption: "disconnected document systems and legacy silos per average refinery plant"
      },
      {
        value: "30+ years",
        targetVal: 30,
        suffix: "+",
        caption: "of veteran expert knowledge walking out the door with retirement waves"
      }
    ]
  },
  platform: {
    title: "Engineered for Plant Reality",
    subtitle: "A unified knowledge layer built on top of your legacy documentation and plant telemetry.",
    features: [
      {
        id: "expert-copilot",
        icon: "Bot",
        title: "Expert Copilot",
        description: "Interact with your entire plant history in plain natural language. Get instant engineering answers with verifiable page-level PDF citations.",
        signatureType: "copilot"
      },
      {
        id: "ingestion-engine",
        icon: "UploadCloud",
        title: "Multimodal Ingestion",
        description: "Breathe life into scanned legacy drawings, old PDFs, CSV work logs, and P&ID diagrams with high-fidelity, industry-specific OCR extraction.",
        signatureType: "ingestion"
      },
      {
        id: "knowledge-graph",
        icon: "Network",
        title: "Plant Knowledge Graph",
        description: "Automatically index, link, and structure complex equipment relationships. Map parent loops, child sensors, and interconnected line valves dynamically.",
        signatureType: "graph"
      },
      {
        id: "predictive-maint",
        icon: "Zap",
        title: "Predictive Intelligence",
        description: "Correlate active vibration, pressure, and temperature telemetry trends with historic failure signatures to proactively dispatch preventive work orders.",
        signatureType: "predictive"
      },
      {
        id: "compliance-autopilot",
        icon: "ShieldAlert",
        title: "Compliance Autopilot",
        description: "Stay audit-ready 24/7. Automatically map real-world plant assets and operational logs directly to strict OISD, OSHA, and ISO standards.",
        signatureType: "compliance"
      },
      {
        id: "lessons-learned",
        icon: "History",
        title: "Lessons Learned Engine",
        description: "Stop repeating the same operating mistakes. Capture root cause analyses (RCA) and post-incident reviews, transforming them into proactive alerts.",
        signatureType: "lessons"
      }
    ]
  },
  howItWorks: {
    title: "Four Steps to Single-Brain Operation",
    subtitle: "From fragmented folders to continuous digital intelligence in days.",
    steps: [
      {
        number: "01",
        title: "Connect & Ingest",
        description: "Connect legacy drives, DMS, and SCADA systems. Our multimodal OCR ingests files in bulk."
      },
      {
        number: "02",
        title: "Understand & Link",
        description: "AI builds a continuous knowledge graph, mapping files to specific physical tags (e.g. COMP-302B)."
      },
      {
        number: "03",
        title: "Ask & Act",
        description: "Engineers query manuals or failure history in plain English, generating clear actionable SOP sheets."
      },
      {
        number: "04",
        title: "Prove & Comply",
        description: "Run automated compliance audits mapping real field activities to global OISD and ISO protocols."
      }
    ]
  },
  roles: {
    title: "Built for Every Member of the Crew",
    subtitle: "Tailored views and actionable data suited for specific operational commands.",
    tabs: [
      {
        id: "plant-manager",
        label: "Plant Manager",
        valueProp: "Ensure absolute plant runtime safety, asset optimization, and cross-department operational efficiency.",
        bullets: [
          "Real-time dashboards detailing multi-sector risk and team work velocity.",
          "Identify critical maintenance backlogs before they trigger costly shutdowns.",
          "Track safety protocol compliance indices with a unified plant readiness score."
        ],
        vignette: {
          title: "Unit-1 Operational Summary",
          badge: "OISD-117 Compliant",
          status: "Nominal",
          metric: "98.4%",
          metricLabel: "Active Safety Index"
        }
      },
      {
        id: "maint-engineer",
        label: "Maintenance Engineer",
        valueProp: "Avert critical machine outages and plan surgical maintenance turnarounds with historic failure telemetry.",
        bullets: [
          "Instantly query decades of overhaul records and vendor manuals.",
          "Access automated root-cause suggestions for recurring vibration spikes.",
          "Generate instant task checklists detailing exact bolt torque tolerances."
        ],
        vignette: {
          title: "COMP-302B Reciprocating Compressor",
          badge: "High Risk Alignment",
          status: "Attention Required",
          metric: "7.2 mm/s",
          metricLabel: "Vibration Peak"
        }
      },
      {
        id: "field-technician",
        label: "Field Technician",
        valueProp: "Scan, diagnose, and execute safe repairs in the field without digging through paper files.",
        bullets: [
          "Scan equipment QR tags to pull up instant schematics and digital log sheets.",
          "Leave speech-to-text handovers to capture rapid tactical expert insights.",
          "Check instant visual step-by-step guidance on safe lockout/tagout procedures."
        ],
        vignette: {
          title: "P-101B Centrifugal Pump",
          badge: "QR ID Verified",
          status: "Active Repair",
          metric: "SOP-42",
          metricLabel: "Locked Out Spec"
        }
      },
      {
        id: "compliance-officer",
        label: "Compliance Officer",
        valueProp: "Pass stringent regulatory safety audits in hours instead of weeks of manual document collection.",
        bullets: [
          "Auto-map real-world worker activities to corresponding ISO and regulatory standards.",
          "Maintain immutable audit log records of all system queries and data edits.",
          "Identify and patch translation or compliance gaps across vendor documents."
        ],
        vignette: {
          title: "OISD-GDN-115 Audit Registry",
          badge: "99% Evidence Link",
          status: "Ready for Audit",
          metric: "1,240",
          metricLabel: "Verified Citations"
        }
      }
    ]
  },
  impact: {
    title: "Quantifiable Operational Impact",
    subtitle: "Real reliability improvement proven on the production floor.",
    testimonial: {
      quote: "\"Before IndusMind, a critical pump vibration spike meant five hours of hunting through warehouse boxes for the 1998 manual and old repair tickets. Now our field crews have the original torque specs and past failure history on their screens in forty seconds. It's completely changed how we work.\"",
      author: "Arjun Mehta",
      role: "Head of Reliability, Fortune-500 Gujarat Refinery"
    },
    metrics: [
      {
        label: "Average Search Turnaround",
        oldVal: "4 hrs",
        newVal: "40 sec",
        icon: "Search"
      },
      {
        label: "Wrench Time Boost",
        oldVal: "Baseline",
        newVal: "+18%",
        icon: "Wrench"
      },
      {
        label: "Regulatory Audit Prep",
        oldVal: "Weeks",
        newVal: "Hours",
        icon: "ShieldCheck"
      },
      {
        label: "Retirement Knowledge Loss",
        oldVal: "Moderate",
        newVal: "0%",
        icon: "Database"
      }
    ]
  },
  faq: {
    title: "Frequently Asked Questions",
    subtitle: "Everything you need to know about the industry's most robust knowledge model.",
    items: [
      {
        question: "How does IndusMind guarantee data security and strict IP tenancy?",
        answer: "We treat your plant data as a core national asset. All uploaded documents, schematics, and logs are isolated inside an enterprise-grade Virtual Private Cloud (VPC) with AES-256 encryption at rest and TLS 1.3 in transit. Your proprietary data is never used to train public foundational AI models."
      },
      {
        question: "Do you support private on-premise or isolated VPC deployment?",
        answer: "Yes. For highly sensitive operations, IndusMind can be deployed in fully isolated VPCs or air-gapped on-premise Kubernetes clusters, ensuring zero external data egress."
      },
      {
        question: "How do page-level citations prevent AI hallucinations?",
        answer: "Every answer generated by IndusMind is strictly grounded in your uploaded document library. Rather than generating text from pre-trained weights, our Retrieval-Augmented Generation (RAG) system retrieves specific passages and tags, providing visual citations you can click to verify."
      },
      {
        question: "Can IndusMind integrate with legacy ERP/CMMS like SAP and IBM Maximo?",
        answer: "Yes. IndusMind features modular webhooks and REST APIs designed to sync with SAP, Maximo, and modern SCADA databases, automatically connecting active physical telemetry with document pipelines."
      },
      {
        question: "What languages are supported for legacy plant documentation?",
        answer: "IndusMind is fully multilingual. It processes documents in English, Hindi, Gujarati, Marathi, and German, and automatically detects and translates cross-language terminology gaps."
      }
    ]
  },
  ctaBand: {
    headline: "Give your plant a memory.",
    primaryCta: "Launch live demo",
    secondaryCta: "Talk to us"
  },
  footer: {
    cols: [
      {
        title: "Platform",
        links: [
          { label: "Expert Copilot", href: "#platform" },
          { label: "Multimodal Ingestion", href: "#platform" },
          { label: "Plant Graph", href: "#platform" },
          { label: "Predictive Health", href: "#platform" }
        ]
      },
      {
        title: "Solutions",
        links: [
          { label: "For Plant Managers", href: "#solutions" },
          { label: "For Maintenance Eng", href: "#solutions" },
          { label: "For Technicians", href: "#solutions" },
          { label: "For Safety Officers", href: "#solutions" }
        ]
      },
      {
        title: "Company",
        links: [
          { label: "Changelog", href: "#" },
          { label: "Documentation", href: "#" },
          { label: "Contact Sales", href: "mailto:sales@indusmind.ai" }
        ]
      },
      {
        title: "Legal",
        links: [
          { label: "Privacy Protocol", href: "#" },
          { label: "Terms of Use", href: "#" },
          { label: "Security Whitepaper", href: "#" }
        ]
      }
    ],
    copyright: "© 2026 IndusMind Technologies Inc. All rights reserved.",
    buildTag: "v1.0 · hackathon build"
  }
};
