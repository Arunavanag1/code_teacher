/**
 * Dependency graph
 * In-memory graph structure built from the Dependency Mapper agent's output.
 * Supports impact scoring, centrality, bottleneck detection, and clustering.
 */
import type { FileInfo } from './file-discovery.js';
export interface GraphNode {
    id: string;
    type: 'file' | 'function' | 'class' | 'module';
    metadata: {
        language: string;
        lineCount: number;
        exportedSymbols: string[];
    };
}
export interface Edge {
    source: string;
    target: string;
    type: 'imports' | 'calls' | 'extends' | 'implements' | 'uses';
    weight: number;
}
export interface DependencyGraph {
    nodes: Map<string, GraphNode>;
    edges: Edge[];
}
export declare function createGraph(): DependencyGraph;
/**
 * Builds a DependencyGraph from the dependency mapper agent's JSON output.
 *
 * The mapper output is expected to have:
 *   - nodes: Array of { id, type, exportedSymbols, fanIn, fanOut, couplingDepth, centrality }
 *   - edges: Array of { source, target, type, weight }
 *
 * Language and lineCount are populated from the FileInfo list (not from the LLM),
 * since the LLM cannot reliably report these values.
 *
 * @param mapperOutput - The parsed JSON output from the dependency mapper agent
 * @param files - The FileInfo list from file discovery (used for language and lineCount)
 * @returns A populated DependencyGraph
 */
export declare function buildGraph(mapperOutput: Record<string, unknown>, files: FileInfo[]): DependencyGraph;
/**
 * Calculates how many nodes are reachable downstream from the given node.
 * Uses BFS following directed edges (source -> target).
 * Returns a normalized score from 0 to 10.
 *
 * Score formula: (reachableCount / (totalNodes - 1)) * 10
 * A node that can reach every other node scores 10.
 * A leaf node with no outgoing edges scores 0.
 *
 * Algorithm: O(V + E) -- standard BFS.
 */
export declare function getImpactScore(graph: DependencyGraph, nodeId: string): number;
/**
 * Approximates betweenness centrality using weighted in-degree + out-degree.
 *
 * True betweenness centrality is O(V*E) (Brandes algorithm). For a CLI tool
 * analyzing typical codebases (50-500 files), an in/out-degree approximation
 * is sufficient and much faster.
 *
 * Formula: centrality = (fanIn * w_in + fanOut * w_out) / (maxFanIn * w_in + maxFanOut * w_out) * 10
 * Where w_in = 0.6 (being depended on is more central) and w_out = 0.4.
 *
 * This gives higher scores to nodes that are both widely depended upon and
 * depend on many others (true hubs), while still recognizing pure sinks
 * (high fan-in, low fan-out) as important.
 *
 * Algorithm: O(E) -- one pass to count in/out degrees, then O(V) to find max.
 */
export declare function getCentrality(graph: DependencyGraph, nodeId: string): number;
/**
 * Finds bottleneck nodes (articulation points) -- nodes whose removal would
 * disconnect the graph into separate components.
 *
 * Uses Tarjan's articulation point algorithm on the undirected version of
 * the dependency graph. A node u is an articulation point if:
 *   - u is the DFS root AND has 2+ children in the DFS tree, OR
 *   - u is NOT the root AND has a child v where low[v] >= disc[u]
 *
 * Algorithm: O(V + E) -- single DFS pass (iterative to avoid stack overflow).
 */
export declare function getBottlenecks(graph: DependencyGraph): string[];
/**
 * Returns the tightly-coupled cluster (connected component) containing the given node.
 * Uses undirected BFS -- treats all directed edges as bidirectional to find the
 * full set of nodes reachable from nodeId when direction is ignored.
 *
 * Nodes in the same connected component are structurally related:
 * they share direct or transitive dependencies regardless of direction.
 *
 * Algorithm: O(V + E) -- standard BFS on undirected adjacency.
 */
export declare function getCluster(graph: DependencyGraph, nodeId: string): string[];
/**
 * Returns node IDs with zero in-degree (no incoming edges).
 * Entry points are files that nothing else depends on -- typically main/index files,
 * CLI entry points, or test files.
 *
 * Algorithm: O(E) -- iterate all edges to build in-degree counts,
 * then return nodes with count 0.
 */
export declare function getEntryPoints(graph: DependencyGraph): string[];
//# sourceMappingURL=dependency-graph.d.ts.map