"""Spare parts & inventory (docs/08 S12).

parts (catalogue + on-hand) · work_order_parts (planned/used per WO) ·
part_movements (the immutable ledger every on_hand change is derived from).
A work-order completion consumes planned parts atomically and emits
`part.low_stock` when a part crosses its minimum.
"""
