'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname)
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .sort();

let allPassed = true;
for (const f of files) {
    console.log('\n--- ' + f + ' ---');
    try {
        execFileSync('node', [path.join(__dirname, f)], { stdio: 'inherit' });
    } catch (_) {
        allPassed = false;
    }
}
process.exit(allPassed ? 0 : 1);
