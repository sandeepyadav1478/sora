---
title: "DashFlow — Real-time Analytics Dashboard"
type: project
pubDatetime: 2025-03-20T00:00:00Z
description: "A self-hosted analytics dashboard with real-time event streaming, custom SQL queries, and team collaboration features."
featured: true
tags: [typescript, react, postgresql, websockets, docker]
links:
  - label: "Source Code"
    url: "https://github.com/johndoe/dashflow"
  - label: "Live Demo"
    url: "https://dashflow-demo.vercel.app"
image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80"
---

DashFlow is a self-hosted analytics platform I built to replace our team's reliance on expensive third-party tools.

## Features

- **Real-time streaming** — WebSocket-powered live event feed
- **Custom SQL queries** — write queries directly, visualize results as charts
- **Team dashboards** — shared views with role-based access
- **Docker-first** — single `docker compose up` to run everything
- **Lightweight** — runs on a $5/month VPS for small teams

## Tech Stack

- Frontend: React + Recharts + TanStack Query
- Backend: Node.js + Fastify + WebSocket
- Database: PostgreSQL with TimescaleDB extension
- Deployment: Docker Compose

## Usage

Currently used by 3 teams internally. Handles ~2M events/day on a single PostgreSQL instance.

```bash
git clone https://github.com/johndoe/dashflow
cd dashflow
docker compose up -d
```
