"""Lessons-learned module (docs/02 §7, §10, §34).

A scheduled/triggered agent clusters failure/incident/NCR records (description
similarity + shared equipment neighbourhoods) into recurring patterns, drafts a
lesson (candidate) with narrative + recommended action + evidence, and — on human
publish — broadcasts a notification and projects `Lesson -[:DERIVED_FROM]->`
edges into the graph.
"""
