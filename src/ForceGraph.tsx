import * as d3 from 'd3';
import "./ForceGraph.css";

export default function ForceGraph() {
    return <>
        <div id="graph-container" className='debug'>
            <canvas id="forceGraphCanvas"></canvas>
        </div>
    </>
}