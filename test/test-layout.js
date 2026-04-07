'use strict';

const { test, assert, done } = require('./helpers');
const LogicDiag = require('../logic-diagram');

function layoutOf(dsl) {
    const g = LogicDiag._parse(dsl);
    return LogicDiag._layout(g);
}

test('layout: single input is placed at stage 0 x', () => {
    const { pos } = layoutOf('input D\nnot n1 D\noutput n1\n');
    const PADDING = 50, GATE_W = 60;
    assert.strictEqual(pos.get('D').x, PADDING + GATE_W / 2);
});

test('layout: stage-1 gate x is one column right of inputs', () => {
    const { pos } = layoutOf('input D\nnot n1 D\noutput n1\n');
    const PADDING = 50, GATE_W = 60, COL_SPACING = 140;
    assert.strictEqual(pos.get('n1').x, PADDING + GATE_W / 2 + COL_SPACING);
});

test('layout: two gates in same stage share column x, have different y', () => {
    const { pos } = layoutOf(
        'input A\ninput B\nstage 2\nand g1 A B\nor g2 A B\noutput g1\noutput g2\n'
    );
    assert.strictEqual(pos.get('g1').x, pos.get('g2').x);
    assert.notStrictEqual(pos.get('g1').y, pos.get('g2').y);
});

test('layout: two inputs are vertically separated by ROW_SPACING', () => {
    const { pos } = layoutOf('input A\ninput B\nand out A B\noutput out\n');
    const ROW_SPACING = 70;
    assert.strictEqual(Math.abs(pos.get('A').y - pos.get('B').y), ROW_SPACING);
});

test('layout: returns canvas width and height as positive numbers', () => {
    const { width, height } = layoutOf('input D\nnot n1 D\noutput n1\n');
    assert.ok(typeof width === 'number' && width > 0);
    assert.ok(typeof height === 'number' && height > 0);
});

test('layout: gate positions are not overwritten by output annotations', () => {
    /* n1 is a gate at stage 1; it should be positioned at the gate column,
     * not at some output column. */
    const { pos } = layoutOf('input D\nstage 1\nnot n1 D\noutput n1\n');
    const PADDING = 50, GATE_W = 60, COL_SPACING = 140;
    const expectedX = PADDING + GATE_W / 2 + 1 * COL_SPACING;
    assert.strictEqual(pos.get('n1').x, expectedX,
        'gate n1 should be in stage 1 column, not overwritten by output');
});

test('layout: canvas width covers last gate plus output label tail', () => {
    const { width } = layoutOf('input D\nstage 1\nnot n1 D\noutput n1\n');
    /* cx_max = PADDING(50) + GATE_W/2(30) + 1*COL_SPACING(140) = 220
     * canvasWidth = cx_max(220) + OUT_TAIL(213) = 433 */
    assert.strictEqual(width, 433);
});

test('layout: row hint places gate at correct y', () => {
    const { pos } = layoutOf(
        'input A\nstage 1\nrow 2\nnot n1 A\noutput n1\n'
    );
    const PADDING = 50, ROW_SPACING = 70;
    assert.strictEqual(pos.get('n1').y, PADDING + 2 * ROW_SPACING);
});

test('layout: auto-increment row gives consecutive y values', () => {
    const { pos } = layoutOf(
        'input A\nstage 1\nrow 1\nnot n1 A\nbuf n2 A\noutput n1\noutput n2\n'
    );
    const PADDING = 50, ROW_SPACING = 70;
    assert.strictEqual(pos.get('n1').y, PADDING + 1 * ROW_SPACING);
    assert.strictEqual(pos.get('n2').y, PADDING + 2 * ROW_SPACING);
});

test('layout: canvas height accommodates highest row index', () => {
    const { height } = layoutOf(
        'input A\nstage 1\nrow 4\nnot n1 A\noutput n1\n'
    );
    const PADDING = 50, ROW_SPACING = 70;
    /* maxRow=4, height = (4-0)*ROW_SPACING + 2*PADDING = 380 */
    assert.strictEqual(height, 4 * ROW_SPACING + 2 * PADDING);
});

test('layout: row hint applies to inputs', () => {
    const { pos } = layoutOf(
        'row 2\ninput A\nnot n1 A\noutput n1\n'
    );
    const PADDING = 50, ROW_SPACING = 70;
    assert.strictEqual(pos.get('A').y, PADDING + 2 * ROW_SPACING);
});

done();
