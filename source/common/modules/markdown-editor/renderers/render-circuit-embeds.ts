/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Circuit embed renderer
 * CVM-Role:        View
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     Shows a circuit drawing inside a note.
 *
 *                  `![[inv.icproj.json]]` shows the drawing, and
 *                  `![[inv.icproj.json|#Bias]]` shows one region of it.
 *
 * END HEADER
 */

import { renderBlockWidgets } from './base-renderer'
import { type SyntaxNode, type SyntaxNodeRef } from '@lezer/common'
import { WidgetType, type EditorView } from '@codemirror/view'
import { type EditorState } from '@codemirror/state'
import { trans } from '@common/i18n-renderer'
import { parseLinkTarget } from '@common/util/circuit-project'
import { renderCircuitFigure } from './circuit-render-host'
import { readCircuitProject } from '@common/util/circuit-host'

const ipcRenderer = window.ipc

/** The paths of the drawings that have already been looked up. */
const resolvedPaths = new Map<string, string|undefined>()

/**
 * Finds the drawing an embed refers to.
 *
 * The target is a name, the way a Markdown link names a note: `inv` names
 * the drawing `inv.icproj.json`.
 */
async function resolveDrawing (target: string): Promise<string|undefined> {
  if (resolvedPaths.has(target)) {
    return resolvedPaths.get(target)
  }

  try {
    const descriptor = await ipcRenderer.invoke('application', {
      command: 'find-exact',
      payload: target
    })
    const path = descriptor?.path
    resolvedPaths.set(target, path)
    return path
  } catch {
    resolvedPaths.set(target, undefined)
    return undefined
  }
}

class CircuitEmbedWidget extends WidgetType {
  constructor (
    readonly node: SyntaxNode,
    readonly target: string,
    readonly region: string|undefined
  ) {
    super()
  }

  eq (other: CircuitEmbedWidget): boolean {
    return this.target === other.target && this.region === other.region
  }

  toDOM (_view: EditorView): HTMLElement {
    const figure = document.createElement('figure')
    figure.classList.add('circuit-embed')

    const drawing = document.createElement('div')
    drawing.classList.add('circuit-embed-drawing')

    const caption = document.createElement('figcaption')
    caption.textContent = this.region !== undefined
      ? `${this.target} — ${this.region}`
      : this.target

    figure.appendChild(drawing)
    figure.appendChild(caption)

    // Store the position so that the figure can be selected like any other
    // element of the note.
    drawing.dataset.from = String(this.node.from)
    drawing.dataset.to = String(this.node.to)

    void draw(this.target, this.region, drawing)

    return figure
  }

  ignoreEvent (event: Event): boolean { return true }
}

/**
 * Draws the drawing into the given element.
 */
async function draw (
  target: string,
  region: string|undefined,
  element: HTMLElement
): Promise<void> {
  const path = await resolveDrawing(target)
  if (path === undefined) {
    element.textContent = trans('Drawing not found: %s', target)
    element.classList.add('circuit-embed-missing')
    return
  }

  try {
    const text = await readCircuitProject(path)
    const svg = await renderCircuitFigure(path, text, region)
    element.innerHTML = svg
    const svgElement = element.querySelector('svg')
    if (svgElement !== null) {
      svgElement.removeAttribute('width')
      svgElement.removeAttribute('height')
      svgElement.style.width = '100%'
      svgElement.style.height = 'auto'
    }
  } catch (err: any) {
    element.textContent = trans('Drawing could not be shown: %s', err?.message ?? String(err))
    element.classList.add('circuit-embed-missing')
  }
}

function shouldHandleNode (node: SyntaxNodeRef): boolean {
  return node.type.name === 'ZknEmbed'
}

function createWidget (state: EditorState, node: SyntaxNodeRef): CircuitEmbedWidget|undefined {
  const content = node.node.getChild('ZknEmbedContent')
  if (content === null) {
    return undefined
  }

  const raw = state.sliceDoc(content.from, content.to)
  const { filename: target, region } = parseLinkTarget(raw)

  if (target.length === 0) {
    return undefined
  }

  return new CircuitEmbedWidget(
    node.node,
    target,
    region
  )
}

export const renderCircuitEmbeds = [
  renderBlockWidgets(shouldHandleNode, createWidget)
]
