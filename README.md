# mushradar

An [aio](https://github.com/riagentic/aio) app (counter template).

> **Cloned this repo?** The framework link, `.env`, and `node_modules` are
> gitignored — run `am fix` once (after installing `am` via the aio install
> script) to repair them, then `deno task dev` works.

```sh
deno task dev              # run — browser (flags pass through, see below)
deno task test             # run the starter test
deno task compile          # build the default target (browser)
deno task build            # build every target in deno.json build.targets → dist/
deno task check            # type-check src/ + tests/, then am check
```

`deno task dev` runs in the FOREGROUND and dies with the terminal that started
it. That is right for a person and wrong for an agent, whose every command is a
fresh short-lived shell — one report lost its app about eight times in a session
before finding the answer. `deno task am start` is the supervised background
form: it takes a lock, waits for health, and `am stop` / `am status` / `am logs`
address it afterwards.

The app's version is `major.minor` in deno.json (`"version": "0.1"`) — the build
number is derived from the commit count, so every artifact is named
`mushradar-0.1.<build>…` and reports that version (`-dirty.<hash>` when built
from uncommitted changes).

**`dev` flags pass through** — one task, any shell:

```sh
deno task dev --client=electron     # desktop window (auto-installs Electron)
deno task dev --client=cli          # terminal client
deno task dev --client=server-only  # headless server
deno task dev --expose              # reachable on the LAN (prints pair PIN)
```

**Ship more targets** by listing them in deno.json —
`"build": { "targets": ["browser", "electron", "android"] }` — then
`deno task build` (or one-off: `deno task build --targets=electron`). Run
`deno task build --list` for every target name.

State lives in `src/cell.ts`, UI in `src/App.tsx`, entry in `src/app.ts`. Manage
a running app with `deno task am` (status, state, logs, …).
