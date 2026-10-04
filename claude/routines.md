# End-of-Session Routine

Execute before finishing any working session.

1. **Documentation**
   Update any documentation affected by today's work.
   Only modify documentation that is now inaccurate.

2. **Architecture Decisions**
   If a design decision was made, create or update an ADR in `docs/architecture/`.
   Capture: decision, reasoning, alternatives, tradeoffs, risks.

3. **Project Memory**
   Append to `docs/project-memory/timeline.md`.
   Include: what happened, why, discoveries, assumptions, future implications.
   Never rewrite history.

4. **Technical Debt**
   Update `docs/specs/technical-debt.md`.
   Capture: shortcuts taken, TODOs, known limitations, refactor opportunities.

5. **Unanswered Questions**
   Append to `docs/project-memory/unanswered-questions.md`.
   These become future work items.

6. **Lessons Learned**
   Append to `docs/project-memory/lessons-learned.md`.
   Capture anything that would save a future engineer time.

7. **Tomorrow**
   Recommend the single highest-value task to begin the next session.
   Explain why.

## Workflow

Code -> Document -> Decide -> Discover -> Reflect -> Learn -> Plan, then loop.
