---
title: "API Gateway Redesign — From Monolith to Microservices"
type: project
pubDatetime: 2024-01-10T00:00:00Z
description: "Redesigned the API gateway layer to support 200+ microservices with rate limiting, auth delegation, and circuit breakers."
tags: [architecture, microservices, api-gateway, go, redis]
tech: [Go, Redis, Kong, Docker, Kubernetes, gRPC, Prometheus]
role: "Backend Engineer"
organization: "TechStart"
organizationUrl: "https://example.com"
image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80"
highlights:
  - label: "Services"
    value: "200+"
  - label: "p99 Latency"
    value: "<15ms"
  - label: "Uptime"
    value: "99.99%"
---

Led the redesign of a monolithic API layer into a scalable gateway supporting 200+ downstream microservices.

## Key Components

- **Rate limiting** — token bucket per client with Redis backend
- **Auth delegation** — JWT validation + RBAC at the edge, zero auth in downstream services
- **Circuit breakers** — per-service circuit breakers with configurable thresholds
- **Request routing** — path-based routing with canary and blue-green support

## Results

Reduced inter-service auth overhead by 80%, improved p99 latency from 45ms to 15ms, and eliminated cascading failures during partial outages.
