import type { Node, Edge } from './Types';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface IGraphState<T = any, K = any> {
    nodes: Node<T>[],
    edges: Edge<K>[]
}

const GraphState: IGraphState = {
    nodes: [],
    edges: []
}

function addNode<T>(node: Node<T>) {
    GraphState.nodes.push(node);
}

function addEdge<K>(edge: Edge<K>) {
    GraphState.edges.push(edge);
}

function removeNode<T = any>(nodeId: string) {
    GraphState.nodes = GraphState.nodes.filter((node: Node<T>) => node.id !== nodeId);
}

function removeEdge<K = any>(edgeId: string) {
    GraphState.edges = GraphState.edges.filter((edge: Edge<K>) => edge.id !== edgeId);
}

function clearGraph() {
    GraphState.nodes = [];
    GraphState.edges = [];
}

function getGraph() {
    return GraphState;
}

export type {
    Node,
    Edge,
}

export {
    addNode,
    addEdge,
    removeNode,
    removeEdge,
    clearGraph,
    getGraph
}