# CLAUDE.md

This file gives Claude Code the context it needs to work in this repository.

## What this repo is

This is a **catch-all workspace for small Claude Code projects** — experiments,
one-off scripts, prototypes, and tasks that don't each deserve their own git
repository. Instead of spinning up a new repo for every little thing, each piece
of work lives in its own folder under [`projects/`](./projects).

Think of it as a shared home for "just for Claude Code" work: quick enough to not
warrant repo overhead, but worth keeping and versioning.

## How work is organized

```
.
├── CLAUDE.md            # You are here — repo-wide instructions
├── README.md            # Human-facing overview
├── .claude/
│   └── settings.json    # Shared Claude Code settings for this repo
└── projects/
    ├── README.md        # Index of projects
    ├── _template/       # Copy this to start a new project
    └── <project-name>/  # One folder per project
```

### Starting a new project

1. Copy `projects/_template/` to `projects/<short-kebab-case-name>/`.
2. Fill in that project's `README.md` (what it is, how to run it).
3. Keep everything for that task self-contained inside its folder.

### Working inside a project

- Treat each `projects/<name>/` folder as its own mini-project. Don't let one
  project's files, dependencies, or config leak into another's folder.
- If a project needs its own language-specific setup (a `package.json`, a
  `requirements.txt`, a virtualenv, etc.), keep it **inside** that project's
  folder.
- Prefer self-contained, dependency-light solutions. These are meant to be
  lightweight.

## Conventions

- **Naming:** project folders use `kebab-case` (e.g. `pdf-merger`, `slack-bot`).
- **Docs:** every project folder has a `README.md` describing what it does and
  how to run it.
- **Commits:** use clear, descriptive commit messages. When a commit is specific
  to one project, prefix it with the project name, e.g. `pdf-merger: handle
  empty input`.
- **Scope:** if a project grows large or takes on a life of its own, that's the
  signal to graduate it into its own dedicated repository.

## What NOT to do

- Don't put project-specific files at the repo root — they belong in a
  `projects/<name>/` folder.
- Don't delete or overwrite another project's folder when working on a task.
- Don't add heavy, repo-wide dependencies for the sake of a single small project.
