/**
 * benchmark.js - measure execution time and scalability of the three
 * network-analysis algorithms.
 *
 * Can be run in the browser console or under Node:
 *
 *   import { runBenchmarkSuite } from './analysis/benchmark';
 *   console.table(runBenchmarkSuite());
 *
 * Complexity being verified:
 *   Degree Centrality      O(V)
 *   Connected Components   O(V + E)
 *   Closeness Centrality   O(V^2 + V*E)
 */
import { generateSparseGraph, generateRandomGraph } from '../utils/testDataGenerator';
import calculateDegreeCentrality from '../algorithms/degreeCentrality';
import calculateClosenessCentrality from '../algorithms/closenessCentrality';
import findConnectedComponents from '../algorithms/connectedComponents';
import { findArticulationPoints } from '../algorithms/articulationPoints';

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Run `fn` `repeats` times and return the mean wall-clock time in ms.
 */
export function time(fn, repeats = 3) {
  // Warm-up pass (JIT).
  fn();
  let total = 0;
  for (let i = 0; i < repeats; i++) {
    const start = now();
    fn();
    total += now() - start;
  }
  return total / repeats;
}

/**
 * Benchmark all three algorithms on a single graph.
 * @returns {{ V, E, degreeMs, componentsMs, closenessMs }}
 */
export function benchmarkGraph(graph, repeats = 3) {
  return {
    V: graph.getVertexCount(),
    E: graph.getEdgeCount(),
    degreeMs: time(() => calculateDegreeCentrality(graph), repeats),
    componentsMs: time(() => findConnectedComponents(graph), repeats),
    articulationMs: time(() => findArticulationPoints(graph), repeats),
    closenessMs: time(() => calculateClosenessCentrality(graph), repeats),
  };
}

/**
 * Scalability sweep: sparse graphs (E ~= 4V) at increasing sizes.
 * @param {number[]} sizes vertex counts to test
 */
export function scalabilitySweep(
  sizes = [10, 50, 100, 200, 400, 800],
  { avgDegree = 4, repeats = 3 } = {}
) {
  return sizes.map((n) => {
    const graph = generateSparseGraph(n, Math.round((n * avgDegree) / 2), { seed: 99 });
    return benchmarkGraph(graph, repeats);
  });
}

/**
 * Density sweep: fixed V, increasing edge probability.
 */
export function densitySweep(
  vertexCount = 150,
  probabilities = [0.02, 0.05, 0.1, 0.2, 0.4],
  { repeats = 3 } = {}
) {
  return probabilities.map((p) => {
    const graph = generateRandomGraph(vertexCount, p, { seed: 123 });
    return { probability: p, ...benchmarkGraph(graph, repeats) };
  });
}

/**
 * Full suite combining the scalability and density experiments.
 */
export function runBenchmarkSuite(options = {}) {
  return {
    scalability: scalabilitySweep(options.sizes, options),
    density: densitySweep(options.vertexCount, options.probabilities, options),
  };
}

/**
 * Pretty-print the suite to the console.
 */
export function printBenchmarkSuite(options = {}) {
  const suite = runBenchmarkSuite(options);
  /* eslint-disable no-console */
  console.log('\n=== Scalability (E ~= 4V) ===');
  console.table(
    suite.scalability.map((r) => ({
      V: r.V,
      E: r.E,
      'degree (ms)': r.degreeMs.toFixed(4),
      'components (ms)': r.componentsMs.toFixed(4),
      'articulation (ms)': r.articulationMs.toFixed(4),
      'closeness (ms)': r.closenessMs.toFixed(4),
    }))
  );

  console.log('\n=== Density sweep (V fixed) ===');
  console.table(
    suite.density.map((r) => ({
      p: r.probability,
      V: r.V,
      E: r.E,
      'degree (ms)': r.degreeMs.toFixed(4),
      'components (ms)': r.componentsMs.toFixed(4),
      'articulation (ms)': r.articulationMs.toFixed(4),
      'closeness (ms)': r.closenessMs.toFixed(4),
    }))
  );
  /* eslint-enable no-console */
  return suite;
}

export default runBenchmarkSuite;

// Allow `node src/analysis/benchmark.js` style execution.
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  printBenchmarkSuite();
}
