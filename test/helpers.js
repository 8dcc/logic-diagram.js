'use strict';

const assert = require('assert');
let _passed = 0, _failed = 0;

function test(name, fn) {
    try {
        fn();
        process.stdout.write('.');
        _passed++;
    } catch (e) {
        process.stdout.write('F');
        console.log('\nFAIL: ' + name);
        console.log('  ' + e.message);
        _failed++;
    }
}

function done() {
    console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
    if (_failed > 0) process.exit(1);
}

module.exports = { test, assert, done };
