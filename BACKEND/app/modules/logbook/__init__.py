"""Shift logbook & handover (docs/08 S13).

Operators write shift logs; on submit each log is registered as a document and
pushed through the chunk→embed→entities pipeline (skipping OCR/parse), so the
Copilot can answer "what happened on night shift?" and cite the log. A submitted
log can be summarised into a handover via the LLM, metered as feature=logbook.
"""
