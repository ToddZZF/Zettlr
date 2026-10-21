/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Zettelkasten Embed Parser
 * CVM-Role:        InlineParser
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     A small parser that adds embedded drawings to the tree.
 *
 *                  `![[inv.icproj.json]]` shows the drawing inside the note,
 *                  and `![[inv.icproj.json|#Bias]]` shows one region of it.
 *
 * END HEADER
 */

import { type InlineParser } from '@lezer/markdown'

// An embed is a wiki link with a bang in front of it. The content may not
// span lines: a drawing belongs to the paragraph that shows it.
const EMBED_RE = /^!\[\[([^\]\n]*)\]\]/u

export const zknEmbedParser: InlineParser = {
  name: 'zkn-embeds',
  // Before the default link parser, which would otherwise claim the bang.
  before: 'Link',
  parse: (ctx, next, pos) => {
    if (next !== 33) { // 33 === '!'
      return -1
    }

    const match = EMBED_RE.exec(ctx.text.slice(pos - ctx.offset))
    if (match === null) { return -1 }

    const content = match[1] ?? ''
    const contentFrom = pos + 3
    const contentTo = contentFrom + content.length

    const children = [
      ctx.elt('ZknEmbedMark', pos, contentFrom),
      ctx.elt('ZknEmbedContent', contentFrom, contentTo),
      ctx.elt('ZknEmbedMark', contentTo, contentTo + 2)
    ]

    return ctx.addElement(ctx.elt('ZknEmbed', pos, contentTo + 2, children))
  }
}
