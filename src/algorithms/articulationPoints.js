/**
 * Articulation Points & Bridges (Tarjan / Hopcroft-Tarjan)
 *
 * An articulation point ("cut vertex") is a node whose removal increases the
 * number of connected components — i.e. a single point of failure. A bridge is
 * the edge equivalent.
 *
 * For an IT network these are the assets/links whose failure splits the
 * network into isolated islands.
 *
 * Time Complexity:  O(V + E)  (single DFS, discovery + low-link times)
 * Space Complexity: O(V)
 */
import Graph from '../data-structures/Graph';
import { findConnectedComponents } from './connectedComponents';

/**
 * @param {Graph} graph  undirected graph
 * @returns {{ articulationPoints: string[], bridges: Array<{from,to}> }}
 */
export function findArticulationPointsAndBridges(graph) {
  const disc = new Map();
  const low = new Map();
  const visited = new Set();
  const articulation = new Set();
  const bridges = [];
  let timer = 0;

  const dfs = (u, parent) => {
    visited.add(u);
    disc.set(u, timer);
    low.set(u, timer);
    timer++;
    let childCount = 0;
    let skippedParent = false;

    for (const { to: v } of graph.getNeighbors(u)) {
      if (v === parent && !skippedParent) {
        // Ignore the edge we came in on (once, in case of parallel edges).
        skippedParent = true;
        continue;
      }
      if (visited.has(v)) {
        low.set(u, Math.min(low.get(u), disc.get(v)));
      } else {
        childCount++;
        dfs(v, u);
        low.set(u, Math.min(low.get(u), low.get(v)));

        if (parent !== null && low.get(v) >= disc.get(u)) {
          articulation.add(u);
        }
        if (low.get(v) > disc.get(u)) {
          bridges.push({ from: u, to: v });
        }
      }
    }

    if (parent === null && childCount > 1) {
      articulation.add(u);
    }
  };

  for (const vertex of graph.getVertices()) {
    if (!visited.has(vertex)) {
      dfs(vertex, null);
    }
  }

  return { articulationPoints: Array.from(articulation), bridges };
}

/** Convenience: just the articulation points. */
export function findArticulationPoints(graph) {
  return findArticulationPointsAndBridges(graph).articulationPoints;
}

/**
 * Copy of the graph with one vertex (and its incident edges) removed.
 */
function withoutVertex(graph, vertex) {
  const copy = new Graph(graph.isDirected);
  for (const v of graph.getVertices()) {
    if (v !== vertex) copy.addVertex(v);
  }
  for (const { from, to } of graph.getEdges()) {
    if (from !== vertex && to !== vertex) copy.addEdge(from, to);
  }
  return copy;
}

/**
 * For every articulation point, quantify the damage its removal causes:
 * how many assets end up cut off and into how many islands.
 *
 * Time: O(P * (V + E)) where P = number of articulation points.
 *
 * @returns {Array<{
 *   vertex: string,
 *   resultingComponents: number,
 *   componentSizes: number[],
 *   isolatedAssets: number,          assets no longer in the largest island
 *   isolatedGroups: number,
 *   isolatedVertices: string[],
 * }>}
 */
export function articulationImpact(graph) {
  const { articulationPoints } = findArticulationPointsAndBridges(graph);

  return articulationPoints
    .map((vertex) => {
      const reduced = withoutVertex(graph, vertex);
      const components = findConnectedComponents(reduced).filter((c) => c.length > 0);
      const sizes = components.map((c) => c.length).sort((a, b) => b - a);
      // Treat every island except the largest as "isolated".
      const isolatedVertices = components
        .slice(1)
        .reduce((acc, c) => acc.concat(c), []);

      return {
        vertex,
        resultingComponents: components.length,
        componentSizes: sizes,
        isolatedAssets: isolatedVertices.length,
        isolatedGroups: Math.max(0, components.length - 1),
        isolatedVertices,
      };
    })
    .sort((a, b) => b.isolatedAssets - a.isolatedAssets);
}

export default findArticulationPoints;
