/**
 * Algorithm 3: Connected Components (DFS-based)
 *
 * Partitions the vertices of an undirected graph into maximal groups where
 * every pair of vertices is connected by some path.
 *
 * Approach:
 *   - keep a global visited set
 *   - for every unvisited vertex, run DFS to collect its whole component
 *
 * Time Complexity:  O(V + E)   (each vertex and edge examined once)
 * Space Complexity: O(V)       (visited set + recursion stack)
 */
import { dfsCollect } from './helpers/traversal';

/**
 * @param {Graph} graph
 * @returns {Array<Array<string>>} list of components, each an array of vertices
 */
export function findConnectedComponents(graph) {
  const visited = new Set();
  const components = [];

  for (const vertex of graph.getVertices()) {
    if (!visited.has(vertex)) {
      const component = [];
      dfsCollect(graph, vertex, visited, component);
      components.push(component);
    }
  }

  // Largest component first for stable, useful ordering.
  components.sort((a, b) => b.length - a.length);
  return components;
}

/**
 * True if the whole graph is a single connected component.
 */
export function isConnected(graph) {
  if (graph.getVertexCount() === 0) return true;
  return findConnectedComponents(graph).length === 1;
}

/**
 * Map of vertex -> component index (0 = largest component).
 * Handy for coloring nodes in the visualizer.
 */
export function componentLabels(graph) {
  const components = findConnectedComponents(graph);
  const labels = {};
  components.forEach((component, index) => {
    component.forEach((vertex) => {
      labels[vertex] = index;
    });
  });
  return labels;
}

/**
 * Summary statistics about the component structure.
 */
export function analyzeComponents(graph) {
  const components = findConnectedComponents(graph);
  const sizes = components.map((c) => c.length);
  return {
    count: components.length,
    sizes,
    largest: sizes[0] || 0,
    smallest: sizes[sizes.length - 1] || 0,
    isConnected: components.length <= 1,
    components,
  };
}

export default findConnectedComponents;
