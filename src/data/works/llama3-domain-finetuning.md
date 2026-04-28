---
title: Domain-Specific Code Generation with Llama 3
type: project
pubDatetime: 2026-02-01T00:00:00Z
description: Fine-tuning Llama 3 on proprietary codebases for domain-specific code generation — internal APIs, conventions, and patterns the base model doesn't know.
tags: [fine-tuning, llm, code-gen, llama]
tech: [Unsloth, QLoRA, PyTorch, Weights & Biases, vLLM]
ongoing: true
status: active
links: []
---

Base LLMs generate generic code. When your team has internal SDKs, specific API patterns, and coding conventions, the model needs domain knowledge it was never trained on.

## Approach

- Curated training dataset from internal repos (~50K code samples with docstrings)
- QLoRA fine-tuning with Unsloth for memory-efficient training on a single A100
- Custom evaluation harness testing function correctness, API usage accuracy, and style compliance

## Results So Far

- 73% pass rate on internal API usage tests (vs 12% for base Llama 3)
- 3x faster inference with vLLM serving + speculative decoding
