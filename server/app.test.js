import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { once } from 'node:events'
import { createAppServer } from './app.js'

const buildDirectory = mkdtempSync(join(tmpdir(), 'hyperion-server-'))
const html = '<!doctype html><title>Hyperion</title><div id="app"></div>'
const contentSecurityPolicy = "default-src 'self'; connect-src 'self' https://api.example.test; frame-ancestors 'none'"
let server
let origin

before(async () => {
  mkdirSync(join(buildDirectory, 'assets'))
  writeFileSync(join(buildDirectory, 'index.html'), html)
  writeFileSync(join(buildDirectory, 'assets', 'index-Abcd1234.js'), 'console.log("Hyperion")')
  writeFileSync(join(buildDirectory, 'sw.js'), 'self.addEventListener("fetch", () => {})')
  writeFileSync(join(buildDirectory, 'manifest.webmanifest'), '{"name":"Hyperion"}')
  writeFileSync(join(buildDirectory, '.env'), 'SHOULD_NEVER_BE_SERVED')
  writeFileSync(join(buildDirectory, '.security-headers.json'), JSON.stringify({
    'Content-Security-Policy': contentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }))
  server = createAppServer(buildDirectory)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  origin = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise(resolve => server.close(resolve))
})

test('serves the app shell on direct links, query strings and trailing slashes', async () => {
  for (const path of ['/', '/history', '/builder/123/', '/verify-email/1/hash?signature=test']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/html/)
    assert.equal(response.headers.get('cache-control'), 'no-cache')
    assert.equal(await response.text(), html)
  }
})

test('serves fingerprinted assets with their MIME type and immutable caching', async () => {
  const response = await fetch(origin + '/assets/index-Abcd1234.js?v=1')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /javascript/)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(await response.text(), 'console.log("Hyperion")')
})

test('revalidates unversioned files and returns empty HEAD and conditional responses', async () => {
  for (const path of ['/sw.js', '/manifest.webmanifest', '/index.html']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-cache')
    const notModified = await fetch(origin + path, { headers: { 'If-None-Match': response.headers.get('etag') } })
    assert.equal(notModified.status, 304)
    assert.equal(notModified.headers.get('cache-control'), 'no-cache')
    assert.equal(notModified.headers.get('content-security-policy'), contentSecurityPolicy)
    assert.equal(await notModified.text(), '')
  }
  const head = await fetch(origin + '/history', { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
})

test('does not send the app shell for missing files, API paths or hidden files', async () => {
  for (const path of ['/assets/missing.js', '/assets/missing', '/api/user', '/.env', '/%2eenv', '/.security-headers.json', '/%2e%2e/package.json']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 404, path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(await response.text(), '')
  }
})

test('applies build-time security headers to HTML, assets and error responses', async () => {
  for (const path of ['/', '/assets/index-Abcd1234.js', '/missing.js']) {
    const response = await fetch(origin + path)
    assert.equal(response.headers.get('content-security-policy'), contentSecurityPolicy)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    await response.arrayBuffer()
  }
})

test('rejects writes and malformed URLs without disrupting later requests', async () => {
  const write = await fetch(origin + '/history', { method: 'POST' })
  assert.equal(write.status, 405)
  assert.equal(write.headers.get('allow'), 'GET, HEAD')
  const malformed = await fetch(origin + '/%E0%A4%A')
  assert.equal(malformed.status, 400)
  const health = await fetch(origin + '/healthz')
  assert.equal(health.status, 200)
  assert.equal(health.headers.get('cache-control'), 'no-store')
  assert.equal(await health.text(), 'ok')
})

test('ignores malformed ranges and serves a complete cacheable asset', async () => {
  const response = await fetch(origin + '/assets/index-Abcd1234.js', { headers: { Range: 'bytes=10-2' } })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'console.log("Hyperion")')
})

test('refuses to start without a completed production build', () => {
  const missingBuild = join(buildDirectory, 'missing')
  assert.throws(() => createAppServer(missingBuild), /ENOENT/)
  const incompleteBuild = join(buildDirectory, 'incomplete')
  mkdirSync(incompleteBuild)
  writeFileSync(join(incompleteBuild, 'index.html'), html)
  assert.throws(() => createAppServer(incompleteBuild), /ENOENT/)
})
