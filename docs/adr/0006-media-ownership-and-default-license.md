# ADR-0006: Capture Media Ownership And Default License

Date: 2026-06-19  
Status: Accepted

## Context

Dictionary and folklore entries can include audio and photo uploads. Media ownership and reuse rights matter because approved entries become public.

## Decision

Contributor forms ask whether uploaded media is personally owned or produced by the contributor. When contributors indicate ownership but do not choose another license, the platform default is `CC BY-NC 4.0`.

## Alternatives Considered

- Require a license choice for every media upload.
- Hide licensing and only collect source text.
- Default all media to all rights reserved.

## Rationale

`CC BY-NC 4.0` is a balanced default for a cultural preservation platform: it supports non-commercial educational sharing while still requiring attribution.

## Consequences

- Reviewers should check source and ownership claims when media is important.
- Future policy may refine allowed licenses or require additional consent for sensitive materials.
