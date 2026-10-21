/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        ForceOpen command
 * CVM-Role:        <none>
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This command forces open a file, or creates it, if desired,
 *                  and opens it afterwards.
 *
 * END HEADER
 */

import type { AppServiceContainer } from 'source/app/app-service-container'
import { hasIcprojExt } from '@common/util/file-extention-checks'
import { parseLinkTarget } from '@common/util/circuit-project'
import ZettlrCommand from './zettlr-command'

export interface ForceOpenAPI {
  windowId?: string
  leafId?: string
  linkContents: string
  newTab?: boolean
}

/**
 * What a link pointed at. A circuit drawing may name one of its regions, in
 * which case the drawing opens framed on that region.
 */
export interface ForceOpenResult {
  path?: string
  region?: string
}

export default class ForceOpen extends ZettlrCommand {
  constructor (app: AppServiceContainer) {
    super(app, ['force-open'])
  }

  /**
    * Force-Opens a file, after click on internal link
    *
    * @param   {string}        evt      The event name
    * @param   {ForceOpenAPI}  payload  the parameters of the file to be opened
    * @return  {ForceOpenResult}         What the link pointed at.
    */
  async run (evt: string, payload: ForceOpenAPI): Promise<ForceOpenResult> {
    let { windowId, linkContents, newTab, leafId } = payload

    if (windowId === undefined) {
      windowId = this._app.documents.windowKeys()[0]
    }

    // Determine if the file should be created, if it can't be found. For this
    // we need both the respective preferences setting and an auto-search
    // command.
    const { customDirectory } = this._app.config.get().zkn

    // A link may point at a part of a file: everything after the first hash
    // names that part. For a circuit drawing it names a region of the
    // drawing.
    const { filename, region } = parseLinkTarget(linkContents)

    const file = await this._app.fsal.findExact(filename)

    // Now we have a file (if not, create a new one if the user wishes so)
    if (file !== undefined) {
      // Only a drawing knows regions. A Markdown link that names a heading
      // keeps its old behaviour: the file opens at the top.
      const focus = region !== undefined && region.length > 0 && hasIcprojExt(file.path)
        ? region
        : undefined
      await this._app.documents.openFile(windowId, leafId, file.path, newTab, focus)
      return { path: file.path, region: focus }
    } else if (await this._app.fsal.isDir(customDirectory)) {
      // Call the file-new command on the application, which'll do all
      // necessary steps for us.
      await this._app.commands.run('file-new', { windowId, leafId, name: linkContents, path: customDirectory })
    }

    return {}
  }
}

module.exports = ForceOpen
