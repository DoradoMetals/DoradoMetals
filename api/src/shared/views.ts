export function withDecisions<V extends object, D extends object>(view: V, decisions: D): V & D {
  return Object.assign(view, decisions)
}

export function withEachDecision<V extends object, D extends object>(
  views: V[],
  decide: (view: V) => D
): (V & D)[] {
  return views.map((view) => withDecisions(view, decide(view)))
}
