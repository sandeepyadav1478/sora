---
title: "embed-cache — Persistent Embedding Cache"
type: oss
cardStyle: borderless
pubDatetime: 2025-07-12T00:00:00Z
description: "Python library that caches OpenAI/Cohere embedding API calls to SQLite, cutting costs by 80% for iterative RAG development."
tags: [embeddings, cache, rag, open-source, developer-tools]
tech: [Python, SQLite, OpenAI, Cohere, NumPy]
status: active
links:
  - label: "PyPI"
    url: "https://pypi.org/project/embed-cache/"
  - label: "Source Code"
    url: "https://github.com/example/embed-cache"
---

A zero-config embedding cache that sits between your code and the embedding API. Every embedding is stored in a local SQLite database — identical inputs return cached results instantly.

## Why

During RAG development, you re-embed the same documents hundreds of times while iterating on chunking strategies, metadata, and retrieval logic. Each call costs money and adds latency.

## Usage

```python
from embed_cache import CachedEmbeddings

embedder = CachedEmbeddings(model="text-embedding-3-small")
vectors = embedder.embed(["document chunk 1", "document chunk 2"])
# Second call: instant, free
vectors = embedder.embed(["document chunk 1", "document chunk 2"])
```

## Features

- Drop-in replacement for OpenAI and Cohere embedding clients
- SQLite backend — no infrastructure needed
- Cache hit rate tracking and cost savings reporting
- TTL support for cache invalidation
