"""Data retention & housekeeping (docs/08 S14).

A nightly beat runs each active policy: `archive` streams rows to gzip JSONL in
object storage under retention/{entity}/{date} then deletes; `delete` just
deletes. Both write an audit entry. Data lifecycle is governed, not accidental.
"""
