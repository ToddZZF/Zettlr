/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Circuit render host
 * CVM-Role:        Utility functions
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     Draws the figures that notes show.
 *
 *                  A note that embeds a drawing shows the drawing. The
 *                  drawing is rendered by the circuit editor, which runs in
 *                  its own frame — one frame for the whole application, so
 *                  that a note with a dozen drawings does not carry a dozen
 *                  editors.
 *
 * END HEADER
 */

import {
  CIRCUIT_RENDER_URL,
  onCircuitMessage,
  postToCircuit,
  type CircuitEditorMessage
} from '@common/util/circuit-host'

interface PendingFigure {
  resolve: (svg: string) => void
  reject: (error: Error) => void
}

/** The one frame that draws the figures. */
let hostFrame: HTMLIFrameElement|null = null
/** Whether that frame has announced itself. */
let hostReady = false
/** The figures that are being drawn, by request ID. */
const pending = new Map<string, PendingFigure>()
/** The frames waiting for the host to become ready. */
const waiting: Array<() => void> = []

/**
 * Creates the frame that draws the figures.
 *
 * The frame is hidden: it is a worker, not a window. It stays for the life
 * of the application, so the figures of a note are drawn by one editor.
 */
function ensureHost (): HTMLIFrameElement {
  if (hostFrame !== null) {
    return hostFrame
  }

  const frame = document.createElement('iframe')
  frame.classList.add('circuit-render-host')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Circuit renderer')
  frame.style.display = 'none'
  frame.src = CIRCUIT_RENDER_URL
  document.body.appendChild(frame)
  hostFrame = frame

  onCircuitMessage(
    (message: CircuitEditorMessage) => {
      switch (message.type) {
        case 'ready': {
          hostReady = true
          while (waiting.length > 0) {
            waiting.shift()?.()
          }
          break
        }
        case 'rendered': {
          const request = message.requestId
          if (request === undefined) {
            break
          }
          const figure = pending.get(request)
          if (figure === undefined) {
            break
          }
          pending.delete(request)
          figure.resolve(message.svg ?? '')
          break
        }
        case 'error': {
          // An error carries the request ID of the figure that failed.
          const request = message.requestId
          if (request === undefined) {
            break
          }
          const figure = pending.get(request)
          if (figure === undefined) {
            break
          }
          pending.delete(request)
          figure.reject(new Error(message.message ?? 'The drawing could not be rendered'))
          break
        }
      }
    },
    // Only the frame that draws the figures answers this listener.
    () => hostFrame
  )

  return frame
}

/**
 * Draws a drawing.
 *
 * @param   {string}            path    The path of the drawing
 * @param   {string}            text    The contents of the drawing
 * @param   {string}            region  The region to show, if any
 *
 * @return  {Promise<string>}           The figure, as SVG markup.
 */
export async function renderCircuitFigure (
  path: string,
  text: string,
  region?: string
): Promise<string> {
  const frame = ensureHost()

  if (!hostReady) {
    await new Promise<void>((resolve) => {
      waiting.push(resolve)
    })
  }

  const requestId = `figure-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const figure = new Promise<string>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
  })

  postToCircuit(frame, {
    channel: 'analog-canvas',
    type: 'render',
    requestId,
    path,
    text,
    focus: region
  })

  return await figure
}
