/*
 * Copyright 2026 8dcc
 *
 * This file is part of logic-gates.js.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * -----------------------------------------------------------------------------
 *
 * For more information, see: https://github.com/8dcc/logic-gates.js
 */

(function(global) {
'use strict';

/* ================================================================
 * Configuration
 * ================================================================ */

const LogicDiag = {
    tickRate : 1000,      /* ms between ticks for oscillating circuits */
    stabilityChecks : 20, /* max passes before declaring oscillation */
};

/* ================================================================
 * Parser
 * ================================================================ */

const GATE_TYPES =
  new Set([ 'not', 'buf', 'and', 'or', 'nand', 'nor', 'xor', 'xnor' ]);

/* Split a DSL line into tokens, respecting quoted strings. */
function tokenizeLine(line) {
    const tokens = [];
    let i        = 0;
    while (i < line.length) {
        while (i < line.length && (line[i] === ' ' || line[i] === '\t'))
            i++;

        if (i >= line.length)
            break;

        if (line[i] === '"') {
            let j = i + 1;
            while (j < line.length && line[j] !== '"')
                j++;
            if (j >= line.length)
                throw new Error('Unterminated quoted string: ' + line);
            tokens.push(line.slice(i, j + 1));
            i = j + 1;
        } else {
            let j = i;
            while (j < line.length && line[j] !== ' ' && line[j] !== '\t')
                j++;
            tokens.push(line.slice(i, j));
            i = j;
        }
    }
    return tokens;
}

/* Remove surrounding double quotes from a token. */
function unquote(s) {
    return ((s.startsWith('"') && s.endsWith('"')) ||
            (s.startsWith('\'') && s.endsWith('\'')))
             ? s.slice(1, -1)
             : s;
}

/*
 * Parse a DSL string and return a Graph object:
 *   { nodes: Map, inputs: Node[], outputs: Node[], gates: Node[] }
 */
function parse(text) {
    const nodes      = new Map();
    const inputs     = [];
    const outputs    = [];
    const gates      = [];
    let currentStage = 1;
    const rowByStage = new Map();   /* current row counter per stage */
    let pendingRow   = null;        /* set by 'row' hint, used once */

    const VALID_STATES = new Set([ '0', '1', 'true', 'false' ]);
    const lines        = text.split('\n');
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#'))
            continue;

        const tokens = tokenizeLine(line);
        const kw     = tokens[0].toLowerCase();

        if (kw === 'stage') {
            const n = parseInt(tokens[1], 10);
            if (isNaN(n))
                throw new Error('Invalid stage number: ' + tokens[1]);
            currentStage = n;
            rowByStage.delete(n);
            pendingRow   = null;
            continue;
        }

        if (kw === 'row') {
            const n = parseFloat(tokens[1]);
            if (isNaN(n))
                throw new Error('Invalid row number: ' + tokens[1]);
            pendingRow = n;
            continue;
        }

        if (kw === 'input') {
            const id  = tokens[1];
            let init  = 0;
            let label = id;

            if (tokens.length === 2) {
                /* input <id> */
            } else if (tokens.length === 3 || tokens.length === 4) {
                /* input <id> <init> [<label>] */
                if (!VALID_STATES.has(tokens[2])) {
                    throw new Error('Invalid input state: ' + tokens[2]);
                }
                init = (tokens[2] === '1' || tokens[2] === 'true') ? 1 : 0;
                if (tokens.length === 4)
                    label = unquote(tokens[3]);
            } else {
                throw new Error('Invalid input declaration: ' + line);
            }

            const inputRow = pendingRow !== null
                ? pendingRow
                : (rowByStage.get(0) ?? 0);
            pendingRow = null;
            rowByStage.set(0, inputRow + 1);
            const node = {
                id, type : 'input', ins : [], label, init,
                stage : 0, row : inputRow
            };
            nodes.set(id, node);
            inputs.push(node);
            continue;
        }

        if (kw === 'output') {
            const id = tokens[1];
            if (!nodes.has(id))
                throw new Error('Undefined node referenced in output: ' + id);
            const label = tokens[2] ? unquote(tokens[2]) : id;
            const node  = {
                id,
                type : 'output',
                ins : [ id ],
                label,
                stage : currentStage + 1
            };
            outputs.push(node);
            continue;
        }

        if (kw === 'wire') {
            if (tokens.length !== 5)
                throw new Error('Invalid wire declaration: ' + line);
            const id    = tokens[1];
            const src   = tokens[2];
            const stage = parseFloat(tokens[3]);
            const row   = parseFloat(tokens[4]);
            if (isNaN(stage))
                throw new Error('Invalid wire stage: ' + tokens[3]);
            if (isNaN(row))
                throw new Error('Invalid wire row: ' + tokens[4]);
            const node = {
                id, type : 'wire', ins : [ src ], label : id, stage, row
            };
            nodes.set(id, node);
            gates.push(node);
            continue;
        }

        if (GATE_TYPES.has(kw)) {
            const id  = tokens[1];
            const ins = tokens.slice(2);
            const gateRow = pendingRow !== null
                ? pendingRow
                : (rowByStage.get(currentStage) ?? 0);
            pendingRow = null;
            rowByStage.set(currentStage, gateRow + 1);
            const node = {
                id, type : kw, ins, label : id,
                stage : currentStage, row : gateRow
            };
            nodes.set(id, node);
            gates.push(node);
            continue;
        }

        throw new Error('Unknown gate type: ' + tokens[0]);
    }

    for (const gate of gates)
        for (const inp of gate.ins)
            if (!nodes.has(inp))
                throw new Error('Undefined node referenced: ' + inp);

    return { nodes, inputs, outputs, gates };
}

LogicDiag._parse = parse;

/* ================================================================
 * Layout
 * ================================================================ */

const GATE_W      = 60;
const GATE_H      = 40;
const COL_SPACING = 140;
const ROW_SPACING = 70;
const PADDING     = 50;
/* Space from the last gate centre to the SVG right edge: output pin
 * extension (20) + wire to dot (30) + label text estimate (80) +
 * right margin (25). */
const OUT_TAIL    = 155;

/*
 * Assign center {x, y} coordinates to every node in 'graph'.
 * Returns { pos: Map<id, {x,y}>, width: number, height: number,
 *           maxStage: number }.
 */
function layout(graph) {
    let maxGateStage = 0;
    for (const n of graph.gates)
        if (n.stage > maxGateStage)
            maxGateStage = n.stage;

    const outputStage = maxGateStage + 1;

    /* Find the highest row index used across all nodes. */
    let maxRow = 0;
    for (const n of [...graph.inputs, ...graph.gates])
        if (n.row > maxRow)
            maxRow = n.row;

    const canvasHeight = Math.max(
        (maxRow + 1) * ROW_SPACING + 2 * PADDING,
        GATE_H + 2 * PADDING
    );
    const cx_max      = PADDING + GATE_W / 2 + maxGateStage * COL_SPACING;
    const canvasWidth = cx_max + OUT_TAIL;

    const pos = new Map();

    for (const n of [...graph.inputs, ...graph.gates]) {
        const cx = PADDING + GATE_W / 2 + n.stage * COL_SPACING;
        const cy = PADDING + n.row * ROW_SPACING;
        pos.set(n.id, { x : cx, y : cy });
    }

    return {
        pos,
        width : canvasWidth,
        height : canvasHeight,
        maxStage : outputStage
    };
}

LogicDiag._layout = layout;

/* ================================================================
 * Simulator
 * ================================================================ */

/*
 * Evaluate a gate given its type and inputs (values are 0, 1, or null).
 * Returns null if the output cannot be determined from the inputs.
 * Short-circuit rules apply: AND/NAND with a 0 input, OR/NOR with a 1
 * input, can resolve even when other inputs are null.
 */
function evalGate(type, inputs) {
    switch (type) {
        case 'not':
            return inputs[0] === null ? null : (inputs[0] === 0 ? 1 : 0);

        case 'buf':
            return inputs[0];

        case 'and':
            if (inputs.some(v => v === 0))
                return 0;
            if (inputs.some(v => v === null))
                return null;
            return 1;

        case 'or':
            if (inputs.some(v => v === 1))
                return 1;
            if (inputs.some(v => v === null))
                return null;
            return 0;

        case 'nand':
            if (inputs.some(v => v === 0))
                return 1;
            if (inputs.some(v => v === null))
                return null;
            return 0;

        case 'nor':
            if (inputs.some(v => v === 1))
                return 0;
            if (inputs.some(v => v === null))
                return null;
            return 1;

        case 'xor':
            if (inputs.some(v => v === null))
                return null;
            return inputs.reduce((a, b) => a ^ b, 0);

        case 'xnor':
            if (inputs.some(v => v === null))
                return null;
            return inputs.reduce((a, b) => a ^ b, 0) === 0 ? 1 : 0;

        case 'wire':
            return inputs[0] ?? null;

        default:
            return null;
    }
}

/*
 * Sort 'graph.gates' in topological order (inputs-first). Uses Kahn's
 * algorithm. Gates that are part of a cycle cannot be fully ordered and
 * are appended at the end in their original declaration order.
 */
function topoSortGates(graph) {
    const gateIds  = new Set(graph.gates.map(g => g.id));
    const indegree = new Map();
    const children = new Map();

    for (const gate of graph.gates) {
        indegree.set(gate.id, 0);
        children.set(gate.id, []);
    }
    for (const gate of graph.gates) {
        for (const inp of gate.ins) {
            if (gateIds.has(inp)) {
                indegree.set(gate.id, indegree.get(gate.id) + 1);
                children.get(inp).push(gate.id);
            }
        }
    }

    const queue = [];
    for (const gate of graph.gates) {
        if (indegree.get(gate.id) === 0)
            queue.push(gate.id);
    }

    const sorted  = [];
    const visited = new Set();
    while (queue.length > 0) {
        const id = queue.shift();
        visited.add(id);
        sorted.push(id);
        for (const next of children.get(id)) {
            const deg = indegree.get(next) - 1;
            indegree.set(next, deg);
            if (deg === 0)
                queue.push(next);
        }
    }

    /* Append cyclic gates in declaration order */
    for (const gate of graph.gates)
        if (!visited.has(gate.id))
            sorted.push(gate.id);

    return sorted.map(id => graph.nodes.get(id));
}

/*
 * Run a single propagation pass over 'graph' starting from 'state'.
 * Gates are processed in topological order; cyclic nodes use their
 * current value from 'state' as input. Returns a new
 * Map<id, 0|1|null>.
 */
function simulate(graph, state) {
    const next = new Map(state);
    for (const gate of graph.gates)
        if (!next.has(gate.id))
            next.set(gate.id, null);

    for (const gate of topoSortGates(graph)) {
        const inputs = gate.ins.map(id => next.get(id) ?? null);
        next.set(gate.id, evalGate(gate.type, inputs));
    }

    return next;
}

LogicDiag._simulate = simulate;

/*
 * Run simulate() repeatedly until two consecutive passes produce
 * identical state (stable) or 'LogicDiag.stabilityChecks' passes are
 * exhausted (oscillating). Compares all node states, not just outputs.
 * Returns { state: Map<id, 0|1|null>, stable: bool }.
 */
function checkStability(graph, state) {
    const first_simulation = simulate(graph, state);

    let prev = first_simulation;
    for (let i = 1; i < LogicDiag.stabilityChecks; i++) {
        const next = simulate(graph, prev);
        let stable = true;
        for (const [id, val] of next) {
            if (prev.get(id) !== val) {
                stable = false;
                break;
            }
        }

        if (stable)
            return { state : next, stable : true };

        prev = next;
    }

    return { state : first_simulation, stable : false };
}

LogicDiag._checkStability = checkStability;

/* ================================================================
 * SVG Renderer
 * ================================================================ */

const G_L = 20; /* distance from center to left edge (input pin x) */
const G_R = 20; /* distance from center to right (output pin x, non-inverted) */
const G_H = 13; /* half-height of gate body */
const G_PY  = 8; /* y-offset for the two input pins on 2-input gates */
const G_BUB = 4; /* invert bubble radius */

/* Signal state -> CSS color string */
const COLOR_HIGH    = '#22c55e'; /* bright green */
const COLOR_LOW     = '#b45252'; /* muted red    */
const COLOR_UNKNOWN = '#888888'; /* neutral grey */

function sigColor(val) {
    switch (val) {
        case 0:
            return COLOR_LOW;
        case 1:
            return COLOR_HIGH;
        default:
            return COLOR_UNKNOWN;
    }
}

/* Escape special XML characters in text content. */
function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

function gateShape(type, cx, cy) {
    const sk = 'stroke="#111" stroke-width="1.5" fill="white"';

    switch (type) {
        case 'buf':
            return `<polygon points="${cx - G_L},${cy - G_H} ${cx - G_L},${
              cy + G_H} ${cx + G_R},${cy}" ${sk}/>`;

        case 'not':
            /* Triangle tip at cx+G_R-2*G_BUB so bubble right edge = cx+G_R */
            return (`<polygon points="${cx - G_L},${cy - G_H} ${cx - G_L},${
                      cy + G_H} ${cx + G_R - G_BUB * 2},${cy}" ${sk}/>` +
                    `<circle cx="${cx + G_R - G_BUB}" cy="${cy}" r="${G_BUB}" ${
                      sk}/>`);

        case 'and':
            /* D-shape: flat left side, two quadratic beziers on the right */
            return (`<path d="M${cx - G_L},${cy - G_H} H${cx - 4}` +
                    ` Q${cx + G_R},${cy - G_H} ${cx + G_R},${cy}` +
                    ` Q${cx + G_R},${cy + G_H} ${cx - 4},${cy + G_H}` +
                    ` H${cx - G_L} Z" ${sk}/>`);

        case 'nand': {
            /* D-shape body ending before bubble */
            const bx = cx + G_R - G_BUB * 2; /* body right edge = cx+12 */
            return (`<path d="M${cx - G_L},${cy - G_H} H${cx - 4}` +
                    ` Q${bx},${cy - G_H} ${bx},${cy}` +
                    ` Q${bx},${cy + G_H} ${cx - 4},${cy + G_H}` +
                    ` H${cx - G_L} Z" ${sk}/>` +
                    `<circle cx="${cx + G_R - G_BUB}" cy="${cy}" r="${G_BUB}" ${
                      sk}/>`);
        }

        case 'or':
            /* Curved back, pointed front */
            return (
              `<path d="M${cx - G_L},${cy - G_H}` +
              ` Q${cx - G_L + 12},${cy - G_H} ${cx + G_R},${cy}` +
              ` Q${cx - G_L + 12},${cy + G_H} ${cx - G_L},${cy + G_H}` +
              ` Q${cx - G_L + 7},${cy} ${cx - G_L},${cy - G_H} Z" ${sk}/>`);

        case 'nor': {
            const bx = cx + G_R - G_BUB * 2;
            return (
              `<path d="M${cx - G_L},${cy - G_H}` +
              ` Q${cx - G_L + 12},${cy - G_H} ${bx},${cy}` +
              ` Q${cx - G_L + 12},${cy + G_H} ${cx - G_L},${cy + G_H}` +
              ` Q${cx - G_L + 7},${cy} ${cx - G_L},${cy - G_H} Z" ${sk}/>` +
              `<circle cx="${cx + G_R - G_BUB}" cy="${cy}" r="${G_BUB}" ${
                sk}/>`);
        }

        case 'xor':
            /* OR body + extra arc on left */
            return (
              `<path d="M${cx - G_L},${cy - G_H}` +
              ` Q${cx - G_L + 12},${cy - G_H} ${cx + G_R},${cy}` +
              ` Q${cx - G_L + 12},${cy + G_H} ${cx - G_L},${cy + G_H}` +
              ` Q${cx - G_L + 7},${cy} ${cx - G_L},${cy - G_H} Z" ${sk}/>` +
              `<path d="M${cx - G_L - 5},${cy - G_H}` +
              ` Q${cx - G_L + 2},${cy} ${cx - G_L - 5},${
                cy + G_H}" fill="none" ${sk}/>`);

        case 'xnor': {
            const bx = cx + G_R - G_BUB * 2;
            return (
              `<path d="M${cx - G_L},${cy - G_H}` +
              ` Q${cx - G_L + 12},${cy - G_H} ${bx},${cy}` +
              ` Q${cx - G_L + 12},${cy + G_H} ${cx - G_L},${cy + G_H}` +
              ` Q${cx - G_L + 7},${cy} ${cx - G_L},${cy - G_H} Z" ${sk}/>` +
              `<path d="M${cx - G_L - 5},${cy - G_H}` +
              ` Q${cx - G_L + 2},${cy} ${cx - G_L - 5},${
                cy + G_H}" fill="none" ${sk}/>` +
              `<circle cx="${cx + G_R - G_BUB}" cy="${cy}" r="${G_BUB}" ${
                sk}/>`);
        }

        default:
            return '';
    }
}

/*
 * Return the output pin position { x, y } for a gate at (cx, cy).
 * For inverted gates the bubble right edge is cx+G_R.
 */
function outPin(type, cx, cy) {
    if (type === 'wire')
        return { x : cx, y : cy };
    return { x : cx + G_R, y : cy };
}

/*
 * Return input pin positions [{ x, y }, ...] for a gate at (cx, cy).
 * For XOR/XNOR the extra left arc shifts the effective pin x inward.
 */
function inPins(type, cx, cy) {
    if (type === 'wire')
        return [ { x : cx, y : cy } ];
    if (type === 'not' || type === 'buf')
        return [ { x : cx - G_L, y : cy } ];
    const isXorFamily = type === 'xor' || type === 'xnor';
    const x           = isXorFamily ? cx - G_L + 5 : cx - G_L;
    return [ { x, y : cy - G_PY }, { x, y : cy + G_PY } ];
}

/*
 * Render all wires as orthogonal SVG paths.
 * Forward wires (source stage < target stage): H to midpoint, V to
 * target y, H to pin.
 * Backward wires (feedback loops): routed above or below the diagram,
 * alternating per feedback wire index.
 */
function renderWires(graph, lo, simState) {
    const { pos, height } = lo;
    const parts           = [];
    let feedbackIdx       = 0;

    for (const node of [...graph.inputs, ...graph.gates]) {
        const tPos = pos.get(node.id);
        if (!tPos)
            continue;
        const pins = inPins(node.type, tPos.x, tPos.y);

        node.ins.forEach((srcId, i) => {
            const srcNode =
              graph.nodes.get(srcId) || graph.inputs.find(n => n.id === srcId);
            if (!srcNode)
                return;

            const sPos = pos.get(srcId);
            if (!sPos)
                return;

            const color = sigColor(simState.get(srcId) ?? null);
            const pin   = pins[i] || pins[0];
            const sOut  = outPin(srcNode.type, sPos.x, sPos.y);
            const tx = pin.x, ty = pin.y;
            const sx = sOut.x, sy = sOut.y;

            let d;
            if (sx < tx - 5) {
                /* Forward wire: horizontal, diagonal, short stub at dest */
                const dstStub = 12;
                const stub    = Math.min(30, (tx - sx) * 0.3);
                d             = `M${sx},${sy} H${tx - stub}` +
                    ` L${tx - dstStub},${ty} H${tx}`;
            } else {
                /* Backward (feedback) wire: route above or below diagram */
                const margin = 20 + feedbackIdx * 14;
                const routeY = feedbackIdx % 2 === 0 ? margin : height - margin;
                feedbackIdx++;
                d = `M${sx},${sy} H${sx + 16} V${routeY}` +
                    ` H${tx - 16} V${ty} H${tx}`;
            }

            parts.push(`<path d="${d}" fill="none" stroke="${color}"` +
                       ` stroke-width="2" stroke-linejoin="round"/>`);
        });
    }

    /* Draw wires from gate output pins to output label dots */
    for (const out of graph.outputs) {
        const srcId   = out.ins[0];
        const srcNode = graph.nodes.get(srcId);
        if (!srcNode)
            continue;

        const srcPos = pos.get(srcId);
        if (!srcPos)
            continue;

        const color = sigColor(simState.get(srcId) ?? null);
        const sOut  = outPin(srcNode.type, srcPos.x, srcPos.y);
        /* The output dot is rendered at sOut.x + 30 in renderOutputs */
        parts.push(`<path d="M${sOut.x},${sOut.y} H${sOut.x + 30}"` +
                   ` fill="none" stroke="${color}" stroke-width="2"/>`);
    }

    return parts.join('\n');
}

/*
 * Render input nodes as clickable toggle buttons.
 * Each button shows the current value (0/1) and calls
 * LogicDiag._toggle(this) on click.
 */
function renderInputs(graph, pos, simState) {
    const parts = [];
    for (const inp of graph.inputs) {
        const p = pos.get(inp.id);
        if (!p)
            continue;

        const val   = simState.get(inp.id) ?? 0;
        const color = sigColor(val);
        const lx    = p.x - GATE_W / 2; /* left edge of input area */

        /* Label to the left of the button */
        parts.push(`<text x="${lx - 8}" y="${p.y + 5}"` +
                   ` font-family="monospace" font-size="14" fill="#222"` +
                   ` text-anchor="end">${escapeXml(inp.label)}</text>`);

        /* Clickable toggle button: colored rect + value digit */
        parts.push(
          `<g class="ld-input" cursor="pointer"` +
          ` onclick="LogicDiag._toggle(this)"` +
          ` data-node="${escapeXml(inp.id)}">` +
          `<rect x="${lx}" y="${p.y - 12}" width="24" height="24"` +
          ` rx="4" fill="${color}" stroke="#333" stroke-width="1.5"/>` +
          `<text x="${lx + 12}" y="${p.y + 5}"` +
          ` text-anchor="middle" font-family="monospace"` +
          ` font-size="13" font-weight="bold" fill="#fff"` +
          ` pointer-events="none">${val}</text>` +
          `</g>`);

        /* Wire from right edge of button to gate input pin */
        parts.push(`<line x1="${lx + 24}" y1="${p.y}"` +
                   ` x2="${p.x + GATE_W / 2}" y2="${p.y}"` +
                   ` stroke="${color}" stroke-width="2"/>`);
    }
    return parts.join('\n');
}

/*
 * Render output labels and colored dots to the right of each output
 * gate's output pin.
 */
function renderOutputs(graph, lo, simState) {
    const { pos } = lo;
    const parts   = [];
    for (const out of graph.outputs) {
        const srcId   = out.ins[0];
        const srcNode = graph.nodes.get(srcId);
        if (!srcNode)
            continue;

        const srcPos = pos.get(srcId);
        if (!srcPos)
            continue;

        const color = sigColor(simState.get(srcId) ?? null);
        const op    = outPin(srcNode.type, srcPos.x, srcPos.y);
        parts.push(`<circle cx="${op.x + 30}" cy="${op.y}" r="4"` +
                   ` fill="${color}"/>`);
        parts.push(`<text x="${op.x + 38}" y="${op.y + 5}"` +
                   ` font-family="monospace" font-size="14" fill="#222"` +
                   `>${escapeXml(out.label)}</text>`);
    }
    return parts.join('\n');
}

/*
 * Render a complete SVG diagram string.
 * graph    - parsed Graph
 * lo       - layout result from layout()
 * simState - SimState (Map<id, 0|1|null>)
 */
function render(graph, lo, simState) {
    const { pos, width, height } = lo;

    const parts = [ `<svg xmlns="http://www.w3.org/2000/svg"` +
                    ` class="logicdiag"` +
                    ` viewBox="0 0 ${width} ${height}"` +
                    ` width="${width}" height="${height}"` +
                    ` style="display:block;max-width:100%;margin:auto;">` ];

    parts.push(renderWires(graph, lo, simState));

    for (const gate of graph.gates) {
        const p = pos.get(gate.id);
        if (!p)
            continue;
        parts.push(gateShape(gate.type, p.x, p.y));
    }

    parts.push(renderInputs(graph, pos, simState));
    parts.push(renderOutputs(graph, lo, simState));

    parts.push('</svg>');
    return parts.join('\n');
}

LogicDiag._render = render;

/* ================================================================
 * Diagram Registry
 * ================================================================ */

/* Map from SVG DOM element -> { graph, lo, state, timerId } */
const _diagrams = new Map();

/*
 * Re-simulate the circuit and update the SVG innerHTML.
 * Schedules a tick if the circuit is oscillating.
 */
function redraw(entry) {
    if (entry.timerId) {
        clearTimeout(entry.timerId);
        entry.timerId = null;
    }

    const { state : newState, stable } =
      checkStability(entry.graph, entry.state);
    entry.state = newState;

    const inner = [
        renderWires(entry.graph, entry.lo, newState),
        ...entry.graph.gates.map(g => {
            const p = entry.lo.pos.get(g.id);
            return p ? gateShape(g.type, p.x, p.y) : '';
        }),
        renderInputs(entry.graph, entry.lo.pos, newState),
        renderOutputs(entry.graph, entry.lo, newState),
    ].join('\n');
    entry.svgEl.innerHTML = inner;

    if (!stable)
        entry.timerId = setTimeout(() => redraw(entry), LogicDiag.tickRate);
}

/*
 * Toggle the value of an input node and redraw the diagram.
 * 'el' is the <g class="ld-input"> element that was clicked.
 */
LogicDiag._toggle = function(el) {
    const svgEl  = el.closest('svg');
    const nodeId = el.getAttribute('data-node');
    const entry  = _diagrams.get(svgEl);
    if (!entry || !nodeId)
        return;
    const cur = entry.state.get(nodeId) ?? 0;
    entry.state.set(nodeId, cur === 1 ? 0 : 1);
    redraw(entry);
};

/*
 * Parse, layout, simulate, and render a diagram from DSL text.
 * Returns the SVG DOM element. Registers the diagram for interactivity.
 * Only callable in a browser environment (requires document).
 */
function renderDiagram(text) {
    const graph = parse(text);
    const lo    = layout(graph);

    const state = new Map();
    for (const inp of graph.inputs)
        state.set(inp.id, inp.init);
    for (const gate of graph.gates)
        state.set(gate.id, null);

    const { state : initState, stable } = checkStability(graph, state);

    const svgStr = render(graph, lo, initState);

    const tmp     = document.createElement('div');
    tmp.innerHTML = svgStr;
    const svgEl   = tmp.firstChild;

    const entry = {
        graph,
        lo,
        svgEl,
        state : initState,
        timerId : null,
    };
    _diagrams.set(svgEl, entry);

    if (!stable) {
        entry.timerId = setTimeout(() => redraw(entry), LogicDiag.tickRate);
    }

    return svgEl;
}

/* ================================================================
 * Export
 * ================================================================ */

global.LogicDiag = LogicDiag;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LogicDiag;
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        const scripts =
          document.querySelectorAll('script[type="text/logicdiag"]');
        scripts.forEach(function(script) {
            try {
                const svgEl = renderDiagram(script.textContent);
                const wrap = document.createElement('div');
                wrap.style.textAlign = 'center';
                wrap.appendChild(svgEl);
                script.parentNode.insertBefore(wrap, script.nextSibling);
            } catch (e) {
                const err = document.createElement('pre');
                err.style.cssText =
                  'color:red;border:1px solid red;padding:8px;' +
                  'font-family:monospace;';
                err.textContent = 'logic-diagram error: ' + e.message;
                script.parentNode.insertBefore(err, script.nextSibling);
            }
        });
    });
}
}(typeof window !== 'undefined' ? window : global));
