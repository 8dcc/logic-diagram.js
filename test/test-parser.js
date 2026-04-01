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
    const g = LogicDiag._parse('input D "Data"\n');
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

done();
