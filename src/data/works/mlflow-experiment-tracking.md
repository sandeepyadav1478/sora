---
title: "ML Experiment Tracking Platform with MLflow"
type: project
pubDatetime: 2025-06-15T00:00:00Z
description: "Built a centralized MLflow-based experiment tracking and model registry platform serving 15+ ML engineers across 3 teams."
tags: [mlops, experiment-tracking, model-registry, platform-engineering]
tech: [MLflow, Python, PostgreSQL, MinIO, Docker, Nginx, Grafana]
role: "ML Platform Engineer"
status: in-production
highlights:
  - label: "Engineers Served"
    value: "15+"
  - label: "Experiments/Week"
    value: "200+"
  - label: "Models in Registry"
    value: "40+"
links:
  - label: "Internal Docs"
    url: "https://example.com"
organization: "DataCorp"
organizationUrl: "https://example.com"
image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80"
timeline:
  - date: "Jun 2025"
    title: "Platform Setup"
    description: "Self-hosted MLflow on ECS with PostgreSQL backend and S3 artifact store"
  - date: "Aug 2025"
    title: "Model Registry"
    description: "Standardized model versioning with automated staging → production promotion"
  - date: "Oct 2025"
    title: "CI Integration"
    description: "GitHub Actions pipeline for automated model evaluation on PR merge"
  - date: "Dec 2025"
    title: "Team Adoption"
    description: "All 3 ML teams onboarded, 200+ experiments tracked weekly"
---

Designed and deployed a centralized ML experiment tracking platform that brought reproducibility and visibility to the team's ML workflows.

## Architecture

- **MLflow Tracking Server** — ECS-hosted with PostgreSQL metadata store
- **Artifact Store** — S3 with lifecycle policies for cost management
- **Model Registry** — versioned model artifacts with stage transitions (Staging → Production)
- **Auth** — OIDC integration with company SSO

## Key Features

- Auto-logging for PyTorch, sklearn, and HuggingFace training runs
- Custom MLflow plugins for GPU utilization and cost tracking
- Slack notifications on model promotion events
- Grafana dashboards for experiment trends and compute usage
