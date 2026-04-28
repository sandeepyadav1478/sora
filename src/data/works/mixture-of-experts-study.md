---
title: "Exploring Mixture of Experts Architectures"
type: writing
pubDatetime: 2026-02-15T00:00:00Z
description: Research notes on Mixture of Experts — how sparse activation enables scaling model capacity without proportional compute, from Switch Transformer to Mixtral.
tags: [moe, architecture, llm, research]
tech: [PyTorch, Megablocks]
ongoing: true
links: []
---

MoE is how the industry is scaling LLMs beyond dense transformer limits. Studying the key architectures and implementation details.

## Reading List

- Switch Transformers (Fedus et al., 2021)
- ST-MoE (Zoph et al., 2022)
- Mixtral (Jiang et al., 2024)
- DeepSeek-MoE and fine-grained expert design

## Key Insights

- Expert load balancing is the critical implementation challenge
- Token-choice vs expert-choice routing has major throughput implications
- Sparse models need different serving infrastructure than dense models
