'use strict';

const { test, assert, done } = require('./helpers');
const LogicDiag = require('../logic-diagram');

function render(dsl) {
    const g  = LogicDiag._parse(dsl);
    const lo = LogicDiag._layout(g);
    const state = new Map();
    for (const n of g.inputs) state.set(n.id, 0);
    const simState = LogicDiag._simulate(g, state);
    return LogicDiag._render(g, lo, simState);
}

test('render: returns an SVG string', () => {
    const svg = render('input D\nnot n1 D\noutput n1\n');
    assert.ok(svg.startsWith('<svg'), 'should start with <svg');
    assert.ok(svg.endsWith('</svg>'), 'should end with </svg>');
});

test('render: SVG has viewBox attribute', () => {
    const svg = render('input D\nnot n1 D\noutput n1\n');
    assert.ok(svg.includes('viewBox='), 'should have viewBox');
});

test('render: contains a path element for gate shape', () => {
    const svg = render('input D\nnot n1 D\noutput n1\n');
    assert.ok(svg.includes('<path') || svg.includes('<polygon'), 'should contain a shape element');
});

test('render: contains input label text', () => {
    const svg = render('input D\nnot n1 D\noutput n1\n');
    assert.ok(svg.includes('>D<'), 'should contain input label D');
});

test('render: contains output label text', () => {
    const svg = render('input A\nbuf b A\noutput b "Result"\n');
    assert.ok(svg.includes('>Result<'), 'should contain output label Result');
});

test('render: all gate types produce SVG without throwing', () => {
    const types = ['not', 'buf', 'and', 'or', 'nand', 'nor', 'xor', 'xnor'];
    for (const t of types) {
        const ins = (t === 'not' || t === 'buf') ? 'A' : 'A B';
        const inDecls = (t === 'not' || t === 'buf')
            ? 'input A\n'
            : 'input A\ninput B\n';
        const dsl = inDecls + t + ' g ' + ins + '\noutput g\n';
        assert.doesNotThrow(() => render(dsl), t + ' gate should render');
    }
});

test('render: wire color for low signal is muted red', () => {
    /* All inputs start at 0 (low), buf output is also 0 */
    const svg = render('input A\nbuf b A\noutput b\n');
    assert.ok(svg.includes('#b45252') || svg.includes('#888888'),
        'should contain low or unknown color');
});

test('render: wire color for high signal is bright green', () => {
    /* NOT(0) = 1 */
    const svg = render('input D\nnot n1 D\noutput n1\n');
    assert.ok(svg.includes('#22c55e'), 'should contain high color (green)');
});

test('render: SVG contains path elements when there are gates', () => {
    /* With wires implemented, a multi-gate circuit must have path elements */
    const svg = render('input A\ninput B\nand out A B\noutput out\n');
    assert.ok(svg.includes('<path'), 'should have path elements for wires and/or gates');
});

test('render: feedback wire present for SR-NAND latch', () => {
    const svg = render(
        'input S\ninput R\n' +
        'stage 1\nnand Q S Qb\n' +
        'stage 1\nnand Qb R Q\n' +
        'output Q\noutput Qb\n'
    );
    /* The latch has feedback wires — SVG should have multiple path elements */
    const pathCount = (svg.match(/<path/g) || []).length;
    assert.ok(pathCount >= 2, 'latch should have multiple wire paths');
});

test('pin positions: AND output pin is shorter than NAND', () => {
    const andOut  = LogicDiag._outPin('and',  100, 50);
    const nandOut = LogicDiag._outPin('nand', 100, 50);
    assert.ok(andOut.x < nandOut.x,
        'AND output x should be less than NAND output x');
});

test('pin positions: OR output pin is shorter than NOR', () => {
    const orOut  = LogicDiag._outPin('or',  100, 50);
    const norOut = LogicDiag._outPin('nor', 100, 50);
    assert.ok(orOut.x < norOut.x,
        'OR output x should be less than NOR output x');
});

test('pin positions: XOR output pin is shorter than XNOR', () => {
    const xorOut  = LogicDiag._outPin('xor',  100, 50);
    const xnorOut = LogicDiag._outPin('xnor', 100, 50);
    assert.ok(xorOut.x < xnorOut.x,
        'XOR output x should be less than XNOR output x');
});

test('pin positions: BUF output pin is shorter than NOT', () => {
    const bufOut = LogicDiag._outPin('buf', 100, 50);
    const notOut = LogicDiag._outPin('not', 100, 50);
    assert.ok(bufOut.x < notOut.x,
        'BUF output x should be less than NOT output x');
});

test('pin positions: outPin y equals cy for all gate types', () => {
    const types = ['not', 'buf', 'and', 'or', 'nand', 'nor', 'xor', 'xnor'];
    for (const t of types) {
        const p = LogicDiag._outPin(t, 100, 50);
        assert.strictEqual(p.y, 50, t + ' outPin y should equal cy');
    }
});

test('pin positions: inPins x equals cx - halfWidth (gate centered)', () => {
    const types = ['not', 'buf', 'and', 'or', 'nand', 'nor', 'xor', 'xnor'];
    for (const t of types) {
        const out = LogicDiag._outPin(t, 100, 50);
        const ins = LogicDiag._inPins(t, 100, 50);
        let expectedInX = 100 - (out.x - 100); /* cx - halfWidth */
        if (t === 'xor' || t === 'xnor')
            expectedInX += 5; /* Account for XOR/XNOR arc shift */
        assert.strictEqual(ins[0].x, expectedInX,
            t + ' inPin x should be cx - halfWidth');
    }
});

test('pin positions: single-input gates return one pin', () => {
    assert.strictEqual(LogicDiag._inPins('not', 100, 50).length, 1);
    assert.strictEqual(LogicDiag._inPins('buf', 100, 50).length, 1);
});

test('pin positions: two-input gates return two pins', () => {
    const twoInput = ['and', 'or', 'nand', 'nor', 'xor', 'xnor'];
    for (const t of twoInput)
        assert.strictEqual(LogicDiag._inPins(t, 100, 50).length, 2,
            t + ' should have 2 input pins');
});

done();
