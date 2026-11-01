# tui-frontpage

A terminal reading queue that learns what you actually read — and tells you why.

Save stories, read them, mark them up. Every action is signal: the queue reorders itself around your taste, and `w` shows the receipt — which words and sources earned a story its spot. Written in TypeScript on [Bun](https://bun.com) and [OpenTUI](https://opentui.com). No accounts, no cloud, no telemetry: your data never leaves your machine.

## Install

```sh
mise use github:justEstif/tui-frontpage
frontpage
```

Requires no other tools. The first run seeds 12 demo stories and walks you through rating 5 of them — watch the queue reorder. Delete `~/.config/frontpage/` to start fresh with your own pile.

## Use

```sh
frontpage          # the reading queue
frontpage d        # daemon: polls subscribed feeds in the background
frontpage d --stop # stop the daemon
```

Without the daemon, the TUI polls feeds itself while open. With it, the daemon owns polling and the queue is fresh whenever you attach.

### Keys

| Key       | In queue              | In reader     |
| --------- | --------------------- | ------------- |
| `j` / `k` | move                  | scroll        |
| `enter`   | open story            | —             |
| `x`       | dismiss               | —             |
| `S`       | save                  | —             |
| `m` / `f` | more / less like this | same          |
| `h`       | —                     | mark sentence |
| `u`       | undo last action      | same          |
| `w`       | why this ranking      | full receipt  |
| `c`       | capture a URL         | —             |
| `q`       | quit                  | back to queue |

## Privacy

Everything — stories, marks, the ranking weights they feed — lives in `~/.config/frontpage/`. Nothing is sent anywhere. The only network traffic is fetching the feeds and articles you subscribed to.

## For developers

```sh
bun install
bun run index.ts   # run the TUI from source
bun test           # 64 tests, including the architecture boundary test
bun run lint       # oxlint with size/complexity gates
```

The architecture is hexagonal and enforced by a test: `src/domain/` imports nothing outside itself, `src/adapters/` knows only domain + vendors, `src/tui/` never touches storage or the network directly. Break a boundary and `arch.test.ts` fails with the offending import.

Intent and design decisions live in `src/md/` — start at [src/md/README.md](src/md/README.md). Tests are the executable specification of those intents.
