import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import Defuddle from "defuddle"
import { parseHTML } from "linkedom"

function App() {
  return (
    <box style={{ flexDirection: "column", padding: 1 }}>
      <text fg="#00FF88">Hello from OpenTUI React!</text>
      <text>tui-frontpage spike: opentui + bun compile</text>
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)

// Let a few frames render, then verify defuddle + linkedom and exit.
setTimeout(() => {
  const { document } = parseHTML(
    `<html><body><article><h1>Spike Title</h1><p>Spike body text.</p></article></body></html>`,
  )
  const result = new Defuddle(document as unknown as Document).parse()
  const line = "DEFUDDLE_OK title=" + result.title + " content=" + JSON.stringify(result.content?.trim())
  require("node:fs").writeFileSync("/tmp/defuddle_result.txt", line + "\n")
  renderer.destroy()
}, 500)
