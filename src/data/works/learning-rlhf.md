---
title: "Deep Dive: RLHF & Alignment Techniques"
type: writing
pubDatetime: 2026-03-01T00:00:00Z
description: Studying reinforcement learning from human feedback — from reward modeling to PPO and DPO, understanding how modern LLMs are aligned to human preferences.
tags: [rlhf, alignment, llm, research]
tech: [PyTorch, TRL, DeepSpeed]
ongoing: true
links: []
---

Documenting my learning journey through RLHF and alignment techniques. Covering the full pipeline from preference data collection to reward model training to policy optimization.

## Topics Covered

- Reward modeling from pairwise human preferences
- PPO vs DPO — tradeoffs in practice
- Constitutional AI and self-supervised alignment
- Open questions: reward hacking, goodharting, scalable oversight

## Key Takeaways So Far

DPO is simpler and more stable than PPO for most use cases, but PPO gives more fine-grained control when you need it. The real bottleneck is always preference data quality.
