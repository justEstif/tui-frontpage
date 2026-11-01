await Bun.build({
  entrypoints: ["./index.tsx"],
  compile: {
    target: "bun-linux-x64-musl",
    outfile: "./spike-tui",
  },
  define: {
    "process.env.OPENTUI_LIBC": JSON.stringify("musl"),
  },
})
