# Glance

A map of a pull request: where the changes sit in the codebase, and how the
changed functions connect.

## CLI

```sh
cd cli && npm install && npm link   # once

glance                # open the review page for this branch in your browser
glance publish        # upload it and print a secret link for the pull request
glance publish --pr   # …and put the link in this branch's PR description (via gh)
glance json           # print the brief as JSON
glance --help
```

`glance` compares the current branch with the repo's default branch. It reads
TS/JS with the TypeScript compiler to find the touched functions and the calls
between them, and flags what its rules find (swallowed errors, removed
assertions, hard-coded env fallbacks, type/lint escapes, changes with no call
path to the main change). Files matching `skip:` patterns in `.glance.yml`,
lockfiles and generated files are skipped.

`glance publish` keeps one link per branch: publishing again updates the same
page. It reads `GLANCE_PUBLISH_KEY` and `GLANCE_URL`, or
`~/.config/glance/config.json`:

```json
{ "url": "https://glance-mu-three.vercel.app", "publishKey": "…" }
```

## Site

- `public/viewer.html` renders a brief at `/r/<id>`; `/r/sample` shows `public/sample.json`.
- `POST /api/brief` stores a brief in private Vercel Blob storage (needs the publish key).
- `GET /api/brief/<id>` reads it back.

Links are secret URLs: 128-bit random ids, not indexed by search engines.
Pushes to `main` deploy to Vercel.
