# Prompt: Architecture Review

Review the overall architecture of this project.

Cover:
- extension seams and whether they are in the right places
- coupling that will be expensive to unwind
- scalability concerns at 10x current load
- observability gaps
- security exposure

For each finding use: Problem -> Current State -> Options Considered ->
Recommendation -> Tradeoffs -> Risks -> Future Evolution.

Do not propose a rewrite unless no extension seam can carry the change.
