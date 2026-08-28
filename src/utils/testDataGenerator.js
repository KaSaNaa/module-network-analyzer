/**
 * testDataGenerator - build graphs for correctness tests and benchmarking.
 *
 * All generators return a Graph instance (undirected by default).
 */
import Graph from '../data-structures/Graph';

/**
 * Deterministic pseudo-random number generator (mulberry32).
 * Lets benchmarks be reproducible across runs.
 */
export function makeRng(seed = 42) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vertexLabel = (i) => `N${i}`;

/**
 * Erdos-Renyi style random graph.
 * @param {number} nodeCount
 * @param {number} edgeProbability  probability an edge exists between any pair
 * @param {object} options { directed, seed }
 */
export function generateRandomGraph(nodeCount, edgeProbability = 0.1, options = {}) {
  const { directed = false, seed = 42 } = options;
  const rng = makeRng(seed);
  const graph = new Graph(directed);

  for (let i = 0; i < nodeCount; i++) {
    graph.addVertex(vertexLabel(i));
  }

  for (let i = 0; i < nodeCount; i++) {
    for (let j = directed ? 0 : i + 1; j < nodeCount; j++) {
      if (i === j) continue;
      if (rng() < edgeProbability) {
        graph.addEdge(vertexLabel(i), vertexLabel(j));
      }
    }
  }

  return graph;
}

/**
 * Random graph with a fixed number of edges (good for controlling density
 * when benchmarking sparse graphs at large V).
 */
export function generateSparseGraph(nodeCount, edgeCount, options = {}) {
  const { directed = false, seed = 42 } = options;
  const rng = makeRng(seed);
  const graph = new Graph(directed);

  for (let i = 0; i < nodeCount; i++) {
    graph.addVertex(vertexLabel(i));
  }

  let added = 0;
  const maxEdges = directed
    ? nodeCount * (nodeCount - 1)
    : (nodeCount * (nodeCount - 1)) / 2;
  const target = Math.min(edgeCount, maxEdges);
  const seen = new Set();

  while (added < target) {
    const a = Math.floor(rng() * nodeCount);
    const b = Math.floor(rng() * nodeCount);
    if (a === b) continue;
    const key = directed ? `${a} ${b}` : [a, b].sort((x, y) => x - y).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    graph.addEdge(vertexLabel(a), vertexLabel(b));
    added++;
  }

  return graph;
}

/**
 * A graph made of `clusterCount` roughly equal connected components, each an
 * internally dense random cluster. Useful for testing connected components.
 */
export function generateClusteredGraph(nodeCount, clusterCount = 3, options = {}) {
  const { seed = 42, intraProbability = 0.4 } = options;
  const rng = makeRng(seed);
  const graph = new Graph(false);

  for (let i = 0; i < nodeCount; i++) {
    graph.addVertex(vertexLabel(i));
  }

  const clusterOf = (i) => i % clusterCount;

  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      if (clusterOf(i) === clusterOf(j) && rng() < intraProbability) {
        graph.addEdge(vertexLabel(i), vertexLabel(j));
      }
    }
  }

  // Guarantee each cluster is internally connected with a spine.
  const perCluster = {};
  for (let i = 0; i < nodeCount; i++) {
    const c = clusterOf(i);
    if (perCluster[c] !== undefined) {
      graph.addEdge(vertexLabel(perCluster[c]), vertexLabel(i));
    }
    perCluster[c] = i;
  }

  return graph;
}

/**
 * A single path: N0 - N1 - N2 - ... (worst case diameter).
 */
export function generatePathGraph(nodeCount) {
  const graph = new Graph(false);
  graph.addVertex(vertexLabel(0));
  for (let i = 1; i < nodeCount; i++) {
    graph.addEdge(vertexLabel(i - 1), vertexLabel(i));
  }
  return graph;
}

/**
 * A star: one hub connected to every other node.
 */
export function generateStarGraph(nodeCount) {
  const graph = new Graph(false);
  graph.addVertex(vertexLabel(0));
  for (let i = 1; i < nodeCount; i++) {
    graph.addEdge(vertexLabel(0), vertexLabel(i));
  }
  return graph;
}

/**
 * Fully connected graph (dense worst case).
 */
export function generateCompleteGraph(nodeCount) {
  const graph = new Graph(false);
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      graph.addEdge(vertexLabel(i), vertexLabel(j));
    }
  }
  return graph;
}

/**
 * Small hand-checkable example used across unit tests.
 *
 *   A - B
 *   |   |
 *   C - D        E - F   (second component)
 */
export function generateSampleGraph() {
  const graph = new Graph(false);
  graph.addEdge('A', 'B');
  graph.addEdge('A', 'C');
  graph.addEdge('B', 'D');
  graph.addEdge('C', 'D');
  graph.addEdge('E', 'F');
  return graph;
}

/**
 * Named preset datasets keyed for the UI dropdown.
 */
export const PRESETS = {
  sample: {
    label: 'Sample (6 nodes, 2 components)',
    build: () => generateSampleGraph(),
  },
  smallRandom: {
    label: 'Small random (15 nodes)',
    build: () => generateRandomGraph(15, 0.2, { seed: 7 }),
  },
  clustered: {
    label: 'Clustered (30 nodes, 3 groups)',
    build: () => generateClusteredGraph(30, 3, { seed: 11 }),
  },
  star: {
    label: 'Star (12 nodes)',
    build: () => generateStarGraph(12),
  },
  path: {
    label: 'Path (12 nodes)',
    build: () => generatePathGraph(12),
  },
};

export default {
  generateRandomGraph,
  generateSparseGraph,
  generateClusteredGraph,
  generatePathGraph,
  generateStarGraph,
  generateCompleteGraph,
  generateSampleGraph,
  PRESETS,
};
