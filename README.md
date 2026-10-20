# Glance

A map of a pull request: where the changes sit in the codebase, and how the
changed functions call each other. How it works: https://glance.nishilfaldu.site

## Use

```sh
npm install -g github:nishilfaldu/glance

glance                # open the review page for this branch on localhost
glance --working      # include uncommitted changes
glance publish --pr   # upload it and link it in this branch's pull request
glance --help
```

Glance is local only until you publish. `glance publish` uploads the brief to a
**public** Vercel Blob store you own; set its `BLOB_READ_WRITE_TOKEN`, or put it
in `~/.config/glance/config.json`:

```json
{ "blobToken": "vercel_blob_rw_…" }
```

## Develop

```sh
npm install && npm link   # builds cli/ to cli/dist and puts glance on your PATH
npm run build             # after editing cli/
npm run typecheck
npm run fixture ledger    # build fixtures/ledger into examples/ledger, then run glance there
```

The site in `public/` is static and deploys from `main` to Vercel: `index.html`
is the docs, `viewer.html` renders `/r/sample` and published `/r#<store>/<id>`
links.
