# ADR 2026-10-06: Pen Strokes Keep Their Shape on Commit

## Status
Accepted

## Context

Freehand strokes looked right while drawing but changed shape the moment the
pen lifted: corners were cut, peaks shrank and the line thinned.

On pointer-up `commit_active_stroke` RDP-simplifies the point list (0.25 px
error), which on straight runs keeps only a handful of points. The outline
generator then streamlined the centre line by moving a fixed fraction toward
each *input point*, so its lag depended on point density: tiny on the dense
live stroke, very large on the sparse committed one. Simulated mouse pressure
had the same flaw (speed was read from point spacing), and a mouse's constant
0.5 pressure was not treated as "no pressure", so it was never baked before
simplification.

## Decision

1. `freehand::samples` resamples the centre line (and its pressures) to a
   fixed arc-length step of `0.15 × size` before streamlining, so smoothing
   depends on the path, not on how many points describe it.
2. Without real device pressure, pressure is simulated from the raw input
   spacing first, then resampled: the same values commit bakes in.
3. `freehand::has_real_pressure` defines "real" pressure (varying, finite,
   one per point). Commit bakes simulated pressure whenever it is false,
   including the constant 0.5 mice report.
4. Regression test `committed_stroke_matches_live_stroke` checks the committed
   outline stays within a small fraction of the pen size of the live one; the
   old code fails it by ~0.7 × size on an "M".

## Consequences

- What is drawn is what is kept, for all pens.
- Strokes saved before this change render through the same path and look
  closer to how they were drawn.
- Outline cost now scales with stroke length / pen size rather than input
  point count; comparable for normal handwriting.
