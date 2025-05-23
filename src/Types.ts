/* eslint-disable @typescript-eslint/no-explicit-any */

type GraphOptions = {
    nodeRadius: number;
    linkDistance: number;
    chargeStrength: number;
    nodeColor: string;
    highlightColor: string;
    linkColor: string;
    linkStrokeWidth: number;
    highlightLinkColor: string;
    highlightLinkStrokeWidth: number;
    textColor: string;
    textFontSize: number;
    backgroundColor: string;
    minZoom: number;
    maxZoom: number;
    tapThreshold: number;
    tapTimeout: number;
    [key: string]: any;
};

type NodeBase = {
    id: string;
    index: number;
    x: number;
    y: number;
    fx: number | null;
    fy: number | null;
    vx: number;
    vy: number;
}

type EdgeBase = {
    id: string;
    index: number;
    source: NodeBase | string;
    target: NodeBase | string;
}

type Edge<K> = Partial<EdgeBase> & {
    id: string;
    name?: string;
    data?: K;
    [key: string]: any;
}

type Node<T> = Partial<NodeBase> & {
    id: string;
    name?: string;
    data?: T;
    [key: string]: any;
}

export type {
    GraphOptions,
    Node,
    NodeBase,
    Edge,
}