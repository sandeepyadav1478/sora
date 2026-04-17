---
title: "GitOps at Scale — Lessons from 200 Microservices"
type: writing
pubDatetime: 2025-06-15T00:00:00Z
description: "A deep dive into how we migrated 200 microservices to a GitOps workflow using ArgoCD and Kustomize."
featured: true
tags: [devops, kubernetes, gitops, argocd, writing]
links:
  - label: "Read on Dev.to"
    url: "https://dev.to/johndoe"
  - label: "HN Discussion"
    url: "https://news.ycombinator.com"
image: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=800&q=80"
---

This article covers our 18-month journey migrating from a manual deployment process to a fully automated GitOps pipeline.

## The Problem

With 200+ microservices and 15 engineering teams, our deployment process was a bottleneck:

- Manual kubectl applies from developer laptops
- No audit trail for production changes
- Rollbacks required SSH access and tribal knowledge
- Average deploy time: 45 minutes per service

## The Solution

We adopted a GitOps model with ArgoCD as the core:

1. **Single source of truth** — all manifests in a monorepo
2. **Kustomize overlays** — per-environment configuration without duplication
3. **PR-based deploys** — merge to `main` triggers production rollout
4. **Automated rollbacks** — health checks trigger automatic revert on failure

## Results

| Metric | Before | After |
|--------|--------|-------|
| Deploy time | 45 min | 3 min |
| Failed deploys/month | 12 | 2 |
| Time to rollback | 30 min | 30 sec |
| Teams self-deploying | 3/15 | 15/15 |

## Key Takeaway

> GitOps isn't about the tools — it's about making production state observable, auditable, and reversible.

The article reached #1 on Hacker News and was shared across DevOps communities.
