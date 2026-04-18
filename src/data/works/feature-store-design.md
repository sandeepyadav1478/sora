---
title: "Real-Time Feature Store Architecture"
type: project
pubDatetime: 2025-02-10T00:00:00Z
description: "Designed a dual-layer feature store with offline batch features in Parquet/S3 and online real-time features in Redis, serving 50M+ predictions/day."
tags: [feature-store, mlops, redis, s3, real-time, python]
role: "ML Platform Engineer"
organization: "DataCorp"
organizationUrl: "https://example.com"
image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80"
highlights:
  - label: "Predictions/Day"
    value: "50M+"
  - label: "Feature Freshness"
    value: "<100ms"
  - label: "Features"
    value: "300+"
---

Built the team's first feature store to solve the train-serve skew problem — ensuring ML models see the same features in training and production.

## Architecture

- **Offline store** — Parquet files on S3, computed via Airflow batch jobs
- **Online store** — Redis cluster with sub-10ms reads for real-time serving
- **Feature registry** — centralized catalog with lineage, ownership, and freshness SLAs
- **SDK** — Python client for consistent feature retrieval in notebooks, training, and serving

## Key Design Decisions

- Chose Redis over DynamoDB for online store — 3x lower p99 latency at our scale
- Parquet over Delta Lake for offline — simpler, team already familiar, good enough for batch
- Built custom registry instead of adopting Feast — our schema requirements didn't fit

## Impact

Eliminated train-serve skew for all production models. Feature reuse across teams went from 0% to 60%, reducing duplicate computation by ~$2K/month.
