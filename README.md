# Glance

A map of a pull request: where the changes sit in the codebase, and how the
changed functions connect.

## CLI

```sh
npm install -g github:nishilfaldu/glance   # once; or `npm install && npm link` in a clone

glance                # open the review page for this branch in your browser
glance publish        # upload it to your Vercel Blob store and print a link
glance publish --pr   # …and put the link in this branch's PR description (via gh)
glance --working      # include uncommitted changes (local review only)
glance json           # print the brief as JSON
glance --help
```

`glance` compares the current branch with the repo's default branch. It reads
TS/JS with the TypeScript compiler to find the touched functions and the calls
between them, and flags what its rules find (swallowed errors, removed
assertions, hard-coded env fallbacks, type/lint escapes). Files matching `skip:` patterns in `.glance.yml`,
lockfiles and generated files are skipped.

Without setup, glance is local only. `glance publish` uploads the brief to a
Vercel Blob store you own, so storage is on your account: create a **public**
Blob store (a store's access can't change later) and set its
`BLOB_READ_WRITE_TOKEN`, or put it in `~/.config/glance/config.json`:

```json
{ "blobToken": "vercel_blob_rw_…", "url": "https://glance.nishilfaldu.site" }
```

`url` (or `GLANCE_URL`) is the site that shows the page; it defaults to the one
above. Publishing keeps one link per branch: publishing again updates the same
page within a minute.

## Site

The site is static: no API and no storage of its own.

- `public/viewer.html` renders a published brief at `/r#<store>/<id>`, loading
  `glance/<id>.json` from that public Blob store. The part after `#` is never
  sent to the site.
- `/r/sample` shows `public/sample.json`.

Links are secret URLs: 128-bit random ids, not indexed by search engines.
Pushes to `main` deploy to Vercel.

## Fixtures

`fixtures/<name>/` holds a small codebase to review: `main/` is the base, `branch/` overlays the files the
branch changes, and `branch.json` names the branch and the paths it deletes. Build one into its own git repo
under `examples/`, then run glance there:

```sh
npm run fixture ledger
cd examples/ledger && glance
```

`ledger` is a billing monorepo (API, web app, shared package) whose branch adds tax-inclusive pricing.
