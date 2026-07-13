"""Sample industrial document corpus (docs/02 §55 seed).

Generates 12 realistic PDFs with reportlab (OEM manual, work orders, SOP,
regulation excerpts, inspections, incident, P&ID sheet, shift log, NCR). The
seed uploads + ingests them so the graph/RAG/dashboards are alive for the demo.
"""

from __future__ import annotations

import io
import textwrap

# (filename, doc_type_code, title, tags, [paragraphs])
SAMPLES: list[tuple[str, str, str, list[str], list[str]]] = [
    ("p101-oem-manual.pdf", "manual", "Centrifugal Pump P-101 — OEM Manual Excerpt",
     ["pump", "P-101", "manual"],
     ["Equipment: P-101 Crude Feed Pump. Manufacturer: KSB. Model HGM-4-450. Rated flow 450 m3/h, "
      "head 120 m, 250 kW, 2980 rpm.",
      "Bonnet bolt torque specification: tighten M20 bonnet bolts to 210 Nm in a star pattern. "
      "Mechanical seal: John Crane Type 5610. Flush plan API 682 Plan 11.",
      "Bearing lubrication: ISO VG 68 mineral oil, change every 4000 running hours. Vibration "
      "alarm at 4.5 mm/s RMS, trip at 7.1 mm/s per ISO 10816.",
      "Common failure modes: seal leak from flush blockage, bearing failure from contamination, "
      "high vibration from misalignment. Refer to RCA history for P-101."]),
    ("wo-2041.pdf", "work_order", "Work Order WO-2041 — P-101 Seal Replacement",
     ["work_order", "P-101", "WO-2041"],
     ["WO-2041 | Equipment P-101 | Type Corrective | Priority High | Assignee A. Technician.",
      "Symptom: mechanical seal leak observed at P-101 during morning round; flush line pressure low.",
      "Action taken: isolated pump, replaced John Crane 5610 seal, cleaned Plan 11 flush orifice, "
      "re-aligned coupling to 0.05 mm. Labour 6.0 hours. Parts: seal kit, gasket set.",
      "Closure: leak resolved, vibration 2.1 mm/s after restart. Failure code: seal_leak."]),
    ("wo-2042.pdf", "work_order", "Work Order WO-2042 — C-3 Compressor Inspection",
     ["work_order", "C-3", "WO-2042"],
     ["WO-2042 | Equipment C-3 Overhead Compressor | Type Preventive | Priority Medium.",
      "Scope: quarterly inspection of C-3 discharge, lube oil analysis, vibration survey.",
      "Findings: discharge temperature trending up 6 C over baseline; recommend intercooler "
      "cleaning. Vibration within limits. No action beyond monitoring."]),
    ("wo-2043.pdf", "work_order", "Work Order WO-2043 — V-230 Relief Valve Test",
     ["work_order", "V-230", "WO-2043"],
     ["WO-2043 | Equipment V-230 Reflux Drum | Type Inspection | Priority High.",
      "Task: PSV pop test on V-230 relief valve, set pressure 10 barg. Result: popped at 9.8 barg, "
      "within +/- 3% tolerance. Reseated cleanly. Next due in 12 months."]),
    ("sop-114-firewater.pdf", "sop", "SOP-114 — Firewater Pump Quarterly Testing",
     ["sop", "SOP-114", "FW-P1", "firewater"],
     ["SOP-114 governs quarterly performance testing of firewater pump FW-P1 per OISD-STD-116.",
      "Procedure: 1) Notify control room. 2) Start diesel driver, confirm auto-start on pressure "
      "drop. 3) Run for 30 minutes at rated 1000 m3/h, 90 m head. 4) Record suction/discharge "
      "pressures every 5 minutes. 5) Verify no overheating; log results in maintenance system.",
      "Acceptance: flow within 90% of rated, auto-start within 10 seconds. Deviations raise a gap."]),
    ("oisd-118-excerpt.pdf", "regulation", "OISD-STD-118 — Clause Excerpts (Layout & Safety)",
     ["regulation", "OISD-STD-118", "compliance"],
     ["Clause 6.4: Firewater pumps shall be tested for performance on a quarterly basis and records "
      "maintained for a minimum of three years.",
      "Clause 7.2: Pressure relief valves on pressure vessels shall be tested at intervals not "
      "exceeding twelve months.",
      "Clause 9.1: Rotating equipment with criticality A shall have vibration monitoring and a "
      "documented predictive maintenance program."]),
    ("inspection-c3-2026.pdf", "inspection_report", "Inspection Report — C-3 Compressor (2026 Q1)",
     ["inspection_report", "C-3"],
     ["Visual and NDT inspection of C-3 casing and nozzles. Wall thickness within limits. Minor "
      "external corrosion at support saddle; recommend recoating.",
      "Lube oil sample: iron 12 ppm (normal), water < 0.1%. No bearing wear indicators."]),
    ("inspection-v230-2026.pdf", "inspection_report", "Inspection Report — V-230 Reflux Drum",
     ["inspection_report", "V-230"],
     ["Internal inspection of V-230 during shutdown. Shell thickness 11.8 mm vs 12.0 mm nominal; "
      "corrosion rate 0.05 mm/year, remaining life adequate.",
      "Demister pad intact. Relief valve V-230 PSV verified. No repairs required this cycle."]),
    ("incident-2026-07.pdf", "incident_report", "Incident Report — P-101 Trip on High Vibration",
     ["incident_report", "P-101"],
     ["On shift, P-101 tripped on high vibration (7.3 mm/s). Standby P-102 auto-started; no "
      "production loss. Suspected cause: coupling misalignment after recent seal job.",
      "Immediate action: locked out P-101, raised WO for alignment check. Lesson: verify alignment "
      "with laser tool after every seal replacement on rotating equipment."]),
    ("pid-sheet-cdu.pdf", "pid", "P&ID Sheet — Crude Distillation Unit (Tag List)",
     ["pid", "drawing", "CDU"],
     ["P&ID CDU-001 tag list: P-101 Crude Feed Pump, P-102 Crude Feed Pump (standby), "
      "C-3 Overhead Compressor, E-101 Crude Preheat Exchanger, V-101 Crude Column, "
      "V-230 Reflux Drum, FUR-1 Atmospheric Furnace.",
      "Lines: 6\"-P-101-CS to column feed; 8\"-C-3 overhead to condenser E-102. Instrument loops: "
      "PT-101 discharge pressure, VT-101 vibration transmitter on P-101."]),
    ("shift-log-2026-07-12.pdf", "incident_report", "Shift Log — CDU Night Shift 2026-07-12",
     ["shift_log", "CDU"],
     ["22:10 P-101 discharge pressure steady 11.9 barg. 23:40 noticed slight seal weep on P-101, "
      "logged for day shift. 01:20 C-3 discharge temp 6 C above baseline, monitoring.",
      "03:00 firewater FW-P1 auto-start test deferred to day shift. Handover: watch P-101 seal."]),
    ("ncr-2026-014.pdf", "incident_report", "Quality NCR-2026-014 — Weld Defect on E-101 Nozzle",
     ["ncr", "quality", "E-101"],
     ["NCR-2026-014 | Line CDU | Defect type weld_defect | Severity Major | Equipment E-101.",
      "Description: radiography of E-101 replacement nozzle weld shows porosity exceeding ASME B31.3 "
      "limits. Disposition: reject, re-weld and re-test.",
      "CAPA: qualify welder procedure, add 100% RT hold point for exchanger nozzle welds."]),
]


def generate_pdf(title: str, paragraphs: list[str]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 60
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, title)
    y -= 28
    c.setFont("Helvetica", 10)
    for para in paragraphs:
        for line in textwrap.wrap(para, 95):
            if y < 60:
                c.showPage()
                c.setFont("Helvetica", 10)
                y = height - 60
            c.drawString(50, y, line)
            y -= 14
        y -= 8
    c.showPage()
    c.save()
    return buf.getvalue()
