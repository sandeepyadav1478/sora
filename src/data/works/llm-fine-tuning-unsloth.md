---
title: "Domain-Specific LLM Fine-Tuning with Unsloth"
type: project
pubDatetime: 2025-11-20T00:00:00Z
description: "Fine-tuned Llama 3 and Mistral models for domain-specific tasks using Unsloth + QLoRA, achieving 40% faster training with 60% less VRAM."
featured: true
tags: [fine-tuning, llm, parameter-efficient, model-training, optimization]
tech: [PyTorch, Unsloth, PEFT, QLoRA, Hugging Face, Weights & Biases, GGUF, vLLM, Llama, Mistral]
role: "AI Engineer"
status: maintained
highlights:
  - label: "Training Speedup"
    value: "40%"
  - label: "VRAM Savings"
    value: "60%"
  - label: "Models Shipped"
    value: "3"
links:
  - label: "Training Notebooks"
    url: "https://example.com"
organization: "Acme AI"
organizationUrl: "https://example.com"
image: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80"
---

Fine-tuned open-weight LLMs for enterprise use cases — legal document summarization, code review, and customer support triage.

## Approach

- **Base Models** — Llama 3 8B, Mistral 7B, Phi-3 Mini
- **Method** — QLoRA (4-bit quantization + Low-Rank Adaptation) via Unsloth
- **Data** — curated instruction datasets (5K-20K examples per domain)
- **Evaluation** — custom benchmarks + human preference ranking

## Why Unsloth

Unsloth's fused kernels and memory optimizations let us fine-tune 8B models on a single A100 in under 2 hours — compared to 5+ hours with vanilla PEFT. The 4-bit training path kept VRAM under 24GB.

## Results

| Model | Task | Accuracy | vs Base |
|---|---|---|---|
| Llama 3 8B | Legal Summarization | 91.3% | +18.7% |
| Mistral 7B | Code Review | 87.5% | +22.1% |
| Phi-3 Mini | Support Triage | 94.0% | +15.3% |

## Deployment

Models exported to GGUF format for llama.cpp inference and served via vLLM behind a FastAPI gateway with streaming support.
