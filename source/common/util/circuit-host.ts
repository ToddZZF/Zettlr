/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Circuit host helpers
 * CVM-Role:        Utility functions
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     The bridge between the note application and the circuit
 *                  editor that runs inside it.
 *
 *                  The editor is a small application of its own, served from
 *                  the `circuit://` scheme. It never touches the disk: the
 *                  note application hands it a drawing and writes back what
 *                  it changes.
 *
 * END HEADER
 */

/** The channel every message between the two travels on. */
export const CIRCUIT_CHANNEL = 'analog-canvas'

/** The editor itself. */
export const CIRCUIT_EDITOR_URL = 'circuit://app/zettlr.html'

/** The frame that draws a figure for a note. */
export const CIRCUIT_RENDER_URL = 'circuit://app/render.html'

/** How eagerly the note application writes a drawing. */
export type CircuitAutoSaveMode = 'off'|'immediately'|'delayed'

/** What the note application tells the circuit editor. */
export interface CircuitHostMessage {
  channel: typeof CIRCUIT_CHANNEL
  type: 'open'|'render'|'focus'|'preferences'|'save-request'|'saved'|'save-failed'
  path?: string
  text?: string
  focus?: string
  region?: string
  requestId?: string
  message?: string
  /** The note application's own save preference, for the 'preferences' message. */
  autoSave?: CircuitAutoSaveMode
}

/** What the circuit editor tells the note application. */
export interface CircuitEditorMessage {
  channel: typeof CIRCUIT_CHANNEL
  type: 'ready'|'save'|'rendered'|'error'|'dirty'
  requestId?: string
  path?: string
  text?: string
  svg?: string
  width?: number
  height?: number
  message?: string
  /** Whether the drawing holds changes that are not on disk. */
  dirty?: boolean
}

function isCircuitMessage (value: unknown): value is CircuitEditorMessage {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<CircuitEditorMessage>
  return candidate.channel === CIRCUIT_CHANNEL && typeof candidate.type === 'string'
}

/**
 * Sends a message to the circuit editor in the given frame.
 *
 * @param   {HTMLIFrameElement}  frame    The frame to talk to
 * @param   {CircuitHostMessage}  message  What to say
 */
export function postToCircuit (frame: HTMLIFrameElement, message: CircuitHostMessage): void {
  frame.contentWindow?.postMessage(message, '*')
}

/**
 * Watches for the circuit editor's messages.
 *
 * The application talks to more than one frame — the editor of an open
 * drawing, and the frame that draws the figures of a note — so a listener
 * says which frame it listens to. Without that, the editor would answer the
 * figure frame's announcements and vice versa.
 *
 * @param   {Function}            handler  What to do with the message
 * @param   {Function}            source   The frame to listen to, if any
 *
 * @return  {Function}                       Stops watching.
 */
export function onCircuitMessage (
  handler: (message: CircuitEditorMessage) => void,
  source?: () => HTMLIFrameElement|null
): () => void {
  const listener = (event: MessageEvent): void => {
    if (source !== undefined) {
      const frame = source()
      if (frame === null || event.source !== frame.contentWindow) {
        return
      }
    }
    if (!isCircuitMessage(event.data)) {
      return
    }
    handler(event.data)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/**
 * Reads a drawing from the disk.
 *
 * @param   {string}            path  The path of the drawing
 *
 * @return  {Promise<string>}          The contents of the drawing.
 */
export async function readCircuitProject (path: string): Promise<string> {
  return await window.ipc.invoke('application', {
    command: 'circuit-project',
    payload: { action: 'read', path }
  })
}

/**
 * Writes a drawing to the disk.
 *
 * @param   {string}            path     The path of the drawing
 * @param   {string}            content  What the drawing should say
 *
 * @return  {Promise<void>}
 */
export async function writeCircuitProject (path: string, content: string): Promise<void> {
  await window.ipc.invoke('application', {
    command: 'circuit-project',
    payload: { action: 'write', path, content }
  })
}
