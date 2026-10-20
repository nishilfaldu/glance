# Glance

A map of a pull request: where the changes sit in the codebase, and how the
changed functions call each other. How it works: https://glance.nishilfaldu.site

## Use

```sh
pnpm add -g github:nishilfaldu/glance

glance                # open the review page for this branch on localhost
glance --working      # include uncommitted changes
glance publish --pr   # upload it and link it in this branch's pull request
glance --help
```

A `.glance.yml` in the repo root lists files to skip and your own flag rules;
nothing is skipped or flagged otherwise. The format is on the site.

Glance is local only until you publish. `glance publish` uploads the brief to a
**public** Vercel Blob store you own; set its `BLOB_READ_WRITE_TOKEN`, or put it
in `~/.config/glance/config.json`:

```json
{ "blobToken": "vercel_blob_rw_…" }
```

## Develop

```sh
pnpm install
pnpm link --global        # puts this checkout's glance on your PATH
pnpm build                # after editing cli/; commit cli/dist with it
pnpm typecheck
pnpm verify               # fails if cli/dist doesn't match cli/
pnpm fixture ledger       # build fixtures/ledger into examples/ledger, then run glance there
```

`cli/dist` is committed so installing from GitHub needs no build step: pnpm
won't run build scripts of packages installed from git.

The site in `public/` is static and deploys from `main` to Vercel: `index.html`
is the docs, `viewer.html` renders `/r/sample` and published `/r#<store>/<id>`
links.
