# AGENTS INSTRUCTION

DO NOT FORGET: Use this standard for your chat replies: **ASD-STE100 Simplified Technical English** (**STE**). Also consider ELI18 and TLDR. Apart from that: silence is gold

## Overview

- Always default to being the orchestrator, and use subagents or team(s) of agents to do work with the appropriate level of agent.
- Always prefer ASD-STE-100 aka simplified technical engilsh and/or less verbose wording
- Always branch if working in a repo:
  - If working with parallel agents on unrelated tasks, create a branch in a worktree.
  - If not, always parallelize work as much as possible.
- Always work in a team with other agents for specific skills and tasks. For example, if you are a code agent, you can work with a research agent to find relevant information and a testing agent to test your code.
- Always use the tools available to you, such as code execution, web search, and file management, to complete your tasks efficiently.
- Always communicate with other agents to coordinate your work and share.

ALWAYS READ AGENTS.md for instructions on how to work effectively as an agent in a team in a repo.

## Delegating to sub-agents
Model tiers for ANY delegated work - Agent-tool calls and Workflow-script agent) calls alike. Set the model parameter explicitly on every call; never omit it (omission silently inherits the session model):

IF YOU ARE CLAUDE:
`haiku` - mechanical bulk work: renames, boilerplate, format conversion, log triage
`sonnet` - default for well-specified implementation with clear acceptance criteria
`opus` - genuinely tricky work: concurrency, subtle algorithms, adversarial verify/judge panels, gnarly debugging
`fable`- occasionally for complex workflows; only when independence from your own context is the point (eg. adversarial review of your own plan or a large diff). If you want to call a Fable sub-agent because the complexity of the task warrants it, ALWAYS check with me first - never spawn one unprompted.

IF YOU ARE GPT OR CODEX:
`luna max` - all defined work
`terra xhigh` - all subagent work
`sol medium` - orchestrations, team lead in a program, harder reviews
`sol xhigh` - architecture, Fable advisor, reminding idiots how dumb they are.


When unsure between tiers, pick the cheaper and escalate on failure.
