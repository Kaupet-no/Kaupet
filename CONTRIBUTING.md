# Contributing to Kaupet.no

Thank you for considering contributing! Kaupet.no is a community-driven project, and every contribution — from fixing a typo to adding new features — makes the service better for everyone.

## How to propose a change

1. **Fork** the repo to your own GitHub account.
2. **Create a branch** with a descriptive name: `git checkout -b fiks/manglende-knapp` or `feat/favoritter-sortering`.
3. **Make your changes** — keep them focused and atomic.
4. **Run the checks locally** before pushing:
   ```bash
   bun run lint
   bunx tsc --noEmit
   bun run build
   ```
5. **Open a pull request** against `main`. Describe what you changed and why. Screenshots are gold for UI changes.

A moderator will look at the PR as soon as possible. CI must be green and at least one moderator must approve before merging.

## Reporting bugs and suggesting features

- **Bug?** Open a [bug issue](https://github.com/Kaupet-no/kaupet/issues/new?template=bug_report.md) with steps to reproduce.
- **Idea?** Open a [feature issue](https://github.com/Kaupet-no/kaupet/issues/new?template=feature_request.md) or start a [Discussion](https://github.com/Kaupet-no/kaupet/discussions).
- **Vulnerability?** See [SECURITY.md](SECURITY.md) — not in public issues.

## Code style

- **Formatting:** Prettier (`bun run format` if available, otherwise it runs automatically in your editor).
- **Linting:** ESLint — `bun run lint`.
- **TypeScript:** strict mode is on. No `any` without a good reason.
- **Components:** functional, small, and use the semantic design tokens from `src/styles.css` (no hardcoded colors).
- **Language in the UI:** Norwegian Bokmål.
- **Language in code/comments:** English is fine, Norwegian is fine too — be consistent within a file.

## Commit messages

We follow a light variant of [Conventional Commits](https://www.conventionalcommits.org/). Commit subjects in this repo are written in Norwegian:

```
feat: legg til sortering på favoritter
fix: rett feil i kartvisning på mobil
docs: oppdater README med Bun-versjon
chore: oppgrader Tailwind til 4.1
```

## High-level architecture

- `src/routes/` — pages (file-based routing via TanStack Start)
- `src/features/<name>/` — self-contained feature modules (e.g. listing creation, listing search)
- `src/components/` — reusable UI components
- `src/lib/` — helpers, server functions (`*.functions.ts`)
- `src/integrations/supabase/` — auto-generated, do not touch
- `supabase/migrations/` — database schema as SQL migrations

Server-side logic is written as TanStack `createServerFn`, not as Supabase Edge Functions.

## Licensing and contribution rights

All contributors must sign our **Contributor License Agreement (CLA)** before a pull request can be merged. The CLA grants Happy Pixel AS the rights to use and distribute your contribution.

The first time you open a PR, a GitHub bot will ask you to sign by posting a comment on the PR. It only takes a few seconds.

Read the CLA here: [CLA.md](CLA.md)

Thank you! Together we're building Norway's best marketplace for second-hand goods! ❤️
