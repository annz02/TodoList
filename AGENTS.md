# AGENTS.md

Guidance for AI coding agents and contributors working in this repository.

## Git commit convention

All commit messages MUST follow the **Angular Commit Convention** (Conventional Commits spec):

```
<type>(<scope>): <subject>
```

- **type** (any of): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **scope** (optional): the area being changed, e.g. `ai-chat`, `sidebar`, `calendar`, `todos`.
- **subject**: a concise, imperative, English sentence. No trailing period.

Example commit messages:

```
feat(ai-chat): add full assistant chat page

refactor(sidebar): move navigation items into a collapsible group

fix: protect inline markdown tags from being re-escaped
```

You may add a blank line followed by a bullet-point body explaining the `what` and `why` when the change is non-trivial.
