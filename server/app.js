import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sirv from 'sirv'

export function createAppServer(buildDirectory) {
  // Refuse to start against an old or incomplete build with no header policy.
  readFileSync(join(buildDirectory, 'index.html'))
  const securityHeaders = JSON.parse(readFileSync(join(buildDirectory, '.security-headers.json'), 'utf8'))
  const serveFiles = sirv(buildDirectory, {
    single: true,
    etag: true,
    ignores: [/^\/(?:assets|api)(?:\/|$)/, /\/\./],
  })

  return createServer((request, response) => {
    for (const [headerName, headerValue] of Object.entries(securityHeaders)) {
      response.setHeader(headerName, headerValue)
    }
    response.setHeader('Cache-Control', 'no-store')

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }

    let pathname
    try {
      pathname = decodeURI(new URL(request.url, 'http://localhost').pathname)
    } catch {
      response.writeHead(400)
      response.end()
      return
    }

    if (pathname === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('ok')
      return
    }

    // Only Vite's fingerprinted assets can be kept across deployments. HTML,
    // service workers, manifests and unversioned icons must revalidate.
    const fingerprintedAsset = /^\/assets\/.+-[\w-]{8,}\.[\w]+$/.test(pathname)
    response.setHeader('Cache-Control', fingerprintedAsset
      ? 'public, max-age=31536000, immutable'
      : 'no-cache')

    // Full responses suit these small bundles and avoid caching partial files
    // in the service worker. HTTP servers may ignore Range and return 200.
    delete request.headers.range

    serveFiles(request, response, () => {
      response.setHeader('Cache-Control', 'no-store')
      response.writeHead(404)
      response.end()
    })
  })
}
