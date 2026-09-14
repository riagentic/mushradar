# Working on mushradar with an AI agent

This app is built on [aio](https://github.com/riagentic/aio) — one
`cell({ state, methods })` drives server state, persistence, sync and the UI. It
is not React, Express or Next; guessing from those produces code that
type-checks and is wrong.

## Read this first

    am agent

One command, one page: the model, the full API, every `am` verb, how to add
state/UI/tests, debug and ship. `am agent --task=<slug>` for one section
(`--list` for all; `--task=new` is the build flow).

## Four rules

- **Never end an app by process match.** `pkill -f app.ts` matches EVERY aio app
  on the machine. Use `am stop` (`am stop --all` for this project);
  `am instances` shows what is running.
- **Never take over the screen.** Use `am start --client=server-only` and read
  the UI with `am surface` — it needs no window.
- **Never script around `am`.** Python, jq or curl against this app is a worse
  copy of a verb. Every command takes `--json`.
- **Learn before editing.** `am agent` first.

## The loop

    am start --client=server-only  # daemonised; deno task dev dies with your shell
    am surface --json              # what is on screen, by NAME
    am dispatch <cell:method> args # drive the state machine
    am expect <path> eq <value>    # assert — do not pipe state to a parser
    am timeline --lines=20         # what happened, with state diffs
    deno task test && deno task check && deno task lint
