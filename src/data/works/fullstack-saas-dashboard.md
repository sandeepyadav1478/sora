---
title: "SaaS Analytics Dashboard — Full-Stack Build"
type: project
pubDatetime: 2024-07-22T00:00:00Z
description: "Self-hosted analytics dashboard with real-time event streaming, custom SQL queries, and team collaboration. React + FastAPI + PostgreSQL."
tags: [full-stack, analytics, real-time, self-hosted, dashboard]
tech: [React, TypeScript, FastAPI, PostgreSQL, TimescaleDB, WebSockets, Celery, Docker]
role: "Creator & Lead Developer"
status: in-production
highlights:
  - label: "Events/Day"
    value: "2M+"
  - label: "Active Teams"
    value: "3"
  - label: "Avg Latency"
    value: "<50ms"
links:
  - label: "Source Code"
    url: "https://github.com/example/dashflow"
image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80"
gallery:
  - src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80"
    caption: "SQL query editor"
  - src: "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=600&q=80"
    caption: "Team collaboration panel"
---

Built as a self-hosted alternative to expensive analytics SaaS — runs on a single VPS for small teams.

## Tech Stack

- **Frontend** — React, Recharts, TanStack Query
- **Backend** — FastAPI, WebSocket streaming, Celery for background jobs
- **Database** — PostgreSQL with TimescaleDB extension for time-series
- **Deployment** — Docker Compose, single `docker compose up`

## Features

- Real-time WebSocket event feed
- Custom SQL queries with chart visualization
- Shared dashboards with role-based access
- Lightweight — runs on a $5/month VPS for small teams
