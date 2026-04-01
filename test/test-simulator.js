'use strict';

const { test, assert, done } = require('./helpers');
const LogicDiag = require('../logic-diagram');

function makeGraph(dsl) {
    return LogicDiag._parse(dsl);
}

function sim(dsl, inputVals) {
    const g = makeGraph(dsl);
    const state = new Map();
    for (const inp of g.inputs) state.set(inp.id, inputVals[inp.id] ?? null);
    return LogicDiag._simulate(g, state);
}

test('simulate: NOT gate', () => {
    const s = sim('input D\nnot n1 D\noutput n1\n', { D: 1 });
    assert.strictEqual(s.get('n1'), 0);
});

test('simulate: NOT gate low input', () => {
    const s = sim('input D\nnot n1 D\noutput n1\n', { D: 0 });
    assert.strictEqual(s.get('n1'), 1);
});

test('simulate: AND gate both high', () => {
    const s = sim('input A\ninput B\nand out A B\noutput out\n', { A: 1, B: 1 });
    assert.strictEqual(s.get('out'), 1);
});

test('simulate: AND gate one low', () => {
    const s = sim('input A\ninput B\nand out A B\noutput out\n', { A: 1, B: 0 });
    assert.strictEqual(s.get('out'), 0);
});

test('simulate: OR gate', () => {
    const s = sim('input A\ninput B\nor out A B\noutput out\n', { A: 0, B: 1 });
    assert.strictEqual(s.get('out'), 1);
});

test('simulate: NAND gate', () => {
    const s = sim('input A\ninput B\nnand out A B\noutput out\n', { A: 1, B: 1 });
    assert.strictEqual(s.get('out'), 0);
});

test('simulate: NOR gate', () => {
    const s = sim('input A\ninput B\nnor out A B\noutput out\n', { A: 0, B: 0 });
    assert.strictEqual(s.get('out'), 1);
});

test('simulate: XOR gate', () => {
    const s = sim('input A\ninput B\nxor out A B\noutput out\n', { A: 1, B: 0 });
    assert.strictEqual(s.get('out'), 1);
});

test('simulate: XOR gate same inputs', () => {
    const s = sim('input A\ninput B\nxor out A B\noutput out\n', { A: 1, B: 1 });
    assert.strictEqual(s.get('out'), 0);
});

test('simulate: XNOR gate', () => {
    const s = sim('input A\ninput B\nxnor out A B\noutput out\n', { A: 1, B: 1 });
    assert.strictEqual(s.get('out'), 1);
});

test('simulate: BUF gate', () => {
    const s = sim('input D\nbuf b D\noutput b\n', { D: 1 });
    assert.strictEqual(s.get('b'), 1);
});

test('simulate: unknown input stays null', () => {
    const s = sim('input D\nnot n1 D\noutput n1\n', { D: null });
    assert.strictEqual(s.get('n1'), null);
});

test('simulate: chain of gates', () => {
    /* NOT(NOT(D)) == D */
    const s = sim('input D\nnot n1 D\nnot n2 n1\noutput n2\n', { D: 1 });
    assert.strictEqual(s.get('n2'), 1);
});

test('simulate: SR-NAND latch stable Q=1 state', () => {
    /* S=0, R=1 -> Q=1, Qb=0 (set state) */
    const g = makeGraph(
        'input S\ninput R\n' +
        'nand Q  S  Qb\n' +
        'nand Qb R  Q\n' +
        'output Q\noutput Qb\n'
    );
    const state = new Map([['S', 0], ['R', 1], ['Q', null], ['Qb', null]]);
    const result = LogicDiag._simulate(g, state);
    assert.strictEqual(result.get('Q'), 1);
    assert.strictEqual(result.get('Qb'), 0);
});

test('simulate: returns SimState directly (Map)', () => {
    const g = makeGraph('input D\nnot n1 D\noutput n1\n');
    const state = new Map([['D', 0]]);
    const result = LogicDiag._simulate(g, state);
    assert.ok(result instanceof Map, 'should return a Map');
    assert.strictEqual(result.get('n1'), 1);
});

test('simulate: NAND short-circuit (one input 0 -> output 1 regardless)', () => {
    /* NAND(0, null) must be 1, not null */
    const g = makeGraph('input A\ninput B\nnand out A B\noutput out\n');
    const state = new Map([['A', 0], ['B', null]]);
    const result = LogicDiag._simulate(g, state);
    assert.strictEqual(result.get('out'), 1);
});

test('simulate: gate nodes seeded to null when missing from initState', () => {
    /* Pass only input values; gate nodes must not appear as undefined */
    const g = makeGraph('input D\nnot n1 D\noutput n1\n');
    const state = new Map([['D', 1]]);
    const result = LogicDiag._simulate(g, state);
    assert.notStrictEqual(result.get('n1'), undefined);
    assert.strictEqual(result.get('n1'), 0);
});

test('simulate: oscillating circuit does not stabilize within maxSteps', () => {
    /* A NOT gate feeding back into itself oscillates indefinitely.
     * simulate() should hit maxSteps and return without converging. */
    const feedbackGraph = {
        nodes: new Map([['osc', { id: 'osc', type: 'not', ins: ['osc'],
                                  label: 'osc', stage: 1 }]]),
        inputs: [],
        outputs: [],
        gates: [{ id: 'osc', type: 'not', ins: ['osc'],
                  label: 'osc', stage: 1 }],
    };
    const state = new Map([['osc', 0]]);

    /* Reduce maxSteps to keep the test fast */
    const savedMax = LogicDiag.maxSteps;
    LogicDiag.maxSteps = 5;
    const result = LogicDiag._simulate(feedbackGraph, state);
    LogicDiag.maxSteps = savedMax;

    /* The circuit flips every iteration so it cannot stabilize */
    /* After 5 steps from osc=0: 0->1->0->1->0->1, final state is 1 */
    assert.strictEqual(result.get('osc'), 1);
    /* Verify it actually ran maxSteps (osc changed, so it did not
     * short-circuit early as "stable") */
    assert.notStrictEqual(result.get('osc'), 0,
        'oscillating circuit should have changed state');
});

done();
