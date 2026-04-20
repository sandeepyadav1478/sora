---
title: "Production LLM Inference with vLLM"
type: writing
cardStyle: gradient
pubDatetime: 2025-12-05T00:00:00Z
description: "How we optimized LLM serving latency by 3x using vLLM's continuous batching, PagedAttention, and quantized model deployment."
tags: [inference, llm, optimization, deployment, performance]
tech: [vLLM, Python, CUDA, Docker, Kubernetes, NVIDIA A100]
links:
  - label: "Read Article"
    url: "https://example.com"
image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80"
---

A production postmortem on migrating from naive HuggingFace `pipeline()` inference to vLLM — and the 3x latency improvement that came with it.

## The Problem

Our Llama 3 8B model was serving at 800ms p95 with HuggingFace's default inference. At 500 concurrent users, GPU utilization was only 40% — most time was spent in memory allocation and batch scheduling.

## The Fix

- **vLLM's PagedAttention** — eliminated KV cache fragmentation, GPU memory utilization jumped to 90%+
- **Continuous batching** — no more waiting for the slowest request in a batch
- **AWQ quantization** — 4-bit quantized model with negligible quality loss, 2x throughput
- **Tensor parallelism** — split model across 2x A10G for headroom

## Results

| Metric | Before | After |
|---|---|---|
| p95 Latency | 800ms | 250ms |
| Throughput | 15 req/s | 48 req/s |
| GPU Utilization | 40% | 92% |
| Cost/1K requests | $0.12 | $0.04 |

## Takeaway

vLLM is production-ready. The continuous batching alone is worth the migration. If you're still using `transformers.pipeline()` for serving, you're leaving 3x performance on the table.
