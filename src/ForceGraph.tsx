/* eslint-disable @typescript-eslint/no-explicit-any */

import * as d3 from 'd3';
import "./ForceGraph.css";
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Edge, Node, GraphOptions, NodeBase } from "./Types";

type NodeDragCallbackType = (event: { type: string; nodeId: string; event?: MouseEvent | TouchEvent }) => void;
type NodeClickCallbackType = (node: Node<any> | null, event?: MouseEvent | TouchEvent) => void;
type LinkClickCallbackType = (link: Edge<any> | null, event?: MouseEvent | TouchEvent) => void;

type NodeData = {
    [key: string]: any;
}

type EdgeData = {
    [key: string]: any;
}

class ForceGraphCanvas<T, K> {
    
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D | null;
    nodes: Node<T>[];
    links: Edge<K>[];
    options: GraphOptions;

    selectedNode: Node<T> | null;
    selectedLink: Edge<K> | null;
    draggingNode: Node<T> | null;
    wasDragging: boolean;
    dpi: number;
    currentTransform: d3.ZoomTransform;
    touchStartPos: { x: number; y: number } | null;
    touchStartTime: number;
    simulation: d3.Simulation<Node<T>, Edge<K>> | null;
    zoomBehavior: d3.ZoomBehavior<Element, unknown> | null;

    onNodeDragCallback: NodeDragCallbackType | null;
    onNodeClickCallback: NodeClickCallbackType | null;
    onLinkClickCallback: LinkClickCallbackType | null;

    constructor(canvas: HTMLCanvasElement, initialNodes: Node<T>[] = [], initialLinks: Edge<K>[] = [], options = {}) {

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', {});
        
        this.nodes = JSON.parse(JSON.stringify(initialNodes));
        this.links = JSON.parse(JSON.stringify(initialLinks));

        this.options = {
            nodeRadius: 8,
            linkDistance: 80,
            chargeStrength: -200,
            nodeColor: '#69b3a2',
            highlightColor: '#f06292',
            linkColor: '#999999',
            linkStrokeWidth: 1.5,
            highlightLinkColor: '#f06292',
            highlightLinkStrokeWidth: 2.5,
            textColor: '#333333',
            textFontSize: 10,
            backgroundColor: '#ffffff',
            minZoom: 0.2,
            maxZoom: 4,
            tapThreshold: 5, // Max movement (px) for a touch to be considered a tap
            tapTimeout: 200, // Max time (ms) for a tap
            ...options
        };

        this.simulation = null;
        this.zoomBehavior = null;
        this.selectedNode = null;
        this.selectedLink = null;
        this.draggingNode = null;
        this.wasDragging = false; 
        this.dpi = window.devicePixelRatio || 1;
        this.currentTransform = d3.zoomIdentity;
        this.touchStartPos = null; // For tap detection
        this.touchStartTime = 0;   // For tap detection

        this.onNodeDragCallback = null; // Callback for node drag events
        this.onNodeClickCallback = null; // Callback for node click events
        this.onLinkClickCallback = null; // Callback for link click events

        this._init();
    }

    _init() {
        this._setupCanvas();

        this.simulation = d3.forceSimulation(this.nodes)
            .force("link", d3.forceLink(this.links).id(d => (d as NodeBase).id).distance(this.options.linkDistance))
            .force("charge", d3.forceManyBody().strength(this.options.chargeStrength))
            .force("center", d3.forceCenter(this._getCSSWidth() / 2, this._getCSSHeight() / 2))
            .on("tick", this._draw.bind(this));

        this._setupZoom(); 
        this._setupEventListeners(); 
        this._draw();
    }

    _getCSSWidth() { return this.canvas.width / this.dpi; }
    _getCSSHeight() { return this.canvas.height / this.dpi; }

    _setupCanvas() {
        const container = this.canvas.parentElement;
        if (container != null) {
            const rect = container.getBoundingClientRect();
            this.canvas.width = rect.width * this.dpi;
            this.canvas.height = rect.height * this.dpi;
            this.canvas.style.width = `${rect.width}px`;
            this.canvas.style.height = `${rect.height}px`;
        } else throw new Error("Canvas parent element not found");
    }
    
    _setupZoom() {
        this.zoomBehavior = d3.zoom()
            .scaleExtent([this.options.minZoom, this.options.maxZoom])
            .filter((event) => {
                // Allow zoom if not dragging a node, and it's a primary mouse button or a multi-touch gesture
                if (this.draggingNode) return false;

                if (event.type === "mousedown" && event.button !== 0) return false; // Only primary mouse button
                if (event.type === "touchstart" && event.touches.length > 1) return true; // Allow pinch-zoom

                // For single touchstart or mousedown, check if on a node
                const rect = this.canvas.getBoundingClientRect();
                const clientX = event.type === "touchstart" ? event.touches[0].clientX : event.clientX;
                const clientY = event.type === "touchstart" ? event.touches[0].clientY : event.clientY;
                const rawX = clientX - rect.left;
                const rawY = clientY - rect.top;
                const worldPos = {
                    x: this.currentTransform.invertX(rawX),
                    y: this.currentTransform.invertY(rawY)
                };
                const node = this._getNodeAtPos(worldPos.x, worldPos.y);
                return !node; // If on a node, filter out zoom to allow drag
            })
            .on("zoom", (event) => {
                if (this.draggingNode) return; 
                this.currentTransform = event.transform;
                this._draw();
            });
        
        d3.select(this.canvas).call(this.zoomBehavior as any);
    }

    _setupEventListeners() {
        const canvasEl = d3.select(this.canvas);
        // Mouse events
        canvasEl
            .on("mousedown.drag", this._handleMouseDown.bind(this))
            .on("mousemove.drag", this._handleMouseMove.bind(this))
            .on("mouseup.drag", this._handleMouseUp.bind(this))
            .on("mouseout.drag", this._handleMouseOut.bind(this))
            .on("click.select", this._handleClick.bind(this)); 

        // Touch events
        canvasEl
            .on("touchstart.drag", this._handleTouchStart.bind(this))
            .on("touchmove.drag", this._handleTouchMove.bind(this))
            .on("touchend.drag", this._handleTouchEnd.bind(this))
            .on("touchcancel.drag", this._handleTouchEnd.bind(this)); // Treat cancel like end
    }

    _getPointerPos(event: MouseEvent & TouchEvent, touchIndex = 0) { // Generic for mouse or touch
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;

        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[touchIndex].clientX;
            clientY = event.touches[touchIndex].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) { // For touchend
            clientX = event.changedTouches[touchIndex].clientX;
            clientY = event.changedTouches[touchIndex].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }
        
        const rawX = clientX - rect.left;
        const rawY = clientY - rect.top;
        return {
            screenX: rawX, // Screen coordinates (CSS pixels)
            screenY: rawY,
            worldX: this.currentTransform.invertX(rawX), // World coordinates
            worldY: this.currentTransform.invertY(rawY)
        };
    }


    _getNodeAtPos(worldX: number, worldY: number) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            const dx = worldX - node.x;
            const dy = worldY - node.y;
            const radius = this.options.nodeRadius; 
            if (dx * dx + dy * dy < radius * radius) {
                return node;
            }
        }
        return null;
    }
    
    _getLinkAtPos(worldX: number, worldY: number) {
        const tolerance = 5 / this.currentTransform.k; 
        for (let i = this.links.length - 1; i >= 0; i--) {
            const link = this.links[i];
            if (!link.source || !link.target) continue;
            const p0 = link.source as NodeBase;
            const p1 = link.target as NodeBase;
            const dx = p1.x - p0.x; const dy = p1.y - p0.y;
            const lengthSq = dx * dx + dy * dy;
            if (lengthSq === 0) continue; 
            let t = ((worldX - p0.x) * dx + (worldY - p0.y) * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t)); 
            const closestX = p0.x + t * dx; const closestY = p0.y + t * dy;
            const distSq = (worldX - closestX) * (worldX - closestX) + (worldY - closestY) * (worldY - closestY);
            if (distSq < tolerance * tolerance) return link;
        }
        return null;
    }

    // --- Mouse Event Handlers ---
    _handleMouseDown(event: MouseEvent & TouchEvent) {
        if (event.button !== 0) return; // Only primary button
        const pos = this._getPointerPos(event);
        const node = this._getNodeAtPos(pos.worldX, pos.worldY);

        if (node) {
            // d3.zoom().filter should prevent zoom if on node, so no need to stopPropagation here usually
            this.draggingNode = node;
            this.draggingNode.fx = pos.worldX; 
            this.draggingNode.fy = pos.worldY;
            if (this.simulation) {
                this.simulation.alphaTarget(0.3).restart(); 
                if (this.onNodeDragCallback) {
                    this.onNodeDragCallback({ type: 'start', nodeId: node.id, event });
                }
            } else throw new Error("Simulation not initialized");
        }

        this.wasDragging = false;
    }

    _handleMouseMove(event: MouseEvent & TouchEvent) {
        if (!this.draggingNode) return;
        // event.preventDefault(); // May not be needed if touch-action: none is effective
        const pos = this._getPointerPos(event);
        this.draggingNode.fx = pos.worldX;
        this.draggingNode.fy = pos.worldY;
        this.wasDragging = true; 
        if (this.onNodeDragCallback) this.onNodeDragCallback({ type: 'drag', nodeId: this.draggingNode.id, event });
    }

    _handleMouseUp(event: MouseEvent & TouchEvent) {
        if (!this.draggingNode) return;
        if (this.simulation) {
            this.simulation.alphaTarget(0);
            if (!this.selectedNode || this.selectedNode.id !== this.draggingNode.id) {
                this.draggingNode.fx = null; 
                this.draggingNode.fy = null;
            }
            if (this.onNodeDragCallback) this.onNodeDragCallback({ type: 'end', nodeId: this.draggingNode.id, event });
            
            // Click logic is handled by _handleClick, which fires after mouseup if not a drag.
            // Reset draggingNode here. wasDragging helps _handleClick decide.
            this.draggingNode = null; 
        } else throw new Error("Simulation not initialized");
    }
    
    _handleMouseOut(event: MouseEvent & TouchEvent) { 
        if (this.draggingNode) {
            if (event.relatedTarget !== this.canvas && !this.canvas.contains(event.relatedTarget as any)) {
                this._handleMouseUp(event); 
            }
        }
    }

    _handleClick(event: MouseEvent & TouchEvent) {
        // This is the general click handler, fired after mouseup or touchend (if not prevented by zoom)
        if (event.defaultPrevented) return; 

        if (this.wasDragging) { 
            this.wasDragging = false; 
            return;
        }

        const pos = this._getPointerPos(event);
        this._performSelection(pos.worldX, pos.worldY, event);
    }

    // --- Touch Event Handlers ---
    _handleTouchStart(event: MouseEvent & TouchEvent) {
        if (this.simulation) {
            if (event.touches.length === 1) { // Single touch
                event.preventDefault(); // Prevent page scroll on single touch drag
                const pos = this._getPointerPos(event);
                const node = this._getNodeAtPos(pos.worldX, pos.worldY);

                this.touchStartPos = { x: pos.screenX, y: pos.screenY }; // Store screen pos for tap detection
                this.touchStartTime = Date.now();

                if (node) {
                    this.draggingNode = node;
                    this.draggingNode.fx = pos.worldX;
                    this.draggingNode.fy = pos.worldY;
                    this.simulation.alphaTarget(0.3).restart();
                    if (this.onNodeDragCallback) this.onNodeDragCallback({ type: 'start', nodeId: node.id, event });
                }
            } else if (event.touches.length > 1) {
                // Multi-touch, let d3.zoom handle it (pinch-zoom)
                this.draggingNode = null; // Ensure no node drag during pinch
            }
            this.wasDragging = false;
        } else throw new Error("Simulation not initialized");
    }

    _handleTouchMove(event: MouseEvent & TouchEvent) {
        if (!this.draggingNode || event.touches.length !== 1) return;
        event.preventDefault(); // Prevent page scroll
        const pos = this._getPointerPos(event);
        this.draggingNode.fx = pos.worldX;
        this.draggingNode.fy = pos.worldY;
        this.wasDragging = true;
        if (this.onNodeDragCallback) this.onNodeDragCallback({ type: 'drag', nodeId: this.draggingNode.id, event });
    }

    _handleTouchEnd(event: MouseEvent & TouchEvent) {
        // event.preventDefault(); // Can sometimes interfere with subsequent interactions if not careful
        
        if (this.simulation) {
            const endedDrag = this.draggingNode !== null; // Was a drag operation active?

            if (this.draggingNode) {
                this.simulation.alphaTarget(0);
                if (!this.selectedNode || this.selectedNode.id !== this.draggingNode.id) {
                    this.draggingNode.fx = null;
                    this.draggingNode.fy = null;
                }
                if (this.onNodeDragCallback) this.onNodeDragCallback({ type: 'end', nodeId: this.draggingNode.id, event });
                this.draggingNode = null;
            }

            // Tap detection logic
            if (event.changedTouches.length === 1 && !this.wasDragging && endedDrag === false) { // Only if it wasn't a drag that just ended
                const pos = this._getPointerPos(event); // Use changedTouches for touchend
                const timeElapsed = Date.now() - this.touchStartTime;
                
                if (this.touchStartPos) { // Ensure touchStartPos was set
                    const distMoved = Math.sqrt(
                        Math.pow(pos.screenX - this.touchStartPos.x, 2) +
                        Math.pow(pos.screenY - this.touchStartPos.y, 2)
                    );

                    if (timeElapsed < this.options.tapTimeout && distMoved < this.options.tapThreshold) {
                        // It's a tap!
                        this._performSelection(pos.worldX, pos.worldY, event);
                    }
                }
            }
            this.wasDragging = false; // Reset for next interaction sequence
            this.touchStartPos = null;
        }
    }


    _performSelection(worldX: number, worldY: number, event: MouseEvent & TouchEvent) { // Common selection logic for click/tap
        const clickedNode = this._getNodeAtPos(worldX, worldY);
        if (clickedNode) {
            this._clearSelections({ clearNode: false, clearLink: true });
            if (this.selectedNode && this.selectedNode.id === clickedNode.id) {
                this.selectedNode.fx = null; 
                this.selectedNode.fy = null;
                this.selectedNode = null; 
            } else {
                if (this.selectedNode) { 
                    this.selectedNode.fx = null;
                    this.selectedNode.fy = null;
                }
                this.selectedNode = clickedNode;
                this.selectedNode.fx = this.selectedNode.x; 
                this.selectedNode.fy = this.selectedNode.y;
            }
            if (this.onNodeClickCallback) this.onNodeClickCallback(this.selectedNode, event);
        } else {
            const clickedLink = this._getLinkAtPos(worldX, worldY);
            if (clickedLink) {
                this._clearSelections({ clearNode: true, clearLink: false });
                this.selectedLink = (this.selectedLink === clickedLink) ? null : clickedLink;
                if (this.onLinkClickCallback) this.onLinkClickCallback(this.selectedLink, event);
            } else {
                this._clearSelections(); 
            }
        }
        this._draw(); 
    }
    
    _clearSelections(options = { clearNode: true, clearLink: true }) {
        let changed = false;
        if (options.clearNode && this.selectedNode) {
            this.selectedNode.fx = null; 
            this.selectedNode.fy = null;
            this.selectedNode = null;
            if (this.onNodeClickCallback) this.onNodeClickCallback(null, undefined);
            changed = true;
        }
        if (options.clearLink && this.selectedLink) {
            this.selectedLink = null;
            if (this.onLinkClickCallback) this.onLinkClickCallback(null, undefined);
            changed = true;
        }
        if (changed && !this.simulation?.alpha()) this._draw();
    }

    _draw() {
        if (this.ctx) {
            this.ctx.save();
            this.ctx.setTransform(this.dpi, 0, 0, this.dpi, 0, 0); 
            this.ctx.fillStyle = this.options.backgroundColor;
            this.ctx.fillRect(0, 0, this._getCSSWidth(), this._getCSSHeight()); 

            this.ctx.translate(this.currentTransform.x, this.currentTransform.y);
            this.ctx.scale(this.currentTransform.k, this.currentTransform.k);
            
            this.links.forEach(link => {
                if (!link.source || !link.target) return;
                if (this.ctx) {
                    this.ctx.beginPath();
                    this.ctx.moveTo((link.source as NodeBase).x, (link.source as NodeBase).y);
                    this.ctx.lineTo((link.target as NodeBase).x, (link.target as NodeBase).y);
                    this.ctx.strokeStyle = (this.selectedLink === link) ? this.options.highlightLinkColor : this.options.linkColor;
                    this.ctx.lineWidth = ((this.selectedLink === link) ? this.options.highlightLinkStrokeWidth : this.options.linkStrokeWidth) / this.currentTransform.k;
                    this.ctx.stroke();
                }
            });

            this.nodes.forEach(node => {
                if (this.ctx) {
                    this.ctx.beginPath();
                    this.ctx.arc(node.x, node.y, this.options.nodeRadius / this.currentTransform.k, 0, 2 * Math.PI);
                    this.ctx.fillStyle = (this.selectedNode && this.selectedNode.id === node.id) ? this.options.highlightColor : this.options.nodeColor;
                    this.ctx.fill();
                    this.ctx.strokeStyle = '#fff'; 
                    this.ctx.lineWidth = 1.5 / this.currentTransform.k; 
                    this.ctx.stroke();

                    if (this.currentTransform.k > 0.5) { 
                        this.ctx.fillStyle = this.options.textColor;
                        const fontSize = this.options.textFontSize / this.currentTransform.k; 
                        this.ctx.font = `${fontSize}px Inter, sans-serif`;
                        this.ctx.textAlign = 'center';
                        this.ctx.fillText(node.id, node.x, node.y + (this.options.nodeRadius / this.currentTransform.k) + fontSize * 0.8);
                    }
                }
            });
            this.ctx.restore();
        } 
    }
    
    addNode(newNode: Node<T>, connectToNodeId = null) {
        if (!newNode || !newNode.id) { console.error("ID required"); return; }
        if (this.nodes.find(n => n.id === newNode.id)) { console.warn("ID exists"); return; }

        const viewCenterX = this.currentTransform.invertX(this._getCSSWidth() / 2);
        const viewCenterY = this.currentTransform.invertY(this._getCSSHeight() / 2);
        let initialX = viewCenterX, initialY = viewCenterY;

        if (connectToNodeId) {
            const targetNode = this.nodes.find(n => n.id === connectToNodeId);
            if (targetNode) {
                initialX = targetNode.x + (Math.random() - 0.5) * 20;
                initialY = targetNode.y + (Math.random() - 0.5) * 20;
            }
        } else {
            initialX += (Math.random() - 0.5) * 50 / this.currentTransform.k;
            initialY += (Math.random() - 0.5) * 50 / this.currentTransform.k;
        }
        
        const completeNewNode: Node<T> = { ...newNode, x: initialX, y: initialY, fx: initialX, fy: initialY };
        this.nodes.push(completeNewNode);

        if (connectToNodeId) {
            const targetNodeExists = this.nodes.find(n => n.id === connectToNodeId);
            
            const linkCount = this.links.length;
            if (targetNodeExists) this.links.push({ id: `edge_${linkCount}`, index: linkCount, source: completeNewNode as Node<T>, target: targetNodeExists as Node<T>});
            else console.warn("Target node not found");
        }

        if (this.simulation) {
            this.simulation.nodes(this.nodes);
            (this.simulation.force("link") as any).links(this.links);
            this.simulation.alpha(0.3).restart();

            setTimeout(() => {
                const node = this.nodes.find(n => n.id === newNode.id);
                if (node) { node.fx = null; node.fy = null; }
                if (this.simulation!.alpha() < this.simulation!.alphaMin()) this.simulation!.alpha(0.1).restart();
            }, 100);
        }
    }

    removeNode(nodeId: string) {
        const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) return;
        if (this.selectedNode && this.selectedNode.id === nodeId) this._clearSelections({clearNode: true, clearLink: false});
        const nodeToRemove = this.nodes[nodeIndex];
        this.nodes.splice(nodeIndex, 1);
        this.links = this.links.filter(l => {
            const isAffected = l.source === nodeToRemove || l.target === nodeToRemove;
            if (isAffected && this.selectedLink === l) this._clearSelections({clearNode: false, clearLink: true});
            return !isAffected;
        });

        if (this.simulation) {
            this.simulation.nodes(this.nodes);
            (this.simulation.force("link") as any).links(this.links);
            this.simulation.alpha(0.1).restart();
            if (!this.simulation.alpha()) this._draw();
        }
    }
    
    updateData(newNodes: Node<T>[], newLinks: Edge<K>[]) {
        if (this.simulation) {
            this._clearSelections();
            this.nodes = JSON.parse(JSON.stringify(newNodes));
            this.links = JSON.parse(JSON.stringify(newLinks));
            const nodeMap = new Map(this.nodes.map(node => [node.id, node]));
            this.links = this.links.map(link => ({
                source: nodeMap.get(typeof link.source === 'string' ? link.source : link.source.id),
                target: nodeMap.get(typeof link.target === 'string' ? link.target : link.target.id),
                ...link
            })).filter(l => l.source && l.target); 
            this.simulation.nodes(this.nodes);
            (this.simulation.force("link") as any).links(this.links);
            this.simulation.alpha(1).restart();
            if (!this.simulation.alpha()) this._draw();
        }
    }

    resetZoom() {
        if (!this.zoomBehavior) throw new Error("Zoom behavior not initialized");
        d3.select(this.canvas)
            .transition().duration(750)
            .call(this.zoomBehavior.transform as any, d3.zoomIdentity);
    }

    resize() {
        if (this.simulation) {
            this._setupCanvas(); 
            this.simulation.force("center", d3.forceCenter(this._getCSSWidth() / 2, this._getCSSHeight() / 2));
            this.simulation.alpha(0.3).restart();
        }
    }

    onNodeClick(callback: NodeClickCallbackType) { this.onNodeClickCallback = callback; }
    onLinkClick(callback: LinkClickCallbackType) { this.onLinkClickCallback = callback; }
    onNodeDrag(callback: NodeDragCallbackType) { this.onNodeDragCallback = callback; }
}

export default function ForceGraph() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useLayoutEffect(() => {
        if (!canvasRef.current) return;
        const initialNodes: Node<NodeData>[] = [ { id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }, { id: "F" }, { id: "G" } ];
        const initialLinks: Edge<EdgeData>[] = [
            { id: "edge_1", source: "A", target: "B" }, { id: "edge_2", source: "A", target: "C" }, { id: "edge_3", source: "B", target: "D" },
            { id: "edge_4", source: "C", target: "E" }, { id: "edge_5", source: "D", target: "E" }, { id: "edge_6", source: "E", target: "F" },
            { id: "edge_7", source: "F", target: "G" }, { id: "edge_8", source: "G", target: "A" }
        ];
        const forceGraph = new ForceGraphCanvas<NodeData, EdgeData>(canvasRef.current, initialNodes, initialLinks, {
                nodeRadius: 10, 
                linkDistance: 100, 
                chargeStrength: -250,
                backgroundColor: '#f8f8f8', 
                highlightColor: '#e91e63', 
                highlightLinkColor: '#03a9f4'
            });
    }, []);

    console.log('ForceGraph rendered');

    return <>
        <div id="graph-container">
            <canvas ref={canvasRef} id="forceGraphCanvas"></canvas>
        </div>
    </>
}