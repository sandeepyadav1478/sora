---
title: "Migrating 50 Services to Kubernetes — A Retrospective"
type: writing
pubDatetime: 2025-03-20T00:00:00Z
description: "What went right, what broke, and what we'd do differently migrating a monolith-era fleet to Kubernetes over six months."
tags: [devops, migration, architecture, retrospective, platform-engineering]
tech: [Kubernetes, Docker, Helm, Terraform, ArgoCD, Prometheus]
links:
  - label: "Read Article"
    url: "https://example.com"
image: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=800&q=80"
---

A candid retrospective on our six-month Kubernetes migration — from "let's just containerize everything" to a working platform.

## What Went Right

- **Incremental migration** — moved services one at a time, not big-bang
- **Helm charts as contracts** — standardized deployment configs across teams
- **Canary deploys from day one** — caught 3 production regressions before full rollout

## What Broke

- **DNS resolution** — CoreDNS under load caused 5xx spikes for a week
- **Resource limits** — OOMKilled pods everywhere until we profiled actual memory usage
- **Secrets management** — migrating from env files to Vault took longer than the k8s migration itself

## Key Numbers

- 50 services migrated in 6 months
- Deploy time: 25 min → 4 min (GitHub Actions + ArgoCD)
- Incident rate: -35% in the first quarter post-migration
