---
title: "Understanding Raft Consensus — From Paper to Implementation"
type: writing
pubDatetime: 2024-12-20T00:00:00Z
description: "A walkthrough of implementing the Raft consensus algorithm in Go, with visualizations and gotchas."
tags: [distributed-systems, go, raft, tutorial]
links:
  - label: "Read Article"
    url: "https://dev.to/johndoe"
  - label: "Source Code"
    url: "https://github.com/johndoe/raft-go"
image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80"
---

A comprehensive guide to the Raft consensus algorithm — the foundation of systems like etcd, CockroachDB, and Consul.

## What You'll Learn

- Leader election and term management
- Log replication and commitment
- Handling network partitions gracefully
- Snapshot and log compaction

## The Implementation

Built a working Raft implementation in ~1500 lines of Go:

```go
type RaftNode struct {
    mu          sync.Mutex
    id          int
    currentTerm int
    votedFor    int
    log         []LogEntry
    commitIndex int
    state       NodeState // follower, candidate, leader
}
```

## Key Gotchas

1. **Election timeouts must be randomized** — otherwise nodes oscillate between candidates forever
2. **Log matching is subtle** — the leader must find the correct point of divergence for each follower
3. **Linearizability requires read leases** — naive leader reads can return stale data during partitions

> "Raft is designed for understandability" — and yet implementing it correctly took me 3 attempts.
