// Binary build — libc pin gotcha in src/md/spike.md (musl .so fails on glibc).
await Bun.build({
  entrypoints: ["./index.ts"],
  compile: {
    target: "bun-linux-x64",
    outfile: "./frontpage",
  },
  define: {
    "process.env.OPENTUI_LIBC": JSON.stringify("glibc"),
  },
});
