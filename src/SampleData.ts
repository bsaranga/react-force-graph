import type { Node, Edge } from './Types'; // Adjust import path as needed

type NodeData = {
    [key: string]: any;
}

type EdgeData = {
    [key: string]: any;
}

const NODE_COUNT = 100;
const EDGE_COUNT = 100;

const initialNodes: Node<NodeData>[] = Array.from({ length: NODE_COUNT }, (_, i) => ({
    id: `N${i + 1}`
}));

function getRandomNodeId(): string {
    return `N${Math.floor(Math.random() * NODE_COUNT) + 1}`;
}

const initialLinks: Edge<EdgeData>[] = Array.from({ length: EDGE_COUNT }, (_, i) => {
    let source: string, target: string;
    do {
        source = getRandomNodeId();
        target = getRandomNodeId();
    } while (source === target); // Avoid self-loops
    return {
        id: `edge_${i + 1}`,
        source,
        target
    };
});

export { initialNodes, initialLinks };