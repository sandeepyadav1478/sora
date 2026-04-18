---
title: "Evaluating RAG Systems — Beyond Vibes"
type: talk
pubDatetime: 2025-10-18T00:00:00Z
description: "Conference talk on systematic RAG evaluation using RAGAS metrics, human preference ranking, and automated regression testing."
tags: [rag, evaluation, llm, ragas, testing, conference]
organization: "AI Engineer Summit"
organizationUrl: "https://example.com"
image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80"
---

Most RAG systems are evaluated by "vibes" — someone reads a few outputs and says "looks good." This talk presents a systematic evaluation framework used in production.

## Key Points

- **RAGAS metrics** — faithfulness, answer relevancy, context precision, context recall
- **Human preference ranking** — A/B testing with domain experts using blind evaluation
- **Regression testing** — golden dataset of 200+ question-answer pairs, run on every deployment
- **Failure taxonomy** — categorizing RAG failures (retrieval miss, context overflow, hallucination, wrong attribution)

## The Framework

1. Build a golden dataset with verified answers and source citations
2. Run RAGAS metrics on every PR that touches the RAG pipeline
3. Flag regressions >2% on any metric for human review
4. Weekly manual evaluation of edge cases and new failure modes

## Audience

AI Engineers building production RAG systems who want to move beyond "it seems to work" to measurable, tracked quality.
