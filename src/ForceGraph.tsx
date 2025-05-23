/* eslint-disable @typescript-eslint/no-explicit-any */

import * as d3 from 'd3';
import "./ForceGraph.css";
import { useLayoutEffect, useRef } from 'react';
import type { Edge, Node, GraphOptions, NodeBase } from "./Types";
import { initialLinks, initialNodes } from './SampleData';

type NodeDragCallbackType = (event: { type: string; nodeId: string; event?: PointerEvent }) => void;
type NodeClickCallbackType = (node: Node<any> | null, event?: PointerEvent) => void;
type LinkClickCallbackType = (link: Edge<any> | null, event?: PointerEvent) => void;

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

    // Dragging and selection
    selectedNode: Node<T> | null;
    selectedLink: Edge<K> | null;
    draggingNode: Node<T> | null;
    wasDragging: boolean;
    dpi: number;
    currentTransform: d3.ZoomTransform;
    activePointers: Map<number, { startX: number, startY: number, startTime: number }>;
    primaryPointerId: number | null;
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
            selectionRadius: 50, // Radius for selecting nodes/links
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
        this.activePointers = new Map();
        this.primaryPointerId = null;

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

        // CUSTOM GRAVITY FORCE (helps pull father nodes back to center)
        this.simulation.force("gravity", () => {
            this.nodes.forEach(d => {
                if (d.x !== undefined && d.y !== undefined && d.vx !== undefined && d.vy !== undefined) {
                    const dx = this._getCSSWidth() / 2 - d.x;
                    const dy = this._getCSSHeight() / 2 - d.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const threshold = 4500; // px, only apply full strength if farther than this
                    if (dist > threshold) {
                        const strength = 0.001;
                        d.vx += dx * strength;
                        d.vy += dy * strength;
                    } else {
                        // Apply weaker force when close to center
                        const strength = 0.001 * (dist / threshold);
                        d.vx += dx * strength;
                        d.vy += dy * strength;
                    }
                }
            });
        });

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
                // Allow zoom if not dragging a node
                if (this.draggingNode) return false;

                // For pointer events, check if it's a primary pointer and not on a node
                if (event.type === "pointerdown") {
                    if (!event.isPrimary) return false; // Only primary pointer
                    
                    const rect = this.canvas.getBoundingClientRect();
                    const rawX = event.clientX - rect.left;
                    const rawY = event.clientY - rect.top;
                    const worldPos = {
                        x: this.currentTransform.invertX(rawX),
                        y: this.currentTransform.invertY(rawY)
                    };
                    const node = this._getNodeAtPos(worldPos.x, worldPos.y);
                    return !node; // If on a node, filter out zoom to allow drag
                }

                // Legacy support for mouse/touch events
                if (event.type === "mousedown" && event.button !== 0) return false;
                if (event.type === "touchstart" && event.touches.length > 1) return true;

                return true;
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
        
        // Pointer events (unified handling)
        canvasEl
            .on("pointerdown.drag", this._handlePointerDown.bind(this))
            .on("pointermove.drag", this._handlePointerMove.bind(this))
            .on("pointerup.drag", this._handlePointerUp.bind(this))
            .on("pointercancel.drag", this._handlePointerCancel.bind(this))
            .on("pointerleave.drag", this._handlePointerLeave.bind(this))
            .on("click.select", this._handleClick.bind(this));
    }

    _getPointerPos(event: PointerEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const rawX = event.clientX - rect.left;
        const rawY = event.clientY - rect.top;
        return {
            screenX: rawX, // Screen coordinates (CSS pixels)
            screenY: rawY,
            worldX: this.currentTransform.invertX(rawX), // World coordinates
            worldY: this.currentTransform.invertY(rawY)
        };
    }

    _getNodeAtPos(worldX: number, worldY: number) {
        let closestNode: Node<T> | null = null;
        let minDistSq = Infinity;
        const selectionRadius = this.options.selectionRadius;

        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node: Node<T> = this.nodes[i];
            if (node.x !== undefined && node.y !== undefined) {
                const dx = worldX - node.x;
                const dy = worldY - node.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < (selectionRadius * selectionRadius) && distSq < minDistSq) {
                    minDistSq = distSq;
                    closestNode = node;
                }
            }
        }
        return closestNode;
    }
    
    _getLinkAtPos(worldX: number, worldY: number) {
        const tolerance = 5 / this.currentTransform.k; 
        for (let i = this.links.length - 1; i >= 0; i--) {
            const link = this.links[i];
            if (!link.source || !link.target) continue;
            const p0 = link.source as NodeBase;
            const p1 = link.target as NodeBase;
            
            // Check if coordinates are defined
            if (p0.x === undefined || p0.y === undefined || p1.x === undefined || p1.y === undefined) continue;
            
            const dx = p1.x - p0.x; 
            const dy = p1.y - p0.y;
            const lengthSq = dx * dx + dy * dy;
            if (lengthSq === 0) continue; 
            let t = ((worldX - p0.x) * dx + (worldY - p0.y) * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t)); 
            const closestX = p0.x + t * dx; 
            const closestY = p0.y + t * dy;
            const distSq = (worldX - closestX) * (worldX - closestX) + (worldY - closestY) * (worldY - closestY);
            if (distSq < tolerance * tolerance) return link;
        }
        return null;
    }

    // --- Pointer Event Handlers ---
    _handlePointerDown(event: PointerEvent) {
        if (!event.isPrimary) return; // Only handle primary pointer

        const pos = this._getPointerPos(event);
        const node = this._getNodeAtPos(pos.worldX, pos.worldY);

        // Track this pointer
        this.activePointers.set(event.pointerId, {
            startX: pos.screenX,
            startY: pos.screenY,
            startTime: Date.now()
        });

        if (node) {
            // Start dragging
            this.canvas.setPointerCapture(event.pointerId);
            this.primaryPointerId = event.pointerId;
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

    _handlePointerMove(event: PointerEvent) {
        if (!this.draggingNode || event.pointerId !== this.primaryPointerId) return;

        event.preventDefault();
        const pos = this._getPointerPos(event);
        this.draggingNode.fx = pos.worldX;
        this.draggingNode.fy = pos.worldY;
        this.wasDragging = true;
        
        if (this.onNodeDragCallback) {
            this.onNodeDragCallback({ type: 'drag', nodeId: this.draggingNode.id, event });
        }
    }

    _handlePointerUp(event: PointerEvent) {
        const pointerInfo = this.activePointers.get(event.pointerId);
        
        if (this.draggingNode && event.pointerId === this.primaryPointerId) {
            if (this.simulation) {
                this.simulation.alphaTarget(0);
                if (!this.selectedNode || this.selectedNode.id !== this.draggingNode.id) {
                    this.draggingNode.fx = null;
                    this.draggingNode.fy = null;
                }
                if (this.onNodeDragCallback) {
                    this.onNodeDragCallback({ type: 'end', nodeId: this.draggingNode.id, event });
                }
            } else throw new Error("Simulation not initialized");
            
            this.draggingNode = null;
            this.primaryPointerId = null;
        }

        // Handle tap/click for selection if it wasn't a drag
        if (pointerInfo && !this.wasDragging && event.isPrimary) {
            const pos = this._getPointerPos(event);
            const timeElapsed = Date.now() - pointerInfo.startTime;
            const distMoved = Math.sqrt(
                Math.pow(pos.screenX - pointerInfo.startX, 2) +
                Math.pow(pos.screenY - pointerInfo.startY, 2)
            );

            if (timeElapsed < this.options.tapTimeout && distMoved < this.options.tapThreshold) {
                this._performSelection(pos.worldX, pos.worldY, event);
                event.preventDefault(); // Prevent the subsequent "click" event
            }
        }

        this.activePointers.delete(event.pointerId);
        this.wasDragging = false;
    }

    _handlePointerCancel(event: PointerEvent) {
        this._handlePointerUp(event);
    }

    _handlePointerLeave(event: PointerEvent) {
        if (this.draggingNode && event.pointerId === this.primaryPointerId) {
            this._handlePointerUp(event);
        }
    }

    _handleClick(event: PointerEvent) {
        // This handles clicks that weren't handled by pointer events
        if (event.defaultPrevented) return;

        if (this.wasDragging) {
            this.wasDragging = false;
            return;
        }

        const pos = this._getPointerPos(event);
        this._performSelection(pos.worldX, pos.worldY, event);
    }

    _performSelection(worldX: number, worldY: number, event: PointerEvent) {
        const clickedNode = this._getNodeAtPos(worldX, worldY);
        if (clickedNode) {
            this._clearSelections({ clearNode: false, clearLink: true });
            if (this.selectedNode && this.selectedNode.id === clickedNode.id) {
                this.selectedNode = null; 
            } else {
                this.selectedNode = clickedNode;
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
                const source = link.source as NodeBase;
                const target = link.target as NodeBase;
                
                // Check if coordinates are defined
                if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return;
                
                if (this.ctx) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(source.x, source.y);
                    this.ctx.lineTo(target.x, target.y);
                    this.ctx.strokeStyle = (this.selectedLink === link) ? this.options.highlightLinkColor : this.options.linkColor;
                    this.ctx.lineWidth = ((this.selectedLink === link) ? this.options.highlightLinkStrokeWidth : this.options.linkStrokeWidth) / this.currentTransform.k;
                    this.ctx.stroke();
                }
            });

            this.nodes.forEach(node => {
                if (this.ctx && node.x !== undefined && node.y !== undefined) {
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
            if (targetNode && targetNode.x !== undefined && targetNode.y !== undefined) {
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
            if (targetNodeExists) this.links.push({ id: `edge_${linkCount}`, index: linkCount, source: completeNewNode.id, target: targetNodeExists.id});
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
            this.links = this.links.map(originalLink => {
                const { source: oldSource, target: oldTarget, ...restOfLink } = originalLink;
                const resolvedSource = nodeMap.get(typeof oldSource === 'string' ? oldSource : (oldSource as Node<any>).id);
                const resolvedTarget = nodeMap.get(typeof oldTarget === 'string' ? oldTarget : (oldTarget as Node<any>).id);
                return {
                    ...restOfLink,
                    source: resolvedSource,
                    target: resolvedTarget
                };
            }).filter(l => l.source && l.target) as Edge<K>[];
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
        
        const forceGraph = new ForceGraphCanvas<NodeData, EdgeData>(canvasRef.current, initialNodes, initialLinks, {
                nodeRadius: 10, 
                linkDistance: 100, 
                chargeStrength: -250,
                backgroundColor: '#f8f8f8', 
                highlightColor: '#e91e63', 
                highlightLinkColor: '#03a9f4'
            });

        // Store reference to prevent garbage collection
        (canvasRef.current as any).__forceGraph = forceGraph;
    }, []);

    console.log('ForceGraph rendered');

    return <>
        <div id="graph-container">
            <canvas ref={canvasRef} id="forceGraphCanvas"></canvas>
        </div>
    </>
}
