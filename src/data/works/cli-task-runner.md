---
title: "taskr — Developer Task Runner CLI"
type: oss
cardStyle: borderless
pubDatetime: 2024-11-08T00:00:00Z
description: "A fast, opinionated task runner for monorepos — parallel execution, dependency graphs, and smart caching. Written in Go."
tags: [cli, developer-tools, monorepo, open-source, build-systems]
tech: [Go, Cobra, DAG, Make, Bash]
status: active
links:
  - label: "Source Code"
    url: "https://github.com/example/taskr"
image: "https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=800&q=80"
---

A CLI tool born from frustration with slow CI builds in large monorepos.

## Features

- **Parallel execution** — runs independent tasks concurrently with configurable concurrency limits
- **Dependency graph** — DAG-based task ordering, only runs what's needed
- **Smart caching** — content-addressable cache skips tasks when inputs haven't changed
- **Simple config** — YAML task definitions, no DSL to learn

## Why Go

Single binary distribution, fast startup, excellent concurrency primitives. Users download one binary — no runtime dependencies.

## Usage

```yaml
# taskr.yaml
tasks:
  lint:
    cmd: eslint src/
    inputs: ["src/**/*.ts"]
  test:
    cmd: pytest tests/
    deps: [lint]
    inputs: ["src/**/*.py", "tests/**/*.py"]
  build:
    cmd: docker build -t app .
    deps: [test]
```

```bash
taskr run build  # runs lint → test → build, skips cached steps
```
