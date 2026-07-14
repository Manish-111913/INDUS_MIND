"""Compliance module (docs/02 §7, §10, §19).

Regulations → clause trees → AI mapping/gap agent → evidence packages. Postgres
is the system of record; the knowledge graph carries Clause GOVERNS edges as a
rebuildable projection. Cross-module references (equipment, documents, work
orders, users) are soft UUID references validated via service interfaces — no
cross-module FKs (docs/02 §2).
"""
