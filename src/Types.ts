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
    selectionRadius: number;
    [key: string]: any;
};

// Properties that D3 simulation will add/manage for nodes
interface SimulationNodeData {
    index?: number; // D3 assigns this
    x?: number;     // D3 assigns this
    y?: number;     // D3 assigns this
    vx?: number;    // D3 assigns this
    vy?: number;    // D3 assigns this
    fx?: number | null; // Can be set by user or D3
    fy?: number | null; // Can be set by user or D3
}

// Properties that D3 simulation will use/manage for links
// N is the type of the node, which itself includes SimulationNodeData
interface SimulationLinkData<N extends SimulationNodeData> {
    index?: number;               // D3 assigns this
    source: string | N;           // Must be node ID or node object
    target: string | N;           // Must be node ID or node object
}

// Application-specific node data
type AppSpecificNode<T> = {
    id: string; // Mandatory for identification
    name?: string;
    data?: T;
    [key: string]: any; // Allow other custom properties
}

// Application-specific edge data
type AppSpecificEdge<K> = {
    id: string; // Mandatory for identification
    name?: string;
    data?: K;
    [key: string]: any; // Allow other custom properties
}

// Final Node type: combines app-specific data with D3 simulation data
type Node<T> = AppSpecificNode<T> & SimulationNodeData;

// Final Edge type: combines app-specific data with D3 simulation data
// It refers to Node<any> because links connect generic nodes in the simulation context
type Edge<K> = AppSpecificEdge<K> & SimulationLinkData<Node<any>>;

// Exporting NodeBase for use in ForceGraph.tsx if needed for casting
// It represents the core D3 properties on a node object within the simulation
type NodeBase = SimulationNodeData & { id: string };


export type {
    GraphOptions,
    Node,
    NodeBase, // Exporting this for internal casting if necessary
    Edge,
    SimulationNodeData, // Exporting for clarity or advanced use
    SimulationLinkData  // Exporting for clarity or advanced use
}
