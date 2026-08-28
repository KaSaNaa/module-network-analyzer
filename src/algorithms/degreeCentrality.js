/**
 * Algorithm 1: Degree Centrality
 *
 * Importance of a node measured by how many direct connections it has.
 * The score is normalized to [0, 1] by dividing by the maximum possible
 * degree (V - 1).
 *
 * Time Complexity:  O(V)   (one pass over the vertices; degree is O(1))
 * Space Complexity: O(V)
 */

/**
 * @param {Graph} graph
 * @returns {Object<string, number>} vertex -> normalized degree centrality
 */
export function calculateDegreeCentrality(graph) {
  const centrality = {};
  const maxDegree = graph.getVertexCount() - 1;

  for (const vertex of graph.getVertices()) {
    const degree = graph.getNeighbors(vertex).length;
    centrality[vertex] = maxDegree > 0 ? degree / maxDegree : 0;
  }

  return centrality;
}

/**
 * Raw (un-normalized) degree per vertex.
 * @returns {Object<string, number>}
 */
export function calculateRawDegree(graph) {
  const degrees = {};
  for (const vertex of graph.getVertices()) {
    degrees[vertex] = graph.getNeighbors(vertex).length;
  }
  return degrees;
}

/**
 * Vertices sorted by centrality, descending.
 * @returns {Array<{ vertex: string, score: number }>}
 */
export function rankByDegreeCentrality(graph) {
  const centrality = calculateDegreeCentrality(graph);
  return Object.entries(centrality)
    .map(([vertex, score]) => ({ vertex, score }))
    .sort((a, b) => b.score - a.score);
}

export default calculateDegreeCentrality;
