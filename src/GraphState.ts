type NodeBase = {
    id: string;
    index: number;
    x: number;
    y: number;
    fx: number;
    fy: number;
    vx: number;
    vy: number;
}

type EdgeBase = {
    id: string;
    index: number;
}

type Node = NodeBase & {
    name?: string;
    data?: any;
    [key: string]: any;
}

interface IGraphState {
    nodes: Node[],
    edges: []
}

const GraphState: IGraphState = {
    nodes: [],
    edges: []
}

function addNode(node: any) {
    GraphState.nodes.push(node);
}

function addEdge(edge: any) {
    GraphState.edges.push(edge);
}

function removeNode(nodeId: string) {
    GraphState.nodes = GraphState.nodes.filter((node: any) => node.id !== nodeId);
}

function removeEdge(edgeId: string) {
    GraphState.edges = GraphState.edges.filter((edge: any) => edge.id !== edgeId);
}

function clearGraph() {
    GraphState.nodes = [];
    GraphState.edges = [];
}

function getGraph() {
    return GraphState;
}

export {
    addNode,
    addEdge,
    removeNode,
    removeEdge,
    clearGraph,
    getGraph
}