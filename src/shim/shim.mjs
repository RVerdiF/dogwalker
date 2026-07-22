#!/usr/bin/env node
// The `dogwalker` / `walk` CLI shim (ARCHITECTURE.md §5.1).
// Deliberately dumb: no authorization, no state — parse argv, send ONE JSON
// request carrying this terminal's id, stream the response, exit. All logic
// lives in the broker. Standalone (no project imports) so it runs under plain
// `node` inside any shell on the PATH.

import net from 'node:net';

const socketPath = process.env.DOGWALKER_SOCKET;
const from = process.env.DOGWALKER_TERMINAL_ID;

function die(msg, code = 1) {
  process.stderr.write(`dogwalker: ${msg}\n`);
  process.exit(code);
}

if (!socketPath || !from) {
  die('not running inside a Dogwalker terminal (missing env)');
}

const argv = process.argv.slice(2);
const cmd = argv[0];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function buildRequest() {
  switch (cmd) {
    case 'ask': {
      const target = argv[1];
      const body = argv.slice(2).join(' ');
      if (!target || !body) die('usage: dogwalker ask <terminal> <message>');
      return { cmd: 'ask', from, target, body };
    }
    case 'reply': {
      const msgId = argv[1];
      if (!msgId) die('usage: dogwalker reply <msg-id> [--stdin | <text>]');
      const body = argv.includes('--stdin')
        ? (await readStdin()).replace(/\n?EOF\s*$/, '').trimEnd()
        : argv.slice(2).join(' ');
      return { cmd: 'reply', from, msgId, body };
    }
    case 'check': {
      const target = argv[1];
      if (!target) die('usage: dogwalker check <terminal>');
      return { cmd: 'check', from, target };
    }
    case 'list':
      return { cmd: 'list', from };
    case 'connect':
    case 'disconnect': {
      const target = argv[1];
      if (!target) die(`usage: dogwalker ${cmd} <terminal>`);
      return { cmd, from, target };
    }
    default:
      die(
        'commands: ask <t> <msg> | reply <id> --stdin | check <t> | list | connect <t> | disconnect <t>',
      );
  }
}

function render(cmd, data) {
  if (cmd === 'check' && data && typeof data.screen === 'string') {
    process.stdout.write(data.screen.replace(/\s+$/, '') + '\n');
  } else if (cmd === 'list' && data && Array.isArray(data.peers)) {
    if (data.peers.length === 0) process.stdout.write('(no connected terminals)\n');
    for (const p of data.peers) process.stdout.write(`${p.name}\t${p.id}\n`);
  } else if (cmd === 'ask' && data && typeof data.body === 'string') {
    process.stdout.write(data.body + '\n');
  } else {
    process.stdout.write('ok\n');
  }
}

const request = await buildRequest();

const socket = net.connect(socketPath);
socket.setEncoding('utf8');
let buffer = '';

socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
socket.on('data', (chunk) => {
  buffer += chunk;
  const nl = buffer.indexOf('\n');
  if (nl < 0) return;
  const line = buffer.slice(0, nl);
  let res;
  try {
    res = JSON.parse(line);
  } catch {
    die('malformed response from broker');
  }
  socket.end();
  if (!res.ok) die(res.error || 'request failed');
  render(request.cmd, res.data);
  process.exit(0);
});
socket.on('error', (err) => die(`cannot reach broker: ${err.message}`));
