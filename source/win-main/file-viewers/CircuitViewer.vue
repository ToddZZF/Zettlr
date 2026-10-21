<template>
  <div class="circuit-viewer">
    <div class="circuit-toolbar">
      <span class="circuit-title">
        <span
          v-if="dirty"
          class="circuit-dirty"
          title="The drawing has changes that are not on disk"
        >●</span>
        {{ fileName }}
      </span>
      <span
        v-if="status.length > 0"
        class="circuit-status"
      >{{ status }}</span>
    </div>
    <div class="circuit-frame-container">
      <iframe
        ref="frameElement"
        class="circuit-frame"
        v-bind:src="editorUrl"
        title="Circuit editor"
      ></iframe>
      <div
        v-if="error.length > 0"
        class="circuit-error"
      >
        <p>{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { type OpenDocument } from '@dts/common/documents'
import { type EditorCommands } from '../App.vue'
import { useDocumentTreeStore } from 'source/pinia'
import {
  CIRCUIT_EDITOR_URL,
  onCircuitMessage,
  postToCircuit,
  readCircuitProject,
  writeCircuitProject,
  type CircuitAutoSaveMode,
  type CircuitEditorMessage
} from '@common/util/circuit-host'

const props = defineProps<{
  leafId: string
  windowId: string
  activeFile: OpenDocument|null
  editorCommands: EditorCommands
  file: OpenDocument
}>()

const documentTreeStore = useDocumentTreeStore()

const frameElement = ref<HTMLIFrameElement|null>(null)
const status = ref<string>('')
const error = ref<string>('')
/** Whether the drawing holds changes that are not on disk. */
const dirty = ref<boolean>(false)

/** The drawing the editor was last given. */
let loadedPath: string|undefined
/** The region the editor was last asked to frame. */
let lastFocus: string|undefined

const editorUrl = computed<string>(() => CIRCUIT_EDITOR_URL)
const fileName = computed<string>(() => {
  const parts = props.file.path.split(/[\\/]/u)
  return parts[parts.length - 1] ?? props.file.path
})

/**
 * Hands the drawing to the editor.
 *
 * The editor asks for the drawing by path; the note application is the one
 * that reads it, since only the main process may touch the disk.
 */
async function loadDrawing (path: string, focus?: string): Promise<void> {
  const frame = frameElement.value
  if (frame === null) {
    return
  }
  try {
    const text = await readCircuitProject(path)
    loadedPath = path
    lastFocus = focus
    postToCircuit(frame, {
      channel: 'analog-canvas',
      type: 'open',
      path,
      text,
      focus
    })
    status.value = ''
    error.value = ''
    dirty.value = false
  } catch (err: any) {
    error.value = `Could not open the drawing: ${err?.message ?? String(err)}`
  }
}

/**
 * Frames a region of the drawing.
 */
function focusRegion (region: string|undefined): void {
  const frame = frameElement.value
  if (frame === null || region === undefined) {
    return
  }
  lastFocus = region
  postToCircuit(frame, {
    channel: 'analog-canvas',
    type: 'focus',
    region
  })
}

/**
 * Tells the editor how eagerly the drawing should be written.
 *
 * A note application keeps its notes on disk without a save command, so the
 * drawing follows the same preference: the person decides once, in the
 * settings, and every drawing behaves like the note beside it.
 */
function sendPreferences (): void {
  const frame = frameElement.value
  if (frame === null) {
    return
  }
  const autoSave = window.config.get('editor.autoSave') as CircuitAutoSaveMode
  postToCircuit(frame, {
    channel: 'analog-canvas',
    type: 'preferences',
    autoSave
  })
}

/**
 * Asks the editor to write the drawing.
 *
 * The drawing is the note application's file, so its own save command
 * reaches the editor the same way it reaches the note.
 */
function requestSave (): void {
  const frame = frameElement.value
  if (frame === null) {
    return
  }
  postToCircuit(frame, {
    channel: 'analog-canvas',
    type: 'save-request'
  })
}

const stopListening = onCircuitMessage((message: CircuitEditorMessage) => {
  switch (message.type) {
    case 'ready': {
      const focus = documentTreeStore.circuitFocusTargets.get(props.file.path)
      void loadDrawing(props.file.path, focus)
      sendPreferences()
      break
    }
    case 'dirty': {
      dirty.value = message.dirty === true
      break
    }
    case 'save': {
      const { requestId, path, text } = message
      if (requestId === undefined || path === undefined || text === undefined) {
        return
      }
      writeCircuitProject(path, text)
        .then(() => {
          status.value = 'Saved'
          const frame = frameElement.value
          if (frame !== null) {
            postToCircuit(frame, {
              channel: 'analog-canvas',
              type: 'saved',
              requestId,
              path
            })
          }
        })
        .catch((err: any) => {
          status.value = `Could not save: ${err?.message ?? String(err)}`
          const frame = frameElement.value
          if (frame !== null) {
            postToCircuit(frame, {
              channel: 'analog-canvas',
              type: 'save-failed',
              requestId,
              message: err?.message ?? String(err)
            })
          }
        })
      break
    }
    case 'error': {
      error.value = message.message ?? 'The drawing could not be opened'
      break
    }
  }
}, () => frameElement.value)

// The person presses Save: the drawing is written like the note beside it.
const stopShortcut = window.ipc.on('shortcut', (_event: undefined, command: string) => {
  if (command !== 'save-file') {
    return
  }
  // Only the drawing the person is looking at may be written.
  if (document.activeElement !== frameElement.value) {
    return
  }
  requestSave()
})

// The person changes how eagerly notes are written: the drawing follows.
const stopConfig = window.ipc.on(
  'config-provider',
  (_event: undefined, payload: { command: string, payload: string }) => {
    if (payload.command === 'update' && payload.payload === 'editor.autoSave') {
      sendPreferences()
    }
  }
)

onBeforeUnmount(() => {
  stopListening()
  stopShortcut()
  stopConfig()
})

// A link may point at a region of this drawing. The region is remembered
// until the drawing is opened on it.
watch(
  () => documentTreeStore.circuitFocusTargets.get(props.file.path),
  (region: string|undefined) => {
    if (region === undefined || region === lastFocus) {
      return
    }
    focusRegion(region)
  }
)

// Another drawing took over the pane.
watch(
  () => props.file.path,
  (path: string) => {
    if (loadedPath === path) {
      return
    }
    const focus = documentTreeStore.circuitFocusTargets.get(path)
    void loadDrawing(path, focus)
  }
)
</script>

<style scoped>

.circuit-viewer {
  /* The editor fills the pane outright instead of taking part in its
     layout: the drawing decides how tall it wants to be, and a pane that
     grew with it would never show the whole sheet. */
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--main-bg-color);
}

.circuit-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.4em 0.8em;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8em;
}

.circuit-title {
  font-weight: bold;
}

/* The drawing wants to be saved. */
.circuit-dirty {
  margin-right: 0.4em;
  color: var(--grey-dark);
}

.circuit-status {
  color: var(--grey-dark);
}

.circuit-frame-container {
  position: relative;
  flex-grow: 1;
  min-height: 0;
  overflow: hidden;
}

.circuit-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  background-color: white;
}

.circuit-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--main-bg-color);
  color: var(--main-font-color);
}

</style>
