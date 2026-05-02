---
title: "Multi-Agent RAG System with LangGraph"
type: project
pubDatetime: 2026-01-10T00:00:00Z
description: "Production agentic RAG system using LangGraph for multi-step reasoning over enterprise knowledge bases. Handles 10K+ queries/day with sub-2s latency."
featured: true
tags: [rag, llm, agents, agentic-workflows, production]
tech: [Python, LangGraph, LangChain, Qdrant, GPT-4, Claude, FastAPI, MLflow]
role: "Lead AI Engineer"
status: active
highlights:
  - label: "Queries/Day"
    value: "10K+"
    icon: chart
  - label: "Accuracy"
    value: "94.2%"
    icon: target
  - label: "Latency p95"
    value: "<2s"
    icon: rocket
  - label: "Knowledge Sources"
    value: "50+"
    icon: database
links:
  - label: "Architecture Doc"
    url: "https://example.com"
organization: "Acme AI"
organizationUrl: "https://example.com"
image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80"
gallery:
  - src: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=600&q=80"
    caption: "Agent orchestration flow"
  - src: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80"
    caption: "Evaluation dashboard"
timeline:
  - date: "Jan 2026"
    title: "Architecture Design"
    description: "Designed multi-agent graph with specialized retriever, reasoner, and validator nodes"
  - date: "Feb 2026"
    title: "RAG Pipeline v1"
    description: "Hybrid search with dense embeddings + BM25 over Qdrant vector store"
  - date: "Mar 2026"
    title: "Agent Loop Optimization"
    description: "Added self-reflection and retry nodes — accuracy jumped from 82% to 94%"
  - date: "Present"
    title: "Production Deployment"
    description: "Serving 10K+ queries/day with streaming responses and citation grounding"
---

Built an end-to-end agentic RAG system that goes beyond simple retrieval — the LangGraph agent reasons over multiple sources, self-corrects, and provides grounded citations.

## Architecture

- **Retriever Agent** — hybrid search (dense + sparse) across Qdrant vector store
- **Reasoner Agent** — multi-step chain-of-thought with GPT-4 / Claude
- **Validator Agent** — fact-checks responses against source documents
- **Orchestrator** — LangGraph state machine managing agent handoffs and retries

## Key Decisions

- Chose LangGraph over vanilla LangChain for explicit control over agent state transitions
- Qdrant over Pinecone for self-hosted deployment and cost control
- Streaming responses via Server-Sent Events for perceived latency improvement

## Evaluation

Built a custom evaluation harness using RAGAS metrics — faithfulness, answer relevancy, and context precision tracked per-query in MLflow.
