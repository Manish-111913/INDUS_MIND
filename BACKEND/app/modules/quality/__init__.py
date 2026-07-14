"""Quality module (docs/02 §7, §21). NCRs / deviations / CAPA + defect trends.

Emerging quality patterns feed the lessons-learned agent: creating an NCR emits
`ncr.created`, which the lessons trigger inspects for repeat defects on the same
equipment/line.
"""
