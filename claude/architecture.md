# Architecture Guidance

Before implementing any significant feature, review the architecture.

Identify:

- extension seams
- coupling
- upgrade risks
- scalability concerns
- observability
- security

Prefer extending existing boundaries over modifying the core.
Only recommend core changes when no suitable extension seam exists.

Every recommendation should include, in order:

Problem -> Current State -> Options Considered -> Recommendation ->
Tradeoffs -> Risks -> Future Evolution
