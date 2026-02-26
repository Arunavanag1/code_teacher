/**
 * Dependency graph
 * In-memory graph structure built from the Dependency Mapper agent's output.
 * Supports impact scoring, centrality, bottleneck detection, and clustering.
 */
/**
 * Infers programming language from file extension.
 * Used to populate GraphNode.metadata.language without asking the LLM.
 */
function inferLanguage(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const langMap = {
        ts: 'TypeScript',
        tsx: 'TypeScript',
        js: 'JavaScript',
        jsx: 'JavaScript',
        py: 'Python',
        go: 'Go',
        rs: 'Rust',
        java: 'Java',
        kt: 'Kotlin',
        rb: 'Ruby',
        php: 'PHP',
        c: 'C',
        cpp: 'C++',
        h: 'C',
        hpp: 'C++',
        cs: 'C#',
        swift: 'Swift',
        scala: 'Scala',
        md: 'Markdown',
        json: 'JSON',
        yaml: 'YAML',
        yml: 'YAML',
        toml: 'TOML',
        sql: 'SQL',
        sh: 'Shell',
        bash: 'Shell',
    };
    return langMap[ext] ?? 'Unknown';
}
/** Type guard for valid node types */
function isValidNodeType(t) {
    return t === 'file' || t === 'function' || t === 'class' || t === 'module';
}
/** Type guard for valid edge types */
function isValidEdgeType(t) {
    return t === 'imports' || t === 'calls' || t === 'extends' || t === 'implements' || t === 'uses';
}
export function createGraph() {
    return { nodes: new Map(), edges: [] };
}
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
export function buildGraph(mapperOutput, files) {
    const graph = createGraph();
    // Helper to find FileInfo by relative path (match suffix of absolute path)
    function findFileInfo(relPath) {
        for (const file of files) {
            if (file.path.endsWith('/' + relPath) || file.path === relPath) {
                return file;
            }
        }
        return undefined;
    }
    // Parse nodes from mapper output
    const rawNodes = Array.isArray(mapperOutput.nodes) ? mapperOutput.nodes : [];
    for (const raw of rawNodes) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const node = raw;
        const id = typeof node.id === 'string' ? node.id : '';
        if (!id)
            continue;
        const fileInfo = findFileInfo(id);
        const graphNode = {
            id,
            type: isValidNodeType(node.type) ? node.type : 'file',
            metadata: {
                language: fileInfo ? inferLanguage(fileInfo.path) : inferLanguage(id),
                lineCount: fileInfo?.lineCount ?? 0,
                exportedSymbols: Array.isArray(node.exportedSymbols)
                    ? node.exportedSymbols.filter((s) => typeof s === 'string')
                    : [],
            },
        };
        graph.nodes.set(id, graphNode);
    }
    // Parse edges from mapper output
    const rawEdges = Array.isArray(mapperOutput.edges) ? mapperOutput.edges : [];
    for (const raw of rawEdges) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const edgeData = raw;
        const source = typeof edgeData.source === 'string' ? edgeData.source : '';
        const target = typeof edgeData.target === 'string' ? edgeData.target : '';
        if (!source || !target)
            continue;
        const edge = {
            source,
            target,
            type: isValidEdgeType(edgeData.type) ? edgeData.type : 'imports',
            weight: typeof edgeData.weight === 'number' ? edgeData.weight : 5,
        };
        graph.edges.push(edge);
    }
    return graph;
}
/**
 * Builds a DependencyGraph from statically parsed import data.
 * Used by the static import parser (P1) as an alternative to LLM-based mapping.
 *
 * @param nodes - Map of node ID to GraphNode from static analysis
 * @param edges - Edge array from static import parsing
 * @returns A populated DependencyGraph
 */
export function buildGraphFromStatic(nodes, edges) {
    return { nodes, edges };
}
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
export function getImpactScore(graph, nodeId) {
    if (!graph.nodes.has(nodeId))
        return 0;
    const totalNodes = graph.nodes.size;
    if (totalNodes <= 1)
        return 0;
    // Build directed adjacency list (source -> [targets])
    const adjacency = new Map();
    for (const edge of graph.edges) {
        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, []);
        }
        adjacency.get(edge.source).push(edge.target);
    }
    // BFS from nodeId
    const visited = new Set();
    const queue = [nodeId];
    visited.add(nodeId);
    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = adjacency.get(current) ?? [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    // Reachable count excludes the start node itself
    const reachableCount = visited.size - 1;
    // Normalize to 0-10 scale
    const score = (reachableCount / (totalNodes - 1)) * 10;
    return Math.round(score * 10) / 10; // Round to 1 decimal place
}
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
export function getCentrality(graph, nodeId) {
    if (!graph.nodes.has(nodeId))
        return 0;
    if (graph.nodes.size === 0)
        return 0;
    const W_IN = 0.6;
    const W_OUT = 0.4;
    // Count in-degree and out-degree for all nodes
    const inDegree = new Map();
    const outDegree = new Map();
    for (const id of graph.nodes.keys()) {
        inDegree.set(id, 0);
        outDegree.set(id, 0);
    }
    for (const edge of graph.edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
        outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    }
    // Find max in-degree and max out-degree across all nodes
    let maxIn = 0;
    let maxOut = 0;
    for (const id of graph.nodes.keys()) {
        maxIn = Math.max(maxIn, inDegree.get(id) ?? 0);
        maxOut = Math.max(maxOut, outDegree.get(id) ?? 0);
    }
    // If there are no edges, everyone has centrality 0
    const maxWeighted = maxIn * W_IN + maxOut * W_OUT;
    if (maxWeighted === 0)
        return 0;
    // Compute centrality for the target node
    const nodeIn = inDegree.get(nodeId) ?? 0;
    const nodeOut = outDegree.get(nodeId) ?? 0;
    const nodeWeighted = nodeIn * W_IN + nodeOut * W_OUT;
    const score = (nodeWeighted / maxWeighted) * 10;
    return Math.round(score * 10) / 10; // Round to 1 decimal place
}
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
export function getBottlenecks(graph) {
    if (graph.nodes.size === 0)
        return [];
    // Build undirected adjacency list
    const undirected = new Map();
    for (const id of graph.nodes.keys()) {
        undirected.set(id, new Set());
    }
    for (const edge of graph.edges) {
        undirected.get(edge.source)?.add(edge.target);
        undirected.get(edge.target)?.add(edge.source);
    }
    const disc = new Map(); // Discovery time
    const low = new Map(); // Lowest discovery time reachable
    const parent = new Map(); // Parent in DFS tree
    const articulationPoints = new Set();
    let timer = 0;
    /**
     * Iterative DFS using an explicit stack to avoid stack overflow on large graphs.
     */
    function dfs(startNode) {
        disc.set(startNode, timer);
        low.set(startNode, timer);
        timer++;
        parent.set(startNode, null);
        const stack = [
            {
                node: startNode,
                neighbors: [...(undirected.get(startNode) ?? [])],
                idx: 0,
                childCount: 0,
            },
        ];
        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            const u = frame.node;
            if (frame.idx < frame.neighbors.length) {
                const v = frame.neighbors[frame.idx];
                frame.idx++;
                if (!disc.has(v)) {
                    // Tree edge: v is unvisited
                    parent.set(v, u);
                    disc.set(v, timer);
                    low.set(v, timer);
                    timer++;
                    frame.childCount++;
                    stack.push({
                        node: v,
                        neighbors: [...(undirected.get(v) ?? [])],
                        idx: 0,
                        childCount: 0,
                    });
                }
                else if (v !== parent.get(u)) {
                    // Back edge: update low[u]
                    low.set(u, Math.min(low.get(u), disc.get(v)));
                }
            }
            else {
                // All neighbors of u processed -- pop and update parent
                stack.pop();
                if (stack.length > 0) {
                    const parentFrame = stack[stack.length - 1];
                    const p = parentFrame.node;
                    // Update low[p] from low[u]
                    low.set(p, Math.min(low.get(p), low.get(u)));
                    // Check articulation point condition for p
                    // p is NOT root: if low[u] >= disc[p], then p is an AP
                    if (parent.get(p) !== null && low.get(u) >= disc.get(p)) {
                        articulationPoints.add(p);
                    }
                }
                else {
                    // u is the root: it's an AP if it has 2+ children in DFS tree
                    if (frame.childCount >= 2) {
                        articulationPoints.add(u);
                    }
                }
            }
        }
    }
    // Run DFS from all unvisited nodes (handles disconnected components)
    for (const nodeId of graph.nodes.keys()) {
        if (!disc.has(nodeId)) {
            dfs(nodeId);
        }
    }
    return [...articulationPoints];
}
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
export function getCluster(graph, nodeId) {
    if (!graph.nodes.has(nodeId))
        return [];
    // Build undirected adjacency list (both directions for each edge)
    const undirected = new Map();
    for (const id of graph.nodes.keys()) {
        undirected.set(id, new Set());
    }
    for (const edge of graph.edges) {
        undirected.get(edge.source)?.add(edge.target);
        undirected.get(edge.target)?.add(edge.source);
    }
    // BFS from nodeId in undirected graph
    const visited = new Set();
    const queue = [nodeId];
    visited.add(nodeId);
    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = undirected.get(current) ?? new Set();
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return [...visited];
}
/**
 * Returns node IDs with zero in-degree (no incoming edges).
 * Entry points are files that nothing else depends on -- typically main/index files,
 * CLI entry points, or test files.
 *
 * Algorithm: O(E) -- iterate all edges to build in-degree counts,
 * then return nodes with count 0.
 */
export function getEntryPoints(graph) {
    // Build in-degree map (all nodes start at 0)
    const inDegree = new Map();
    for (const nodeId of graph.nodes.keys()) {
        inDegree.set(nodeId, 0);
    }
    // Count incoming edges for each target
    for (const edge of graph.edges) {
        const current = inDegree.get(edge.target) ?? 0;
        inDegree.set(edge.target, current + 1);
    }
    // Collect nodes with zero in-degree
    const entryPoints = [];
    for (const [nodeId, degree] of inDegree) {
        if (degree === 0) {
            entryPoints.push(nodeId);
        }
    }
    return entryPoints;
}
//# sourceMappingURL=dependency-graph.js.map