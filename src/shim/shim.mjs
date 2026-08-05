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
      const rest = argv.slice(1);
      const all = rest.includes('--all');
      const json = rest.includes('--json');
      const ci = rest.indexOf('--contract');
      const contract = ci >= 0 ? rest[ci + 1] : undefined;
      const exclude = [];
      for (let i = rest.length - 1; i >= 0; i--) {
        if (rest[i] === '--all' || rest[i] === '--json') rest.splice(i, 1);
        if (rest[i] === '--contract') rest.splice(i, 2);
        if (rest[i] === '--exclude') { exclude.push(...(rest[i + 1] || '').split(',').filter(Boolean)); rest.splice(i, 2); }
      }
      const target = all ? undefined : rest.shift();
      let timeoutMs;
      const ti = rest.indexOf('--timeout');
      if (ti >= 0) {
        const secs = Number(rest[ti + 1]);
        if (!Number.isFinite(secs) || secs <= 0) {
          die('--timeout needs a positive number of seconds');
        }
        timeoutMs = Math.round(secs * 1000);
        rest.splice(ti, 2);
      }
      const body = rest.join(' ');
      if ((!target && !all) || !body) {
        die('usage: dogwalker ask <terminal[,terminal]> <message> [--all] [--exclude <terminal>] [--contract <name>] [--json] [--timeout <seconds>]');
      }
      const targets = target?.split(',').filter(Boolean);
      const req = { cmd: 'ask', from, target: targets?.[0], targets, all, exclude, body, json, contract };
      if (timeoutMs !== undefined) req.timeoutMs = timeoutMs;
      return req;
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
    case 'note': {
      const op = argv[1];
      const target = argv[2];
      if (!['read', 'append', 'write'].includes(op) || !target) {
        die('usage: dogwalker note read|append|write <note> [--chain | --stdin | <text>]');
      }
      if (op === 'read') {
        return { cmd: 'note', from, op, target, chain: argv.includes('--chain') };
      }
      const body = argv.includes('--stdin')
        ? (await readStdin()).replace(/\n?EOF\s*$/, '').trimEnd()
        : argv.slice(3).join(' ');
      return { cmd: 'note', from, op, target, body };
    }
    case 'portal': {
      const op = argv[1];
      const ops = ['new', 'navigate', 'click', 'type', 'scroll', 'screenshot', 'js', 'dom', 'console'];
      if (!ops.includes(op)) {
        die(
          'usage: dogwalker portal <op> [portal] [args]\n' +
            '  new [url] | navigate <portal> <url> | click <portal> <selector> |\n' +
            '  type <portal> <selector> <text> | scroll <portal> <dx> <dy> |\n' +
            '  screenshot <portal> | js <portal> <code> | dom <portal> [selector] | console <portal>',
        );
      }
      if (op === 'new') {
        return { cmd: 'portal', from, op, target: '', arg: argv.slice(2).join(' ') || 'about:blank' };
      }
      const target = argv[2];
      if (!target) die(`usage: dogwalker portal ${op} <portal> ...`);
      const req = { cmd: 'portal', from, op, target };
      if (op === 'navigate') req.arg = argv.slice(3).join(' ');
      else if (op === 'click') req.arg = argv.slice(3).join(' ');
      else if (op === 'type') {
        req.arg = argv[3];
        req.value = argv.slice(4).join(' ');
      } else if (op === 'scroll') {
        req.x = Number(argv[3]) || 0;
        req.y = Number(argv[4]) || 0;
      } else if (op === 'js') req.arg = argv.slice(3).join(' ');
      else if (op === 'dom') req.arg = argv.slice(3).join(' ') || undefined;
      return req;
    }
    case 'recruit': {
      // dogwalker recruit --agent <preset> --role <role> [--floor <floor>]
      const flag = (name) => {
        const i = argv.indexOf(name);
        return i >= 0 ? argv[i + 1] : undefined;
      };
      const agent = flag('--agent');
      const role = flag('--role');
      if (!agent || !role) {
        die('usage: dogwalker recruit --agent <preset> --role <role> [--floor <floor>]');
      }
      return { cmd: 'recruit', from, agent, role, floor: flag('--floor') };
    }
    case 'dismiss': {
      const target = argv[1];
      if (!target) die('usage: dogwalker dismiss <recruit>');
      return { cmd: 'dismiss', from, target };
    }
    case 'assign': {
      const target = argv[1];
      const ri = argv.indexOf('--role');
      const role = ri >= 0 ? argv[ri + 1] : undefined;
      if (!target || !role) die('usage: dogwalker assign <recruit> --role <role>');
      return { cmd: 'assign', from, target, role };
    }
    default:
      die(
        'commands: ask <t> <msg> | check <t> | list | note read|append|write <n> | portal <op> <p> | recruit --agent <a> --role <r> | dismiss <r> | assign <r> --role <r> | connect <t> | disconnect <t>',
      );
  }
}

function render(cmd, data, json = false) {
  if (json) return process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
  if (cmd === 'check' && data && typeof data.screen === 'string') {
    process.stdout.write(data.screen.replace(/\s+$/, '') + '\n');
  } else if (cmd === 'list' && data && Array.isArray(data.peers)) {
    if (data.peers.length === 0) process.stdout.write('(no connected terminals)\n');
    for (const p of data.peers) {
      const floor = p.floor ? `\t[${p.floor}]` : '';
      process.stdout.write(`${p.name}\t${p.id}${floor}\n`);
    }
  } else if (cmd === 'ask' && data && typeof data.body === 'string') {
    process.stdout.write(data.body + '\n');
  } else if (cmd === 'note' && data && typeof data.content === 'string') {
    process.stdout.write(data.content.replace(/\s+$/, '') + '\n');
  } else if (cmd === 'portal' && data && typeof data.name === 'string') {
    process.stdout.write(data.name + '\n');
  } else if (cmd === 'portal' && data && typeof data.path === 'string') {
    process.stdout.write(data.path + '\n');
  } else if (cmd === 'portal' && data && typeof data.html === 'string') {
    process.stdout.write(data.html.replace(/\s+$/, '') + '\n');
  } else if (cmd === 'portal' && data && typeof data.output === 'string') {
    process.stdout.write(data.output.replace(/\s+$/, '') + '\n');
  } else if (cmd === 'portal' && data && 'result' in data) {
    process.stdout.write(
      (typeof data.result === 'string' ? data.result : JSON.stringify(data.result)) + '\n',
    );
  } else if ((cmd === 'recruit' || cmd === 'assign') && data && typeof data.name === 'string') {
    process.stdout.write(data.name + '\n');
  } else {
    process.stdout.write('ok\n');
  }
}

function isSingleContractAsk(request) {
  return request.cmd === 'ask' && !!request.contract && !request.all && request.targets?.length === 1;
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
  if (isSingleContractAsk(request) && res.ok && res.data !== undefined) {
    process.stdout.write(JSON.stringify(res.data) + '\n');
    process.exit(0);
  }
  if (!res.ok) die(res.error || 'request failed');
  render(request.cmd, res.data, request.json);
  process.exit(0);
});
socket.on('error', (err) => die(`cannot reach broker: ${err.message}`));
