# Turning the custom domain back on

The site is currently served from GitHub Pages at:

    https://brendin10.github.io/freshprintsgrooming/

The `CNAME` file was renamed to `CNAME.disabled` on 11 September 2026 so that
Pages would serve at that address. While a `CNAME` file exists in the repo,
GitHub claims the custom domain and redirects the `github.io` URL to it — and
`freshprintsgrooming.com` does not point at GitHub yet, so the site would have
been unreachable.

## What the DNS looked like on 11 September 2026

| Host | Resolves to | What that is |
|---|---|---|
| `freshprintsgrooming.com` | `34.111.179.208` | Not GitHub — the old host the README warns about |
| `www.freshprintsgrooming.com` | `208.91.197.27` | A registrar parking page |

## Step 1 — Point the domain at GitHub

At your domain registrar, in the DNS settings for `freshprintsgrooming.com`:

**Delete** the existing `A` record for the root (`@`) pointing at
`34.111.179.208`, and the `www` record pointing at `208.91.197.27`.

**Add four A records** for the root (`@`), all four:

    185.199.108.153
    185.199.109.153
    185.199.110.153
    185.199.111.153

**Add one CNAME record** for `www` pointing at:

    brendin10.github.io

DNS can take anywhere from a few minutes to a few hours to spread.
Check progress with `nslookup freshprintsgrooming.com` — when it answers with
the `185.199.*` addresses instead of `34.111.179.208`, it's ready.

## Step 2 — Turn the CNAME file back on

Only once Step 1 resolves correctly:

    git mv CNAME.disabled CNAME
    git add CNAME
    git commit -m "Restore custom domain"
    git push

Then in the repo: **Settings -> Pages -> Custom domain**, enter
`freshprintsgrooming.com`, Save, and tick **Enforce HTTPS** once the
certificate finishes provisioning (that can take up to 24 hours).

The `github.io` URL will then redirect to the custom domain, which is the
intended final state.
