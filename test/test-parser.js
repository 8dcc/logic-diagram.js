'use strict';

const { test, assert, done } = require('./helpers');
const LogicDiag = require('../logic-diagram');

test('parse: inputs are collected', () => {
    const g = LogicDiag._parse('input D\ninput E\n');
    assert.strictEqual(g.inputs.length, 2);
    assert.strictEqual(g.inputs[0].id, 'D');
    assert.strictEqual(g.inputs[1].id, 'E');
    assert.strictEqual(g.inputs[0].type, 'input');
    assert.strictEqual(g.inputs[0].stage, 0);
});

test('parse: input label defaults to id', () => {
    const g = LogicDiag._parse('input D\n');
    assert.strictEqual(g.inputs[0].label, 'D');
});

test('parse: input with explicit label', () => {
    const g = LogicDiag._parse('input D 0 "Data"\n');
    assert.strictEqual(g.inputs[0].label, 'Data');
});

test('parse: gate with inputs', () => {
    const g = LogicDiag._parse('input A\ninput B\nand out A B\n');
    assert.strictEqual(g.gates.length, 1);
    const gate = g.gates[0];
    assert.strictEqual(gate.id, 'out');
    assert.strictEqual(gate.type, 'and');
    assert.deepStrictEqual(gate.ins, ['A', 'B']);
});

test('parse: not gate has one input', () => {
    const g = LogicDiag._parse('input D\nnot n1 D\n');
    assert.strictEqual(g.gates[0].ins.length, 1);
    assert.strictEqual(g.gates[0].ins[0], 'D');
});

test('parse: output node', () => {
    const g = LogicDiag._parse('input A\nbuf b A\noutput b "Result"\n');
    assert.strictEqual(g.outputs.length, 1);
    assert.strictEqual(g.outputs[0].id, 'b');
    assert.strictEqual(g.outputs[0].label, 'Result');
    assert.strictEqual(g.outputs[0].type, 'output');
});

test('parse: stage hint sets stage for subsequent gates', () => {
    const g = LogicDiag._parse(
        'input D\nstage 1\nnot n1 D\nstage 2\nand R n1 D\n'
    );
    assert.strictEqual(g.gates[0].stage, 1);
    assert.strictEqual(g.gates[1].stage, 2);
});

test('parse: gates before any stage hint default to stage 1', () => {
    const g = LogicDiag._parse('input D\nnot n1 D\n');
    assert.strictEqual(g.gates[0].stage, 1);
});

test('parse: blank lines and # comments are ignored', () => {
    const g = LogicDiag._parse(
        '# a comment\n\ninput D\n\n# another\nnot n1 D\n'
    );
    assert.strictEqual(g.inputs.length, 1);
    assert.strictEqual(g.gates.length, 1);
});

test('parse: nodes map contains all nodes', () => {
    const g = LogicDiag._parse('input D\nnot n1 D\noutput n1\n');
    assert.ok(g.nodes.has('D'));
    assert.ok(g.nodes.has('n1'));
});

test('parse: throws on unknown gate type', () => {
    assert.throws(() => LogicDiag._parse('input D\nfoo x D\n'), /unknown gate/i);
});

test('parse: throws on undefined input reference', () => {
    assert.throws(() => LogicDiag._parse('and out A B\n'), /undefined node/i);
});

test('parse: tabs are treated as whitespace', () => {
    const g = LogicDiag._parse('input\tD\nnot\tn1\tD\n');
    assert.strictEqual(g.inputs[0].id, 'D');
    assert.strictEqual(g.gates[0].id, 'n1');
});

test('parse: throws on unterminated quoted string', () => {
    assert.throws(
        () => LogicDiag._parse('input D "Unterminated\n'),
        /unterminated quoted string/i
    );
});

test('parse: throws on invalid stage number', () => {
    assert.throws(
        () => LogicDiag._parse('input D\nstage foo\n'),
        /invalid stage number/i
    );
});

test('parse: input with init state 1', () => {
    const g = LogicDiag._parse('input D 1\n');
    assert.strictEqual(g.inputs[0].init, 1);
    assert.strictEqual(g.inputs[0].label, 'D');
});

test('parse: input with init state 0', () => {
    const g = LogicDiag._parse('input D 0\n');
    assert.strictEqual(g.inputs[0].init, 0);
});

test('parse: input with init true', () => {
    const g = LogicDiag._parse('input D true\n');
    assert.strictEqual(g.inputs[0].init, 1);
});

test('parse: input with init false', () => {
    const g = LogicDiag._parse('input D false\n');
    assert.strictEqual(g.inputs[0].init, 0);
});

test('parse: input with init and label', () => {
    const g = LogicDiag._parse('input D 1 "Data"\n');
    assert.strictEqual(g.inputs[0].init, 1);
    assert.strictEqual(g.inputs[0].label, 'Data');
});

test('parse: input default init is 0', () => {
    const g = LogicDiag._parse('input D\n');
    assert.strictEqual(g.inputs[0].init, 0);
});

test('parse: input with label only throws', () => {
    assert.throws(
        () => LogicDiag._parse('input D "Data"\n'),
        /invalid input state/i
    );
});

test('parse: input with invalid state token throws', () => {
    assert.throws(
        () => LogicDiag._parse('input D maybe\n'),
        /invalid input state/i
    );
});

test('parse: input with too many tokens throws', () => {
    assert.throws(
        () => LogicDiag._parse('input D 1 "Label" extra\n'),
        /invalid input/i
    );
});

test('parse: row hint attaches row to following gate', () => {
    const g = LogicDiag._parse(
        'input A\nstage 1\nrow 2\nnot n1 A\noutput n1\n'
    );
    assert.strictEqual(g.gates[0].row, 2);
});

test('parse: row hint attaches row to following input', () => {
    const g = LogicDiag._parse('row 3\ninput A\nnot n1 A\noutput n1\n');
    assert.strictEqual(g.inputs[0].row, 3);
});

test('parse: stage resets row counter (first gate after stage gets row 0)', () => {
    const g = LogicDiag._parse(
        'input A\nrow 5\nstage 1\nnot n1 A\noutput n1\n'
    );
    assert.strictEqual(g.gates[0].row, 0);
});

test('parse: auto-increment after row hint', () => {
    const g = LogicDiag._parse(
        'input A\nstage 1\nrow 2\nnot n1 A\nbuf n2 A\noutput n1\noutput n2\n'
    );
    assert.strictEqual(g.gates[0].row, 2);
    assert.strictEqual(g.gates[1].row, 3);
});

test('parse: without row hint nodes start at row 0 and increment', () => {
    const g = LogicDiag._parse(
        'input A\ninput B\nand out A B\noutput out\n'
    );
    assert.strictEqual(g.inputs[0].row, 0);
    assert.strictEqual(g.inputs[1].row, 1);
    assert.strictEqual(g.gates[0].row, 0);
});

test('parse: invalid row number throws', () => {
    assert.throws(
        () => LogicDiag._parse('input A\nrow foo\nnot n1 A\noutput n1\n'),
        /Invalid row number/
    );
});

test('parse: decimal row hint is accepted', () => {
    const g = LogicDiag._parse(
        'input A\nstage 1\nrow 1.5\nnot n1 A\noutput n1\n'
    );
    assert.strictEqual(g.gates[0].row, 1.5);
});

test('parse: wire node is added to gates and nodes', () => {
    const g = LogicDiag._parse(
        'input A\nnot n1 A\nwire w1 n1 0.5 1.5\noutput n1\n'
    );
    assert.ok(g.nodes.has('w1'));
    assert.ok(g.gates.some(g => g.id === 'w1'));
});

test('parse: wire node has correct type, ins, stage, row', () => {
    const g = LogicDiag._parse(
        'input A\nnot n1 A\nwire w1 n1 0.5 1.5\noutput n1\n'
    );
    const w = g.nodes.get('w1');
    assert.strictEqual(w.type, 'wire');
    assert.deepStrictEqual(w.ins, ['n1']);
    assert.strictEqual(w.stage, 0.5);
    assert.strictEqual(w.row, 1.5);
});

test('parse: wire is NOT in inputs', () => {
    const g = LogicDiag._parse(
        'input A\nnot n1 A\nwire w1 n1 0.5 1.5\noutput n1\n'
    );
    assert.ok(!g.inputs.some(n => n.id === 'w1'));
});

test('parse: wire does not affect stage/row counters', () => {
    const g = LogicDiag._parse(
        'input A\nstage 1\nwire w1 A 0.5 0.5\nnot n1 A\noutput n1\n'
    );
    /* n1 should be at stage 1, row 0 (counter not affected by wire) */
    assert.strictEqual(g.gates.find(g => g.id === 'n1').stage, 1);
    assert.strictEqual(g.gates.find(g => g.id === 'n1').row, 0);
});

test('parse: wire with invalid stage throws', () => {
    assert.throws(
        () => LogicDiag._parse('input A\nwire w1 A foo 0\noutput A\n'),
        /Invalid wire stage/
    );
});

test('parse: wire with invalid row throws', () => {
    assert.throws(
        () => LogicDiag._parse('input A\nwire w1 A 0 bar\noutput A\n'),
        /Invalid wire row/
    );
});

done();
