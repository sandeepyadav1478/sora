---
title: Agentic Pipelines, Code Gen & RAG Evaluation
type: building
pubDatetime: 2026-04-01T00:00:00Z
description: Three active projects at the intersection of LLM applications — multi-agent document processing, domain-adapted code generation, and systematic RAG quality measurement.
tags: [agents, fine-tuning, rag, llm]
tech: [LangGraph, Unsloth, QLoRA, vLLM, Python, Pinecone]
ongoing: true
status: active
links: []
---

## Multi-Agent Document Understanding

A supervisor agent routes documents to specialized sub-agents — layout parsing, entity extraction, cross-reference resolution, and fact validation. Each agent has access to different tools and retrieval sources, allowing the system to handle multi-modal documents (text + tables + figures) at scale.

## Domain-Specific Code Generation with Llama 3

Base LLMs generate generic code. Fine-tuning Llama 3 on ~50K internal code samples using QLoRA + Unsloth to teach it proprietary SDKs, API patterns, and coding conventions. Early results: 73% pass rate on internal API tests vs 12% for the base model.

## Open-Source RAG Evaluation Framework

Moving beyond vibes-based RAG evaluation. A CI-friendly framework measuring retrieval precision/recall, answer faithfulness, hallucination detection, and end-to-end correctness — works with any retriever and any LLM, tracks regressions over time.
