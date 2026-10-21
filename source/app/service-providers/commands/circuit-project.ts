/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        CircuitProject command
 * CVM-Role:        <none>
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     Reads and writes circuit drawings.
 *
 *                  The circuit editor runs in the renderer, but the file
 *                  lives on the disk, and only the main process may touch
 *                  it. This command is the way across.
 *
 * END HEADER
 */

import { type AppServiceContainer } from 'source/app/app-service-container'
import { hasIcprojExt } from '@common/util/file-extention-checks'
import ZettlrCommand from './zettlr-command'

export interface CircuitProjectAPI {
  action: 'read'|'write'
  path: string
  /** The contents to write. Only used by the write action. */
  content?: string
}

export default class CircuitProject extends ZettlrCommand {
  constructor (app: AppServiceContainer) {
    super(app, ['circuit-project'])
  }

  /**
   * Reads or writes a circuit drawing.
   *
   * @param   {string}            evt      The event name
   * @param   {CircuitProjectAPI} payload  What to read or write
   *
   * @return  {Promise<any>}               The contents, or whether it worked.
   */
  async run (evt: string, payload: CircuitProjectAPI): Promise<any> {
    const { action, path: filePath } = payload

    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('[CircuitProject] No path given')
    }

    if (!hasIcprojExt(filePath)) {
      throw new Error(`[CircuitProject] Not a circuit drawing: ${filePath}`)
    }

    if (action === 'read') {
      try {
        return await this._app.fsal.readTextFile(filePath)
      } catch (err: any) {
        this._app.log.error(`[CircuitProject] Could not read ${filePath}`, err)
        throw err
      }
    }

    if (action === 'write') {
      if (typeof payload.content !== 'string') {
        throw new Error('[CircuitProject] No content given')
      }
      try {
        await this._app.fsal.writeTextFile(filePath, payload.content)
        return true
      } catch (err: any) {
        this._app.log.error(`[CircuitProject] Could not write ${filePath}`, err)
        throw err
      }
    }

    throw new Error(`[CircuitProject] Unknown action: ${String(action)}`)
  }
}

module.exports = CircuitProject
