---
title: "LangChain AI Agents Hackathon — 2nd Place"
type: hackathon
cardStyle: glass
pubDatetime: 2024-09-15T00:00:00Z
description: "Built an autonomous code review agent in 48 hours that analyzes PRs, suggests fixes, and auto-generates test cases. Won 2nd place out of 200+ teams."
featured: true
tags: [agents, llm-apps, community]
tech: [LangGraph, GPT-4, GitHub API, FastAPI, Redis, Docker]
organization: "LangChain"
organizationUrl: "https://langchain.com"
role: "Team Lead"
links:
  - label: "Project Repo"
    url: "https://github.com/example/code-review-agent"
  - label: "Demo Video"
    url: "https://youtube.com/watch?v=example"
highlights:
  - label: "Placement"
    value: "2nd / 200+"
    icon: award
  - label: "Duration"
    value: "48 hrs"
    icon: clock
  - label: "Team Size"
    value: "3"
    icon: users
  - label: "Prize"
    value: "$5,000"
    icon: star
timeline:
  - date: "Day 1 — Morning"
    title: "Ideation & architecture"
    description: "Settled on multi-agent code review system with specialized sub-agents"
  - date: "Day 1 — Evening"
    title: "Core agent pipeline"
    description: "Built LangGraph workflow with code analysis, fix suggestion, and test generation nodes"
  - date: "Day 2 — Morning"
    title: "GitHub integration & UI"
    description: "Connected to GitHub webhooks, built review dashboard"
  - date: "Day 2 — Evening"
    title: "Demo & judging"
    description: "Live demo on real open-source PRs, judges impressed by test generation quality"
---

## The Challenge

Build an AI agent that solves a real developer workflow problem. Judged on innovation, technical execution, and practical usefulness.

## Our Approach

We built **ReviewBot** — a multi-agent system that:

1. **Analyzes PR diffs** — understands code changes in context of the full repository
2. **Identifies issues** — security vulnerabilities, performance problems, style violations
3. **Suggests fixes** — generates corrected code with explanations
4. **Writes tests** — auto-generates unit tests covering the changed code paths

## Architecture

The system uses a LangGraph state machine with four specialized agents:
- **Analyst** — parses diffs and builds dependency graphs
- **Reviewer** — identifies potential issues using RAG over best practices
- **Fixer** — generates code suggestions using few-shot examples
- **Tester** — creates test cases using mutation testing principles

## What I Learned

Building under pressure forces you to make ruthless scope decisions. We cut three planned features on Day 1 evening to focus on making the core flow bulletproof — that focus is what won us the judges.
