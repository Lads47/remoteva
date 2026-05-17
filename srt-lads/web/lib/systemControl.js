// lib/systemControl.js
// Contrôle des services systemd (statut + restart) avec whitelist stricte.
// Restart via `sudo /bin/systemctl restart <svc>` — requiert une règle sudoers
// préalable autorisant srtadmin à restart ces services en NOPASSWD.

'use strict';

const { execFile } = require('child_process');

const ALLOWED = new Set(['sls', 'mumble-server', 'nginx', 'srt-lads-web']);

function runCmd(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs || 8000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() });
    });
  });
}

async function statusOne(svc) {
  // is-active retourne "active" / "inactive" / "failed" / "activating"
  // is-enabled retourne "enabled" / "disabled" / "static"
  // show pour ActiveEnterTimestamp / SubState
  try {
    const [act, sub, since] = await Promise.all([
      runCmd('systemctl', ['is-active', svc]).then((r) => r.stdout).catch((e) => (e.stdout || '').trim() || 'unknown'),
      runCmd('systemctl', ['show', svc, '--property=SubState', '--value']).then((r) => r.stdout).catch(() => ''),
      runCmd('systemctl', ['show', svc, '--property=ActiveEnterTimestamp', '--value']).then((r) => r.stdout).catch(() => ''),
    ]);
    return { service: svc, active: act, sub, since };
  } catch (err) {
    return { service: svc, active: 'unknown', sub: '', since: '', error: err.message };
  }
}

async function statusAll() {
  return Promise.all(Array.from(ALLOWED).map(statusOne));
}

async function restart(svc) {
  if (!ALLOWED.has(svc)) {
    const e = new Error('Service non autorisé : ' + svc);
    e.status = 400;
    e.publicMessage = e.message;
    throw e;
  }
  // sudo doit être configuré sans mot de passe pour ces services (cf docs).
  return runCmd('sudo', ['-n', '/bin/systemctl', 'restart', svc], 15000);
}

// Disque et mémoire (informatif)
async function resources() {
  const [df, free, uptime] = await Promise.all([
    runCmd('df', ['-h', '--output=size,used,avail,pcent,target', '/']).catch(() => ({ stdout: '' })),
    runCmd('free', ['-m']).catch(() => ({ stdout: '' })),
    runCmd('uptime', ['-p']).catch(() => ({ stdout: '' })),
  ]);
  return {
    disk: df.stdout,
    memory: free.stdout,
    uptime: uptime.stdout,
  };
}

module.exports = { ALLOWED: Array.from(ALLOWED), statusAll, statusOne, restart, resources };
