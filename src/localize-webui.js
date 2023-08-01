#!/usr/bin/env node

const path  = require('path')
const spawn = require('child_process').spawn;

const child = spawn(`electron${process.platform === 'win32' ? '.cmd' : ''}`, [path.join(__dirname, 'index.js'), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: false });

child.on('close', function (code, signal) {
  if (code === null) {
    console.error('electron', 'exited with signal', signal);
    process.exit(1);
  }
  process.exit(code);
});


const handleTerminationSignal = function (signal) {
  process.on(signal, function signalHandler () {
    if (!child.killed) {
      child.kill(signal);
    }
  });
};

handleTerminationSignal('SIGINT');
handleTerminationSignal('SIGTERM');
