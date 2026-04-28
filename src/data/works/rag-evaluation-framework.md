---
title: Open-Source RAG Evaluation Framework
type: oss
pubDatetime: 2026-01-10T00:00:00Z
description: Building an open-source framework to systematically evaluate RAG pipeline quality — retrieval relevance, answer faithfulness, and end-to-end correctness.
tags: [rag, evaluation, open-source, llm]
tech: [Python, RAGAS, LangSmith, pytest, DuckDB]
ongoing: true
status: active
links: []
---

Most RAG pipelines are evaluated vibes-only. This framework brings structured, repeatable evaluation to retrieval-augmented generation.

## What It Measures

- **Retrieval quality** — precision, recall, and MRR of retrieved chunks
- **Answer faithfulness** — does the answer actually follow from the retrieved context?
- **Hallucination detection** — claims in the answer that aren't grounded in any source
- **End-to-end correctness** — compared against golden test sets

## Design Principles

- Works with any retriever and any LLM
- CI-friendly — runs as part of your test suite
- Tracks metrics over time to catch regressions
