# AGENT GUIDELINES (MANDATORY)

## Core Rule

After ANY code change, you MUST update all relevant documentation and system files.

A task is NOT complete until documentation reflects the current implementation.

---

## Required Updates (NON-OPTIONAL)

### 1. Architecture

* File: `/docs/architecture.md`

* Update when:

  * changing system design
  * adding/removing major components
  * modifying APIs
  * changing data flow
  * changing service boundaries

* Must describe:

  * system-level architecture
  * major modules
  * interactions between modules
  * external dependencies

---

### 2. Module Index (REQUIRED)

* File: `/docs/module-index.yaml`

* Purpose:

  * Provide a machine-readable map of the codebase.
  * Allow agents to quickly locate ownership without scanning the entire repository.

* Update when:

  * creating a new module
  * removing a module
  * moving files between modules
  * changing module ownership
  * adding new entry points

* Every module entry must include:

```yaml
- name:
  responsibility:
  owned_paths:
  primary_files:
  entry_points:
  dependencies:
  related_docs:
  related_tests:
```

* Example:

```yaml
- name: auth
  responsibility: User authentication and session management
  owned_paths:
    - src/auth/**
  primary_files:
    - src/auth/service.ts
    - src/auth/routes.ts
  entry_points:
    - POST /login
    - GET /session
  dependencies:
    - database
    - users
  related_docs:
    - docs/modules/auth.md
  related_tests:
    - tests/auth/
```

---

### 3. Module Documentation (REQUIRED)

* Folder:

```
/docs/modules/
```

* One document per module:

```
/docs/modules/<module-name>.md
```

* Update when:

  * changing module behavior
  * adding files
  * removing files
  * changing dependencies
  * changing public APIs
  * changing ownership boundaries

* Each module document must contain:

```md
# Module Name

## Purpose

## Responsibilities

## Owned Paths

## Public Entry Points

## Key Files

## Dependencies

## Data Models

## Invariants

## Known Constraints

## Related Tests
```

* Goal:

  * Allow an agent to understand the module before reading source code.

---

### 4. Features

* File: `/docs/features.md`

* Update when:

  * adding user-facing behavior
  * modifying business logic
  * changing workflows
  * changing UI behavior

* Focus on:

  * what users experience
  * business rules
  * acceptance criteria

---

### 5. Database

* File: `/docs/database.md`

* Update when:

  * schema changes
  * migrations
  * new tables
  * new fields
  * relationship changes
  * persistence flow changes

* Must include:

  * schema overview
  * entity relationships
  * migration notes

---

### 6. Build & Run Documentation

#### Build

* File: `/docs/build.md`

* Update when:

  * build steps change
  * dependencies change
  * tooling changes

#### Local Run

* File: `/docs/run-local.md`

* Update when:

  * startup process changes
  * environment variables change
  * local development workflow changes

---

### 7. Config

* File: `/config/config.json`

* Rules:

  * ALL configurable values must live here
  * NO hardcoded configuration
  * Document new config fields

---

### 8. Logging

* Add logging for:

  * key actions
  * errors
  * state transitions
  * debugging flows

* Logs must be written to:

```
/logs/
```

---

### 9. Progress Tracking

* Folder:

```
/z_progress/
```

* Rule:

  * Create or update ONE file per day

* Format:

```
YYYYMMDD_description.md
```

* Must include:

  * what changed
  * why it changed
  * affected modules
  * assumptions made
  * follow-up work

---

## Documentation Update Workflow (MANDATORY)

For every code change:

1. Update implementation.
2. Update affected module document(s).
3. Update `/docs/module-index.yaml`.
4. Update architecture documentation if system boundaries changed.
5. Update feature documentation if user behavior changed.
6. Update database documentation if persistence changed.
7. Update progress tracking.
8. Verify config and logging requirements.

---

## Enforcement Behavior

If code changes are made but documentation is not updated:

→ The task is considered INCOMPLETE.

Missing module documentation or module-index updates are documentation failures.

---

## Implementation Notes

* Prefer simple, readable solutions.
* Do not over-engineer.
* Keep consistency with existing architecture.
* Reuse existing modules before creating new ones.
* Maintain clear module ownership.

---

## Priority Order

1. Correctness
2. Maintainability
3. Documentation completeness
4. Discoverability of code ownership
5. Performance

---

## Final Step (MANDATORY)

Before finishing ANY task verify:

✔ Architecture documentation updated if required

✔ Module documentation updated

✔ Module index updated

✔ Feature documentation updated if required

✔ Database documentation updated if required

✔ Build/run documentation updated if required

✔ Progress file updated

✔ Config rules followed

✔ Logging rules followed

✔ No missing documentation
