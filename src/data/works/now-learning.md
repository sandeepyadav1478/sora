---
title: RLHF, Sparse MoE & Rust for Inference
type: learning
pubDatetime: 2026-04-01T00:00:00Z
description: Deepening expertise in three areas — alignment techniques for LLMs, sparse Mixture of Experts scaling, and systems-level inference serving with Rust.
tags: [rlhf, moe, rust, research]
tech: [PyTorch, TRL, DeepSpeed, Megablocks, Tokio, ONNX Runtime]
ongoing: true
status: active
links: []
---

## Reinforcement Learning from Human Feedback

Studying the full alignment pipeline — reward modeling from pairwise preferences, PPO vs DPO tradeoffs, constitutional AI, and open problems around reward hacking and scalable oversight. DPO is simpler and more stable for most cases, but PPO gives finer control. The real bottleneck is always preference data quality.

## Mixture of Experts Architectures

How sparse activation scales model capacity without proportional compute cost. Working through Switch Transformers, ST-MoE, Mixtral, and DeepSeek-MoE. Key insight: expert load balancing is the critical implementation challenge, and sparse models need fundamentally different serving infrastructure.

## Rust for High-Performance Inference

Python is ML's lingua franca, but inference serving is a systems problem. Building lightweight servers with Tokio async runtime, ONNX Runtime Rust bindings, and zero-copy tensor handling — targeting sub-millisecond overhead where Python's GIL is the bottleneck.
