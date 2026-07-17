# Just-for-claude-code

A catch-all workspace for small [Claude Code](https://claude.com/claude-code)
projects — experiments, one-off scripts, prototypes, and tasks that don't each
deserve their own git repository.

Instead of creating a new repo for every little thing, each piece of work lives
in its own self-contained folder under [`projects/`](./projects).

## Layout

```
.
├── CLAUDE.md         # Instructions Claude Code reads for this repo
├── .claude/          # Shared Claude Code settings
└── projects/         # One folder per project
    └── _template/    # Copy this to start a new project
```

## Start a new project

```bash
cp -r projects/_template projects/my-new-thing
```

Then edit `projects/my-new-thing/README.md` and start building. See
[`CLAUDE.md`](./CLAUDE.md) for the full conventions.
