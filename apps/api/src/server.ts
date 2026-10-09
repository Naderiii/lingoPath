import { config } from './config.js'
import { buildApp } from './app.js'

async function start() {
  const app = await buildApp()

  // ─── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received shutdown signal, closing server...')
    try {
      await app.close()
      app.log.info('Server closed gracefully')
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  try {
    await app.listen({ host: config.HOST, port: config.PORT })
    app.log.info({ host: config.HOST, port: config.PORT }, 'Server started')
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start server')
    process.exit(1)
  }
}

void start()
