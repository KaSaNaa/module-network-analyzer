/**
 * Graph traversal helpers: BFS and DFS.
 *
 * These are the shared primitives used by the centrality and connectivity
 * algorithms.
 *
 *   - BFS uses a Queue (array with head pointer) -> shortest paths in unweighted graphs
 *   - DFS uses a Stack (explicit + recursive variants) -> connectivity / ordering
 *
 * Time Complexity:  O(V + E)
 * Space Complexity: O(V)
 */

/**
 * Breadth-first search from a single source.
 *
 * @returns {{
 *   order: Array,               visitation order
 *   distances: Map<any, number> hop count from source (unreached => Infinity)
 *   parents: Map<any, any>      BFS tree parent (source => null)
 * }}
 */
export function bfs(graph, source) {
  const distances = new Map();
  const parents = new Map();
  const order = [];

  for (const v of graph.getVertices()) {
    distances.set(v, Infinity);
    parents.set(v, undefined);
  }

  if (!distances.has(source)) {
    return { order, distances, parents };
  }

  distances.set(source, 0);
  parents.set(source, null);

  // Queue implemented as an array + head index to keep dequeue O(1).
  const queue = [source];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    order.push(current);

    for (const { to } of graph.getNeighbors(current)) {
      if (distances.get(to) === Infinity) {
        distances.set(to, distances.get(current) + 1);
        parents.set(to, current);
        queue.push(to);
      }
    }
  }

  return { order, distances, parents };
}

/**
 * Shortest-path distances from a source as a plain object.
 * Convenience wrapper around bfs() used by closeness centrality.
 */
export function bfsDistances(graph, source) {
  const { distances } = bfs(graph, source);
  const result = {};
  for (const [vertex, dist] of distances.entries()) {
    result[vertex] = dist;
  }
  return result;
}

/**
 * Reconstruct the shortest path from source to target using BFS parents.
 * Returns an array of vertices, or [] if target is unreachable.
 */
export function shortestPath(graph, source, target) {
  const { parents, distances } = bfs(graph, source);
  if (!distances.has(target) || distances.get(target) === Infinity) return [];

  const path = [];
  let node = target;
  while (node !== null && node !== undefined) {
    path.push(node);
    node = parents.get(node);
  }
  return path.reverse();
}

/**
 * Iterative depth-first search from a source using an explicit stack.
 *
 * @returns {{ order: Array, visited: Set }}
 */
export function dfs(graph, source, visited = new Set()) {
  const order = [];
  if (!graph.getVertices().includes(source)) {
    return { order, visited };
  }

  const stack = [source];
  while (stack.length > 0) {
    const current = stack.pop();
    if (visited.has(current)) continue;

    visited.add(current);
    order.push(current);

    // Push neighbors in reverse so traversal visits them in listed order.
    const neighbors = graph.getNeighbors(current);
    for (let i = neighbors.length - 1; i >= 0; i--) {
      const next = neighbors[i].to;
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }

  return { order, visited };
}

/**
 * Recursive DFS that collects every vertex reachable from `source` into
 * `component`. Mutates the shared `visited` set. Used by connectedComponents.
 */
export function dfsCollect(graph, source, visited, component) {
  visited.add(source);
  component.push(source);

  for (const { to } of graph.getNeighbors(source)) {
    if (!visited.has(to)) {
      dfsCollect(graph, to, visited, component);
    }
  }

  return component;
}

/**
 * Reachability profile from a source: what fraction of the rest of the network
 * is reachable, and within how many hops. Used to express "blast radius" in
 * plain terms ("reaches 82% of assets within 2 hops").
 *
 * @returns {{ within: Object<number, number>, reachableFraction: number, maxHops: number }}
 */
export function reachabilityProfile(graph, source, maxHops = 3) {
  const { distances } = bfs(graph, source);
  const total = graph.getVertexCount() - 1;
  const within = {};

  for (let h = 1; h <= maxHops; h++) {
    let count = 0;
    for (const d of distances.values()) {
      if (d >= 1 && d <= h) count++;
    }
    within[h] = total > 0 ? count / total : 0;
  }

  let reachable = 0;
  for (const d of distances.values()) {
    if (d !== Infinity && d >= 1) reachable++;
  }

  return {
    within,
    reachableFraction: total > 0 ? reachable / total : 0,
    maxHops,
  };
}

export default { bfs, bfsDistances, shortestPath, dfs, dfsCollect, reachabilityProfile };
