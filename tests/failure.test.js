import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import http from 'node:http';

test('db failure retry recovers gracefully', async () => {
  const proc = spawn('node', ['src/server.js'], { stdio: 'inherit', env: { ...process.env, API_KEY: 'k', PORT: '9093', DB_FAIL_RATE: '0.8', DATABASE_URL: './data/test-fail.db' } });
  await wait(1000);

  const base = 'http://localhost:9093';

  // With an 80% failure rate, the 5 retries give it a high chance of success eventually.
  const a = await postJson(`${base}/v1/signals`, {
    headers: { 'x-api-key': 'k' },
    body: { userId: 'u2', type: 'note', payload: 'fail-test' }
  });

  // If it completely failed, `a.error` would be 'db_unavailable'.
  // We expect it to succeed.
  assert.ok(a.id > 0, 'Expected successful insertion despite simulated DB failures');
  assert.equal(a.payload, 'fail-test');
  
  proc.kill();
});

async function postJson(url, { headers, body }){
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let chunks=''; res.on('data', d => chunks+=d);
      res.on('end', () => resolve(JSON.parse(chunks||'{}')));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
