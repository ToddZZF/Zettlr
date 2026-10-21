/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Circuit project helpers
 * CVM-Role:        Utility functions
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     A circuit drawing is a project file with a double
 *                  extension: `inv.icproj.json`. These helpers translate
 *                  between the file name and the name a note refers to it by.
 *
 * END HEADER
 */

import { ICPROJ_EXT, hasIcprojExt } from './file-extention-checks'

/**
 * The name of a drawing without its project extension.
 *
 * `inv.icproj.json` is called `inv` in a note, the way a Markdown file is
 * called by its name without the `.md`. Returns `null` for every other name.
 *
 * @param   {string}   name  The file name to strip
 *
 * @return  {string|null}      The name, or null if this is not a drawing.
 */
export function circuitProjectStem (name: string): string|null {
  const lower = name.toLowerCase()
  for (const extension of ICPROJ_EXT) {
    if (lower.endsWith(extension)) {
      return name.slice(0, name.length - extension.length)
    }
  }
  return null
}

/**
 * The file name a drawing with the given name has.
 *
 * @param   {string}   stem  The name of the drawing
 *
 * @return  {string}         The file name, including its extension.
 */
export function circuitProjectFileName (stem: string): string {
  return `${stem}${ICPROJ_EXT[0] as string}`
}

/**
 * Does this file name belong to a circuit drawing?
 *
 * @param   {string}   name  The file name to check
 *
 * @return  {boolean}         Whether the name is a drawing.
 */
export function isCircuitProjectName (name: string): boolean {
  return hasIcprojExt(name)
}

/**
 * What a link points at.
 */
export interface LinkTarget {
  /** The name of the file the link points at, without any region. */
  filename: string
  /**
   * The region of a drawing the link points at, if it names one. A region is
   * written either as a fragment of the file name (`drawing#OutputStage`) or
   * as a title beginning with a hash (`drawing|#OutputStage`).
   */
  region?: string
}

/**
 * Splits the contents of a wikilink into the file it points at and the
 * region of that file it points at.
 *
 * Zettelkasten links carry an optional title after a pipe. A title that
 * begins with a hash names a part of the target rather than an alias for it,
 * which is how a note refers to one region of a drawing. The same is true of
 * a hash within the file name itself.
 *
 * @param   {string}      linkContents  The raw contents of the link
 *
 * @return  {LinkTarget}               The file and, if given, the region.
 */
export function parseLinkTarget (linkContents: string): LinkTarget {
  const pipeIndex = linkContents.indexOf('|')
  const content = pipeIndex >= 0 ? linkContents.slice(0, pipeIndex) : linkContents
  const title = pipeIndex >= 0 ? linkContents.slice(pipeIndex + 1) : undefined

  const hashIndex = content.indexOf('#')
  const filename = (hashIndex >= 0 ? content.slice(0, hashIndex) : content).trim()

  let region: string|undefined = undefined
  if (hashIndex >= 0) {
    region = content.slice(hashIndex + 1).trim()
  } else if (title !== undefined && title.startsWith('#')) {
    region = title.slice(1).trim()
  }

  if (region === '') {
    region = undefined
  }

  return region === undefined ? { filename } : { filename, region }
}
