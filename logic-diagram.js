/* logic-diagram.js — interactive logic gate diagrams for org-mode blogs */
(function (global) {
    'use strict';

    /* ================================================================
     * Configuration
     * ================================================================ */

    const LogicDiag = {
        tickRate: 1000, /* ms between ticks for oscillating circuits */
        maxSteps: 100,  /* max fixed-point iterations before declaring oscillation */
    };

    /* ================================================================
     * Parser
     * ================================================================ */

    const GATE_TYPES = new Set([
        'not', 'buf', 'and', 'or', 'nand', 'nor', 'xor', 'xnor'
    ]);

    /* Split a DSL line into tokens, respecting quoted strings. */
    function tokenizeLine(line) {
        const tokens = [];
        let i = 0;
        while (i < line.length) {
            while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
            if (i >= line.length) break;
            if (line[i] === '"') {
                let j = i + 1;
                while (j < line.length && line[j] !== '"') j++;
                if (j >= line.length) {
                    throw new Error(
                        'Unterminated quoted string: ' + line
                    );
                }
                tokens.push(line.slice(i, j + 1));
                i = j + 1;
            } else {
                let j = i;
                while (j < line.length && line[j] !== ' ' && line[j] !== '\t') j++;
                tokens.push(line.slice(i, j));
                i = j;
            }
        }
        return tokens;
    }

    /* Remove surrounding double quotes from a token. */
    function unquote(s) {
        return (s.startsWith('"') && s.endsWith('"'))
            ? s.slice(1, -1)
            : s;
    }

    /*
     * Parse a DSL string and return a Graph object:
     *   { nodes: Map, inputs: Node[], outputs: Node[], gates: Node[] }
     */
    function parse(text) {
        const nodes = new Map();
        const inputs = [];
        const outputs = [];
        const gates = [];
        let currentStage = 1;

        const lines = text.split('\n');
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;

            const tokens = tokenizeLine(line);
            const kw = tokens[0].toLowerCase();

            if (kw === 'stage') {
                const n = parseInt(tokens[1], 10);
                if (isNaN(n)) {
                    throw new Error(
                        'Invalid stage number: ' + tokens[1]
                    );
                }
                currentStage = n;
                continue;
            }

            if (kw === 'input') {
                const id = tokens[1];
                const label = tokens[2] ? unquote(tokens[2]) : id;
                const node = { id, type: 'input', ins: [], label, stage: 0 };
                nodes.set(id, node);
                inputs.push(node);
                continue;
            }

            if (kw === 'output') {
                const id = tokens[1];
                if (!nodes.has(id)) {
                    throw new Error(
                        'Undefined node referenced in output: ' + id
                    );
                }
                const label = tokens[2] ? unquote(tokens[2]) : id;
                const node = { id, type: 'output', ins: [id], label,
                               stage: currentStage + 1 };
                outputs.push(node);
                continue;
            }

            if (GATE_TYPES.has(kw)) {
                const id = tokens[1];
                const ins = tokens.slice(2);
                const node = { id, type: kw, ins, label: id,
                               stage: currentStage };
                nodes.set(id, node);
                gates.push(node);
                continue;
            }

            throw new Error('Unknown gate type: ' + tokens[0]);
        }

        for (const gate of gates) {
            for (const inp of gate.ins) {
                if (!nodes.has(inp)) {
                    throw new Error('Undefined node referenced: ' + inp);
                }
            }
        }

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

    /*
     * Assign center {x, y} coordinates to every node in 'graph'.
     * Returns { pos: Map<id, {x,y}>, width: number, height: number,
     *           maxStage: number }.
     */
    function layout(graph) {
        /* Group nodes by stage. Outputs are placed one stage after the max. */
        const byStage = new Map();

        const addToStage = (stage, node) => {
            if (!byStage.has(stage)) byStage.set(stage, []);
            byStage.get(stage).push(node);
        };

        for (const n of graph.inputs) addToStage(0, n);
        for (const n of graph.gates)  addToStage(n.stage, n);

        let maxGateStage = 0;
        for (const n of graph.gates) {
            if (n.stage > maxGateStage) maxGateStage = n.stage;
        }
        /* Output labels are positioned by the renderer from gate output pins.
         * They are not added to byStage to avoid overwriting gate positions. */
        const outputStage = maxGateStage + 1;

        /* Find the tallest column to set the canvas height. */
        let maxNodesInCol = 0;
        for (const nodes of byStage.values()) {
            if (nodes.length > maxNodesInCol) maxNodesInCol = nodes.length;
        }

        const canvasHeight = Math.max(
            maxNodesInCol * ROW_SPACING + 2 * PADDING,
            GATE_H + 2 * PADDING
        );
        const canvasWidth =
            (outputStage + 1) * COL_SPACING + 2 * PADDING + GATE_W;

        const pos = new Map();

        for (const [stage, nodes] of byStage.entries()) {
            const cx = PADDING + GATE_W / 2 + stage * COL_SPACING;
            const totalHeight = (nodes.length - 1) * ROW_SPACING;
            const startY = canvasHeight / 2 - totalHeight / 2;
            nodes.forEach((node, i) => {
                pos.set(node.id, { x: cx, y: startY + i * ROW_SPACING });
            });
        }

        return { pos, width: canvasWidth, height: canvasHeight,
                 maxStage: outputStage };
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
                if (inputs.some(v => v === 0)) return 0;
                if (inputs.some(v => v === null)) return null;
                return 1;
            case 'or':
                if (inputs.some(v => v === 1)) return 1;
                if (inputs.some(v => v === null)) return null;
                return 0;
            case 'nand':
                if (inputs.some(v => v === 0)) return 1;
                if (inputs.some(v => v === null)) return null;
                return 0;
            case 'nor':
                if (inputs.some(v => v === 1)) return 0;
                if (inputs.some(v => v === null)) return null;
                return 1;
            case 'xor':
                if (inputs.some(v => v === null)) return null;
                return inputs.reduce((a, b) => a ^ b, 0);
            case 'xnor':
                if (inputs.some(v => v === null)) return null;
                return inputs.reduce((a, b) => a ^ b, 0) === 0 ? 1 : 0;
            default:
                return null;
        }
    }

    /*
     * Run fixed-point simulation on 'graph' starting from 'initState'.
     * Returns a SimState Map<id, 0|1|null> after up to LogicDiag.maxSteps
     * iterations. Converges in one pass for DAGs; stops at maxSteps for
     * oscillating circuits.
     */
    function simulate(graph, initState) {
        const state = new Map(initState);
        /* Seed gate nodes not present in initState to null. */
        for (const gate of graph.gates) {
            if (!state.has(gate.id)) state.set(gate.id, null);
        }

        for (let step = 0; step < LogicDiag.maxSteps; step++) {
            let changed = false;
            for (const gate of graph.gates) {
                const inputs = gate.ins.map(id => state.get(id) ?? null);
                const val = evalGate(gate.type, inputs);
                if (state.get(gate.id) !== val) {
                    state.set(gate.id, val);
                    changed = true;
                }
            }
            if (!changed) return state;
        }
        return state;
    }

    LogicDiag._simulate = simulate;

    /* ================================================================
     * SVG Renderer
     * ================================================================ */

    /* Gate geometry constants (all in pixels, relative to gate center). */
    const G_L   = 20; /* distance from center to left edge (input pin x) */
    const G_R   = 20; /* distance from center to right edge (output pin x, non-inverted) */
    const G_H   = 13; /* half-height of gate body */
    const G_PY  = 8;  /* y-offset for the two input pins on 2-input gates */
    const G_BUB = 4;  /* invert bubble radius */

    /* Signal state -> CSS color string */
    const COLOR_HIGH    = '#22c55e'; /* bright green */
    const COLOR_LOW     = '#b45252'; /* muted red    */
    const COLOR_UNKNOWN = '#888888'; /* neutral grey */

    function sigColor(val) {
        if (val === 1)    return COLOR_HIGH;
        if (val === 0)    return COLOR_LOW;
        return COLOR_UNKNOWN;
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
                return `<polygon points="${cx-G_L},${cy-G_H} ${cx-G_L},${cy+G_H} ${cx+G_R},${cy}" ${sk}/>`;

            case 'not':
                /* Triangle tip at cx+G_R-2*G_BUB so bubble right edge = cx+G_R */
                return (
                    `<polygon points="${cx-G_L},${cy-G_H} ${cx-G_L},${cy+G_H} ${cx+G_R-G_BUB*2},${cy}" ${sk}/>` +
                    `<circle cx="${cx+G_R-G_BUB}" cy="${cy}" r="${G_BUB}" ${sk}/>`
                );

            case 'and':
                /* D-shape: flat left side, two quadratic beziers on the right */
                return (
                    `<path d="M${cx-G_L},${cy-G_H} H${cx-4}` +
                    ` Q${cx+G_R},${cy-G_H} ${cx+G_R},${cy}` +
                    ` Q${cx+G_R},${cy+G_H} ${cx-4},${cy+G_H}` +
                    ` H${cx-G_L} Z" ${sk}/>`
                );

            case 'nand': {
                /* D-shape body ending before bubble */
                const bx = cx + G_R - G_BUB * 2; /* body right edge = cx+12 */
                return (
                    `<path d="M${cx-G_L},${cy-G_H} H${cx-4}` +
                    ` Q${bx},${cy-G_H} ${bx},${cy}` +
                    ` Q${bx},${cy+G_H} ${cx-4},${cy+G_H}` +
                    ` H${cx-G_L} Z" ${sk}/>` +
                    `<circle cx="${cx+G_R-G_BUB}" cy="${cy}" r="${G_BUB}" ${sk}/>`
                );
            }

            case 'or':
                /* Curved back, pointed front */
                return (
                    `<path d="M${cx-G_L},${cy-G_H}` +
                    ` Q${cx-G_L+12},${cy-G_H} ${cx+G_R},${cy}` +
                    ` Q${cx-G_L+12},${cy+G_H} ${cx-G_L},${cy+G_H}` +
                    ` Q${cx-G_L+7},${cy} ${cx-G_L},${cy-G_H} Z" ${sk}/>`
                );

            case 'nor': {
                const bx = cx + G_R - G_BUB * 2;
                return (
                    `<path d="M${cx-G_L},${cy-G_H}` +
                    ` Q${cx-G_L+12},${cy-G_H} ${bx},${cy}` +
                    ` Q${cx-G_L+12},${cy+G_H} ${cx-G_L},${cy+G_H}` +
                    ` Q${cx-G_L+7},${cy} ${cx-G_L},${cy-G_H} Z" ${sk}/>` +
                    `<circle cx="${cx+G_R-G_BUB}" cy="${cy}" r="${G_BUB}" ${sk}/>`
                );
            }

            case 'xor':
                /* OR body + extra arc on left */
                return (
                    `<path d="M${cx-G_L},${cy-G_H}` +
                    ` Q${cx-G_L+12},${cy-G_H} ${cx+G_R},${cy}` +
                    ` Q${cx-G_L+12},${cy+G_H} ${cx-G_L},${cy+G_H}` +
                    ` Q${cx-G_L+7},${cy} ${cx-G_L},${cy-G_H} Z" ${sk}/>` +
                    `<path d="M${cx-G_L-5},${cy-G_H}` +
                    ` Q${cx-G_L+2},${cy} ${cx-G_L-5},${cy+G_H}" fill="none" ${sk}/>`
                );

            case 'xnor': {
                const bx = cx + G_R - G_BUB * 2;
                return (
                    `<path d="M${cx-G_L},${cy-G_H}` +
                    ` Q${cx-G_L+12},${cy-G_H} ${bx},${cy}` +
                    ` Q${cx-G_L+12},${cy+G_H} ${cx-G_L},${cy+G_H}` +
                    ` Q${cx-G_L+7},${cy} ${cx-G_L},${cy-G_H} Z" ${sk}/>` +
                    `<path d="M${cx-G_L-5},${cy-G_H}` +
                    ` Q${cx-G_L+2},${cy} ${cx-G_L-5},${cy+G_H}" fill="none" ${sk}/>` +
                    `<circle cx="${cx+G_R-G_BUB}" cy="${cy}" r="${G_BUB}" ${sk}/>`
                );
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
        return { x: cx + G_R, y: cy };
    }

    /*
     * Return input pin positions [{ x, y }, ...] for a gate at (cx, cy).
     * For XOR/XNOR the extra left arc shifts the effective pin x inward.
     */
    function inPins(type, cx, cy) {
        if (type === 'not' || type === 'buf') {
            return [{ x: cx - G_L, y: cy }];
        }
        const isXorFamily = type === 'xor' || type === 'xnor';
        const x = isXorFamily ? cx - G_L + 5 : cx - G_L;
        return [{ x, y: cy - G_PY }, { x, y: cy + G_PY }];
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
        const parts = [];
        let feedbackIdx = 0;

        for (const node of [...graph.inputs, ...graph.gates]) {
            const tPos = pos.get(node.id);
            if (!tPos) continue;
            const pins = inPins(node.type, tPos.x, tPos.y);

            node.ins.forEach((srcId, i) => {
                const srcNode = graph.nodes.get(srcId) ||
                                graph.inputs.find(n => n.id === srcId);
                if (!srcNode) return;
                const sPos = pos.get(srcId);
                if (!sPos) return;

                const color = sigColor(simState.get(srcId) ?? null);
                const pin   = pins[i] || pins[0];
                const sOut  = outPin(srcNode.type, sPos.x, sPos.y);
                const tx = pin.x, ty = pin.y;
                const sx = sOut.x, sy = sOut.y;

                let d;
                if (sx < tx - 5) {
                    /* Forward wire: horizontal, diagonal, short stub at dest */
                    const dstStub = 12;
                    const stub = Math.min(30, (tx - sx) * 0.3);
                    d = `M${sx},${sy} H${tx - stub}` +
                        ` L${tx - dstStub},${ty} H${tx}`;
                } else {
                    /* Backward (feedback) wire: route above or below diagram */
                    const margin = 20 + feedbackIdx * 14;
                    const routeY = feedbackIdx % 2 === 0
                        ? margin
                        : height - margin;
                    feedbackIdx++;
                    d = `M${sx},${sy} H${sx + 16} V${routeY}` +
                        ` H${tx - 16} V${ty} H${tx}`;
                }

                parts.push(
                    `<path d="${d}" fill="none" stroke="${color}"` +
                    ` stroke-width="2" stroke-linejoin="round"/>`
                );
            });
        }

        /* Draw wires from gate output pins to output label dots */
        for (const out of graph.outputs) {
            const srcId  = out.ins[0];
            const srcNode = graph.nodes.get(srcId);
            if (!srcNode) continue;
            const srcPos = pos.get(srcId);
            if (!srcPos) continue;
            const color = sigColor(simState.get(srcId) ?? null);
            const sOut  = outPin(srcNode.type, srcPos.x, srcPos.y);
            /* The output dot is rendered at sOut.x + 30 in renderOutputs */
            parts.push(
                `<path d="M${sOut.x},${sOut.y} H${sOut.x + 30}"` +
                ` fill="none" stroke="${color}" stroke-width="2"/>`
            );
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
            if (!p) continue;
            const val   = simState.get(inp.id) ?? 0;
            const color = sigColor(val);
            const lx = p.x - GATE_W / 2; /* left edge of input area */

            /* Label to the left of the button */
            parts.push(
                `<text x="${lx - 8}" y="${p.y + 5}"` +
                ` font-family="monospace" font-size="14" fill="#222"` +
                ` text-anchor="end">${escapeXml(inp.label)}</text>`
            );

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
                `</g>`
            );

            /* Wire from right edge of button to gate input pin */
            parts.push(
                `<line x1="${lx + 24}" y1="${p.y}"` +
                ` x2="${p.x + GATE_W / 2}" y2="${p.y}"` +
                ` stroke="${color}" stroke-width="2"/>`
            );
        }
        return parts.join('\n');
    }

    /*
     * Render output labels and colored dots to the right of each output
     * gate's output pin.
     */
    function renderOutputs(graph, lo, simState) {
        const { pos } = lo;
        const parts = [];
        for (const out of graph.outputs) {
            const srcId  = out.ins[0];
            const srcNode = graph.nodes.get(srcId);
            if (!srcNode) continue;
            const srcPos = pos.get(srcId);
            if (!srcPos) continue;
            const color = sigColor(simState.get(srcId) ?? null);
            const op    = outPin(srcNode.type, srcPos.x, srcPos.y);
            parts.push(
                `<circle cx="${op.x + 30}" cy="${op.y}" r="4"` +
                ` fill="${color}"/>`
            );
            parts.push(
                `<text x="${op.x + 38}" y="${op.y + 5}"` +
                ` font-family="monospace" font-size="14" fill="#222"` +
                `>${escapeXml(out.label)}</text>`
            );
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
        const parts = [
            `<svg xmlns="http://www.w3.org/2000/svg"` +
            ` viewBox="0 0 ${width} ${height}"` +
            ` width="${width}" height="${height}"` +
            ` style="display:block;max-width:100%;">`
        ];

        parts.push(renderWires(graph, lo, simState));

        for (const gate of graph.gates) {
            const p = pos.get(gate.id);
            if (!p) continue;
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

        const newState = simulate(entry.graph, entry.state);
        entry.state    = newState;

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

        /* Check for oscillation: compare state to previous */
        if (entry.prevState) {
            let changed = false;
            for (const [id, val] of newState) {
                if (entry.prevState.get(id) !== val) {
                    changed = true;
                    break;
                }
            }
            if (changed) {
                entry.timerId = setTimeout(() => redraw(entry),
                                           LogicDiag.tickRate);
            }
        }
        entry.prevState = new Map(newState);
    }

    /*
     * Toggle the value of an input node and redraw the diagram.
     * 'el' is the <g class="ld-input"> element that was clicked.
     */
    LogicDiag._toggle = function (el) {
        const svgEl  = el.closest('svg');
        const nodeId = el.getAttribute('data-node');
        const entry  = _diagrams.get(svgEl);
        if (!entry || !nodeId) return;
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
        for (const inp of graph.inputs)  state.set(inp.id, 0);
        for (const gate of graph.gates)  state.set(gate.id, null);

        const initState = simulate(graph, state);

        const svgStr = render(graph, lo, initState);

        const tmp   = document.createElement('div');
        tmp.innerHTML = svgStr;
        const svgEl = tmp.firstChild;

        const entry = {
            graph,
            lo,
            svgEl,
            state:     initState,
            prevState: null,
            timerId:   null,
        };
        _diagrams.set(svgEl, entry);

        /* Start oscillation check on next tick */
        entry.prevState = new Map(initState);
        entry.timerId   = setTimeout(() => redraw(entry), LogicDiag.tickRate);

        return svgEl;
    }

    /* ================================================================
     * Bootstrap
     * ================================================================ */

    /* ================================================================
     * Export
     * ================================================================ */

    global.LogicDiag = LogicDiag;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LogicDiag;
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function () {
            const scripts = document.querySelectorAll(
                'script[type="text/logicdiag"]'
            );
            scripts.forEach(function (script) {
                try {
                    const svgEl = renderDiagram(script.textContent);
                    script.parentNode.insertBefore(svgEl, script.nextSibling);
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
