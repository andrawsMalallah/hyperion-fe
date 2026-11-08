import { fileURLToPath } from 'node:url'
import { createAppServer } from './app.js'

const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const server = createAppServer(fileURLToPath(new URL('../dist/', import.meta.url)))
server.listen(port, '0.0.0.0', () => {
  console.log(`Hyperion frontend listening on port ${port}`)
})

// Render sends SIGTERM during deploys; allow in-flight responses to finish.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10000).unref()
  })
}
