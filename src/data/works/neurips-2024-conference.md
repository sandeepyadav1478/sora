---
title: "NeurIPS 2024 — Spotlight Poster Presentation"
type: conference
pubDatetime: 2024-12-10T00:00:00Z
description: "Presented poster on efficient fine-tuning methods for domain-specific LLMs at NeurIPS 2024 in Vancouver."
featured: true
tags: [ml-research, community]
tech: [PyTorch, LoRA, DeepSpeed, Weights & Biases]
organization: "NeurIPS"
organizationUrl: "https://neurips.cc"
role: "Poster Presenter"
links:
  - label: "Conference"
    url: "https://neurips.cc/virtual/2024"
  - label: "Poster PDF"
    url: "https://example.com/poster.pdf"
highlights:
  - label: "Attendees"
    value: "16,000+"
  - label: "Poster Session"
    value: "Spotlight"
  - label: "Citations"
    value: "12"
timeline:
  - date: "Jun 2024"
    title: "Paper submitted"
    description: "Submitted to NeurIPS main track"
  - date: "Sep 2024"
    title: "Accepted as spotlight"
    description: "One of 300 spotlights from 12,000+ submissions"
  - date: "Dec 2024"
    title: "Poster presentation"
    description: "Presented at Vancouver Convention Centre"
---

## Abstract

We propose a parameter-efficient fine-tuning approach that reduces compute requirements by 4x while maintaining 97% of full fine-tuning performance on domain-specific benchmarks. Our method combines adaptive rank selection with gradient-aware layer freezing.

## Key Contributions

- **Adaptive LoRA rank selection** — dynamically adjusts rank per layer based on gradient magnitude during training
- **Layer-wise freezing scheduler** — progressively freezes converged layers to redirect compute to under-trained parameters
- **Domain benchmark suite** — released evaluation suite covering legal, medical, and financial domains

## Takeaways

The conference provided excellent networking with teams from DeepMind, Meta FAIR, and several university labs working on similar efficiency problems. Led to two follow-up collaborations.
