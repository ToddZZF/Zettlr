/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Circuit protocol registration
 * CVM-Role:        Utility function
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     Serves the circuit editor to the note application.
 *
 *                  The editor is a small web application of its own. It runs
 *                  inside the note's frame, and it must be able to load its
 *                  own modules and stylesheets — which a `file://` page may
 *                  not do. So the bundle is served from its own scheme,
 *                  `circuit://`, which is a proper origin: the editor can
 *                  load its modules, and the note application can talk to
 *                  it without sharing an origin with it.
 *
 * END HEADER
 */

import { app, protocol } from 'electron'
import { promises as fs } from 'fs'
import fsSync from 'fs'
import path from 'path'
import type LogProvider from '@providers/log'

export const CIRCUIT_PROTOCOL = 'circuit'

/**
 * The content types the editor bundle needs. A module script is only loaded
 * when the server says it is a script, so these are not optional.
 */
const CONTENT_TYPES = new Map<string, string>([
  [ '.html', 'text/html; charset=utf-8' ],
  [ '.js', 'text/javascript; charset=utf-8' ],
  [ '.mjs', 'text/javascript; charset=utf-8' ],
  [ '.css', 'text/css; charset=utf-8' ],
  [ '.json', 'application/json; charset=utf-8' ],
  [ '.svg', 'image/svg+xml' ],
  [ '.png', 'image/png' ],
  [ '.jpg', 'image/jpeg' ],
  [ '.jpeg', 'image/jpeg' ],
  [ '.gif', 'image/gif' ],
  [ '.webp', 'image/webp' ],
  [ '.woff', 'font/woff' ],
  [ '.woff2', 'font/woff2' ],
  [ '.ttf', 'font/ttf' ],
  [ '.wasm', 'application/wasm' ]
])

/**
 * Makes the scheme known to Chromium.
 *
 * This has to happen before the app is ready, since Chromium decides at
 * startup which schemes are proper origins.
 */
export function registerCircuitScheme (): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CIRCUIT_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

/**
 * The directory the editor bundle lives in.
 *
 * A packaged application carries the bundle next to its archive, as an extra
 * resource; a development run has it in the source tree. Both are tried, in
 * that order.
 */
function circuitRoot (): string {
  const packaged = path.join(process.resourcesPath, 'circuit')
  if (fsSync.existsSync(packaged)) {
    return packaged
  }
  return path.join(app.getAppPath(), 'circuit')
}

/**
 * Serves the editor bundle.
 *
 * @param   {LogProvider}  logger  The logger to report errors to
 */
export function registerCircuitProtocol (logger: LogProvider): void {
  logger.info(`Registering custom protocol ${CIRCUIT_PROTOCOL}`)

  protocol.handle(CIRCUIT_PROTOCOL, async request => {
    const url = new URL(request.url)
    const root = circuitRoot()
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const target = path.join(root, relative)

    // The bundle may not reach outside of its own directory.
    if (!target.startsWith(root)) {
      logger.warning(`Refused to serve ${target}: outside of the circuit bundle`)
      return new Response(null, { status: 403, statusText: 'Forbidden' })
    }

    try {
      const data = await fs.readFile(target)
      return new Response(data, {
        status: 200,
        headers: {
          'Content-type': CONTENT_TYPES.get(path.extname(target)) ?? 'application/octet-stream',
          // The bundle is part of the application: it changes with the
          // application, never within a session.
          'Cache-control': 'no-cache'
        }
      })
    } catch (err) {
      logger.error(`Could not serve ${target}`, err)
      return new Response(null, { status: 404, statusText: 'Not found' })
    }
  })
}
