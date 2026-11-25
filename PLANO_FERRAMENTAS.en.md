> 🇧🇷 [Portuguese version](PLANO_FERRAMENTAS.md) — the Portuguese plan is the default.

# Implementation Plan — OpenCode Tools for Relay

## Goal
Create a set of custom opencode tools that let AI agents interact with the Relay platform (tasks, board, comments, documents) without leaving the terminal.

---

## Checklist

### 1. Custom Tools (`.opencode/tools/relay.ts`)
| # | Tool | Description | Status |
|---|-----------|-----------|--------|
| 1.1 | `relay_listProjects` | Lists all projects | ✅ |
| 1.2 | `relay_board` | Queries the board (columns + tasks) | ✅ |
| 1.3 | `relay_getTask` | Details of a task | ✅ |
| 1.4 | `relay_listTasks` | Lists tasks with filters | ✅ |
| 1.5 | `relay_createTask` | Creates a task | ✅ |
| 1.6 | `relay_updateTask` | Edits task fields | ✅ |
| 1.7 | `relay_moveTask` | Moves a task between columns | ✅ |
| 1.8 | `relay_deleteTask` | Deletes a task | ✅ |
| 1.9 | `relay_addSubtask` | Adds a subtask (title only) | ✅ |
| 1.10 | `relay_addComment` | Posts a comment (code review, commits) | ✅ |
| 1.11 | `relay_getFlow` | Exports the task flow (mermaid) | ✅ |
| 1.12 | `relay_createDocument` | Creates a document (spec, plan, ADR) | ✅ |
| 1.13 | `relay_searchMemory` | Searches the workspace agentic memory | ✅ |
| 1.14 | `relay_remember` | Stores a memory (fact/decision/context) | ✅ |
| 1.15 | `relay_listMemory` | Lists workspace memories | ✅ |
| 1.16 | `relay_ingestMemory` | Ingests a task/comment/document into memory | ✅ |

### 2. Custom Commands (`.opencode/commands/`)
| # | Command | Description | Status |
|---|---------|-----------|--------|
| 2.1 | `/review` | Opens a prompt to do a code review of a task | ✅ |
| 2.2 | `/decompose` | Opens a prompt to decompose a task into subtasks | ✅ |

### 3. Skill (`.opencode/skills/relay-platform/`)
| # | Skill | Description | Status |
|---|-------|-----------|--------|
| 3.1 | SKILL.md | Instructs agents to use the platform automatically | ✅ |

### 4. Configuration
| # | Item | Description | Status |
|---|------|-----------|--------|
| 4.1 | Environment variables | `RELAY_API_URL` and `RELAY_API_KEY` | ✅ |
| 4.2 | opencode.jsonc | Project configuration | ✅ |

---

## How to Use

### Environment Variables
Configure them in your `opencode.jsonc` or export them in the terminal. The local Relay API runs on port **9777** (the code fallback is `http://localhost:5000/api`, the frozen web-client port):
```bash
export RELAY_API_URL=http://127.0.0.1:9777/api
export RELAY_API_KEY=            # optional — the local API does not require auth
```

### Usage Examples
```bash
# In the terminal with opencode:
"list the projects using relay_listProjects"
"show the board for the RELAY project"
"create a task in the RELAY backlog called 'Implement X'"
"add a code review comment on RELAY-10"
"decompose RELAY-42 into subtasks using /decompose"
```

---

## File Structure

```
.opencode/
├── tools/
│   └── relay.ts           # 16 custom tools
├── commands/
│   ├── review.md            # /review - code review
│   └── decompose.md         # /decompose - decompose tasks
└── skills/
    └── relay-platform/
        └── SKILL.md         # Platform usage skill
```
