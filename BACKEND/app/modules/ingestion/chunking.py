"""Structure-aware chunking (docs/02 §10 step 3).

Target 400–600 tokens with ~15% overlap; tables kept atomic (with a header
context line); each chunk carries page_no, section_path and a bbox (union of the
source blocks). Chunks never span pages so citations/highlights stay page-exact.
Token count is estimated as chars/4 (no tokenizer dependency).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.modules.ingestion.parsing import ParsedDocument, ParsedUnit

TARGET_TOKENS = 500
MIN_TOKENS = 400
MAX_TOKENS = 600
OVERLAP_RATIO = 0.15


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


@dataclass(slots=True)
class Chunk:
    chunk_index: int
    page_no: int | None
    section_path: str | None
    text: str
    token_count: int
    bbox: dict | None = None
    kind: str = "text"


def _merge_bbox(units: list[ParsedUnit]) -> dict | None:
    coords = [u.bbox["coords"] for u in units if u.bbox and u.bbox.get("coords")]
    if not coords:
        return None
    xs0 = min(c[0] for c in coords)
    ys0 = min(c[1] for c in coords)
    xs1 = max(c[2] for c in coords)
    ys1 = max(c[3] for c in coords)
    return {"coords": [xs0, ys0, xs1, ys1]}


def chunk_document(parsed: ParsedDocument) -> list[Chunk]:
    chunks: list[Chunk] = []
    idx = 0

    def flush(units: list[ParsedUnit], *, kind: str = "text") -> None:
        nonlocal idx
        if not units:
            return
        text = "\n".join(u.text for u in units).strip()
        if not text:
            return
        chunks.append(Chunk(
            chunk_index=idx, page_no=units[0].page_no, section_path=units[0].section_path,
            text=text, token_count=estimate_tokens(text), bbox=_merge_bbox(units), kind=kind))
        idx += 1

    # Group text units by page so a chunk never spans pages; tables are atomic.
    buffer: list[ParsedUnit] = []
    buffer_tokens = 0
    current_page = object()

    for unit in parsed.units:
        if unit.kind == "table":
            flush(buffer)
            buffer, buffer_tokens = [], 0
            header = f"[Table · {unit.section_path or ''}]".strip()
            table_unit = ParsedUnit(page_no=unit.page_no, section_path=unit.section_path,
                                    text=f"{header}\n{unit.text}", kind="table", bbox=unit.bbox)
            flush([table_unit], kind="table")
            continue

        if unit.page_no != current_page:
            flush(buffer)
            buffer, buffer_tokens = [], 0
            current_page = unit.page_no

        buffer.append(unit)
        buffer_tokens += estimate_tokens(unit.text)
        if buffer_tokens >= TARGET_TOKENS:
            flush(buffer)
            # 15% overlap: carry the tail units (~OVERLAP_RATIO of budget) forward.
            overlap_budget = int(TARGET_TOKENS * OVERLAP_RATIO)
            tail: list[ParsedUnit] = []
            acc = 0
            for u in reversed(buffer):
                if acc >= overlap_budget:
                    break
                tail.insert(0, u)
                acc += estimate_tokens(u.text)
            buffer = tail
            buffer_tokens = acc

    flush(buffer)
    return chunks
