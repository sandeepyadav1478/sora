---
title: "DeepAgents — Multi-Agent Orchestration Research"
type: oss
pubDatetime: 2026-02-01T00:00:00Z
description: "Contributing to DeepAgents, a framework for building hierarchical multi-agent systems with planning, tool use, and memory."
tags: [deepagents, multi-agent, llm, agents, research, python]
role: "Contributor"
status: active
links:
  - label: "Repository"
    url: "https://github.com/example/deepagents"
image: "https://images.unsplash.com/photo-1676299081847-824916de030a?w=800&q=80"
---

Contributing to DeepAgents, a research framework exploring how multiple LLM-powered agents can collaborate on complex tasks through hierarchical planning and shared memory.

## Contributions

- **Memory module** — implemented persistent vector memory for cross-session agent context
- **Tool registry** — built a dynamic tool discovery and registration system
- **Evaluation harness** — added benchmarks for multi-agent task completion on SWE-bench

## Research Questions

- How do agents decompose ambiguous tasks into sub-plans?
- When should agents delegate vs. execute directly?
- What memory architectures minimize hallucination in long-horizon tasks?

## Learnings

The biggest insight: agent reliability scales better with structured state machines (like LangGraph) than with pure prompt-driven autonomy. Explicit control flow + LLM reasoning at decision nodes beats end-to-end agent prompting.
