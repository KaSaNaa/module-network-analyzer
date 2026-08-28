/**
 * Algorithm 2: Closeness Centrality (BFS-based)
 *
 * A node is "close" if it can reach every other node in few hops.
 * For each vertex we run BFS, sum the shortest-path distances to all
 * reachable vertices, and take:
 *
 *     closeness(v) = (reachableCount) / (sum of distances to reachable nodes)
 *
 * This is the Wasserman-Faust normalization, which behaves sensibly on
 * disconnected graphs (nodes in small components are not unfairly rewarded).
 *
 * Time Complexity:  O(V * (V + E))   (one BFS per vertex)
 * Space Complexity: O(V)
 */
import { bfsDistances } from './helpers/traversal';

/**
 * @param {Graph} graph
 * @returns {Object<string, number>} vertex -> closeness centrality
 */
export function calculateClosenessCentrality(graph) {
  const centrality = {};
  const vertices = graph.getVertices();
  const n = vertices.length;

  for (const source of vertices) {
    const distances = bfsDistances(graph, source);

    let sumDistances = 0;
    let reachableCount = 0;

    for (const target of vertices) {
      if (source === target) continue;
      const d = distances[target];
      if (d !== Infinity) {
        sumDistances += d;
        reachableCount++;
      }
    }

    if (reachableCount > 0 && sumDistances > 0) {
      // Wasserman-Faust: scale by the fraction of the graph that is reachable.
      const reachFraction = reachableCount / (n - 1);
      centrality[source] = (reachableCount / sumDistances) * reachFraction;
    } else {
      centrality[source] = 0;
    }
  }

  return centrality;
}

/**
 * Vertices sorted by closeness centrality, descending.
 * @returns {Array<{ vertex: string, score: number }>}
 */
export function rankByClosenessCentrality(graph) {
  const centrality = calculateClosenessCentrality(graph);
  return Object.entries(centrality)
    .map(([vertex, score]) => ({ vertex, score }))
    .sort((a, b) => b.score - a.score);
}

export default calculateClosenessCentrality;
