# Dashboard & Navigation Spec

## Overview

When `clanka` launches, it opens a dedicated **Dashboard screen** instead of dropping straight into a single chat prompt. The application is organized as separate **screens** that the user navigates between on demand. Agent execution is decoupled from the currently displayed screen — opening or leaving a conversation never interrupts its agent; all background execution continues independently.

## Screens

| Screen | Purpose |
|--------|---------|
| **Dashboard** | Launch screen. Lists active chats. Create/open conversations. |
| **Individual Conversation** | Active chat session view. Stream messages, send input, see agent status. |
| **Archived Chats** | Dedicated screen for archived conversations. Not shown on Dashboard. Archive/restore actions available here. |
| **Statistics** | Read-only metrics about agents, sessions, token usage, jobs, etc. |

## Active Chats (Dashboard)

Each conversation row displays:

- **Chat title**
- **Last activity** (timestamp)
- **Current agent status** — one of: `Running`, `Waiting`, `Completed`, `Error`, `Idle`
- **User attention required** — boolean flag (e.g., agent is waiting on user input, or a tool confirmation is pending)

### Dashboard actions

- Navigate through the chat list (up/down or fuzzy find)
- Create a new conversation (`/chat new`)
- Open an existing conversation (enter/select)

## Archived Chats

- Separate, dedicated screen.
- Archived conversations **do not** appear on the Dashboard.
- User explicitly navigates to this screen to view them.
- Actions available: **archive** a conversation (move from active → archived), **restore** a conversation (move from archived → active).

## Navigation Rules

- Screens are switched on demand via slash commands or navigation keys.
- Opening a conversation does **not** pause or stop its agent.
- Leaving a conversation does **not** interrupt its agent.
- Background agent execution (including spawned child agents running in parallel) continues regardless of which screen is active.
- The user can be on the Statistics screen while agents run conversations in the background.

## Deferred Messages — `/btw` command

### Problem

When an agent is busy (running a tool call, streaming, or executing a spawned child), the user may want to send additional information without interrupting the current execution.

### Behavior

1. User types `/btw <message>` while an agent is busy.
2. The message is **enqueued** for that session/agent.
3. The message is **not** delivered to the agent immediately.
4. When the agent becomes available (idle, finished current tool/iteration), the enqueued messages are delivered **in original order** as if the user had typed them at that moment.
5. Queued messages are displayed **distinctly** from already-delivered messages (e.g., dimmed, marked as `queued`, or in a separate "pending" section).

### Example flow

```
> /btw also check the logs in /var/log/app.log
[queued] Message enqueued. Agent is busy. Will deliver when available.
[agent finishes current task]
[delivered] user: also check the logs in /var/log/app.log
```

## Technical implications

- **Agent execution must be backgrounded**: The REPL screen manager and agent run loop must be decoupled. Agents continue running even when the user is on a different screen.
- **Session status tracking**: Each session needs a status field (`Running`, `Waiting`, `Completed`, `Error`, `Idle`) and an `attentionRequired` flag.
- **Message queue per session**: A FIFO queue of deferred messages per session, flushed when the agent transitions to `Idle`.
- **Screen state machine**: The CLI needs a screen stack or active-screen pointer so navigation doesn't kill running agents.

## Related existing work

- `src/runtime.ts` — `AgentRuntimeImpl` already manages agents/sessions and spawn jobs. Status tracking and deferred message queues should be added here.
- `src/agent.ts` — `Agent.run()` needs to report status changes (running/waiting/idle/error) so the UI can reflect them.
- `src/cli.ts` — REPL helpers need screen-aware rendering (dashboard view vs chat view vs archive view).
