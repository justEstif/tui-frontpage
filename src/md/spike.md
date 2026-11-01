# Spike: OpenTUI + Bun compile + defuddle in one binary

**Verdict: works.** A single `bun build --compile` binary renders an OpenTUI React TUI
and parses HTML with defuddle + linkedom. No fallback (`bunx`) needed.

## Versions

- bun 1.4.4
- @opentui/core 0.8.1, @opentui/react 0.8.1, react 19.3.1
- defuddle 0.19.6, linkedom 0.18.14
- Host: Linux x64, glibc 2.44

## What worked

1. `npx skills add https://opentui.com --skill opentui` — skill installed to
   `.agents/skills/opentui/` (docs in `docs/**/*.mdx`).
2. React hello-world (`index.tsx`): `createCliRenderer()` + `createRoot(renderer).render(<App/>)`
   with `<box>`/`<text>` — renders fine under `bun run index.tsx`.
   Requires tsconfig `jsxImportSource: "@opentui/react"`, React >= 19.2.
3. defuddle: **default export**, not named — `import Defuddle from "defuddle"`
   (named import fails at runtime). Feed it a linkedom `document` from `parseHTML(html)`;
   `.parse()` returns `{ title, content, ... }`.
4. Standalone binary: 130MB, renders TUI + parses HTML, exit 0.

## The compile command (the one gotcha)

`bun build --compile` needs the Linux libc pinned at build time, and the matching
native optional package installed. Default build failed twice:

- Without a define, Bun resolved `@opentui/core-linux-x64-musl`, whose `.so`
  fails on a glibc host (`/usr/lib/libc.so: invalid ELF header`).
- `@opentui/core-linux-x64-glibc` does not exist on npm — the glibc package is
  `@opentui/core-linux-x64` (already installed as an optional dep).

Working command:

```bash
bun build --compile index.tsx --outfile spike-tui \
  --target bun-linux-x64 \
  --define 'process.env.OPENTUI_LIBC="glibc"'
```

(For musl targets: install `@opentui/core-linux-x64-musl`, target
`bun-linux-x64-musl`, define `OPENTUI_LIBC="musl"`.)

## Verification

- `./spike-tui` draws "Hello from OpenTUI React!" (confirmed via terminal escape
  output in captured log) and writes `DEFUDDLE_OK title=Spike Title content=...`
  to a result file — both native paths (OpenTUI FFI .so, linkedom parse) survive
  compile. OpenTUI assets (native lib, parser worker, grammars, WASM) are
  auto-embedded by Bun compile; no `OTUI_ASSET_ROOT` needed.

## Gotchas for the app

- `console.log` inside a running OpenTUI renderer goes to the renderer's
  console overlay, not stdout — write debug output to a file instead.
- Renderer owns the terminal; call `renderer.destroy()` on every shutdown path.
