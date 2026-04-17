---
title: "The Art of Testing Untestable Code"
type: talk
pubDatetime: 2025-04-12T00:00:00Z
description: "Conference talk on practical strategies for adding tests to legacy codebases without rewriting everything."
tags: [testing, python, conference, legacy-code]
links:
  - label: "Slides"
    url: "https://speakerdeck.com/johndoe"
  - label: "Video"
    url: "https://youtube.com"
organization: "PyCon US 2025"
image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80"
---

Presented at PyCon US 2025 to an audience of 400+ developers on strategies for testing legacy Python codebases.

## Abstract

Most testing advice assumes you're starting fresh. But what about the 500k-line codebase with zero tests and deadlines next week? This talk covers battle-tested strategies for incrementally adding tests to code that was never designed to be testable.

## Topics Covered

- **The Seam Model** — finding insertion points for tests without refactoring
- **Characterization tests** — capturing current behavior before changing anything
- **Dependency breaking techniques** — Extract & Override, Parameterize Constructor
- **The strangler fig pattern** — wrapping legacy modules with testable interfaces
- **Measuring progress** — meaningful metrics beyond code coverage percentage

## Audience Response

- 400+ attendees
- 4.7/5 average rating
- Follow-up workshop requested for PyCon 2026
