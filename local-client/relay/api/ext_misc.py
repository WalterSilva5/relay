"""Misc parity gaps for the Electron shell (goals progress + unassigned TODOs).

Companion router for ``relay.api.app``. It only adds the endpoints the
PySide GUI reads straight from SQLite and that ``app.py`` does not expose
yet. Everything already covered there is intentionally NOT duplicated.

The integrator owns ``app.include_router(router)``; this module only
declares ``router = APIRouter()`` with final ``/api/...`` paths.

New endpoints
-------------
- ``GET /api/goals/{goal_id}/progress`` — lightweight goal progress
  (``{done, total, pct}``). ``app.py`` only exposes progress embedded in
  ``GET /api/goals/{goal_id}`` / ``GET /api/projects/{id}/goals`` via
  ``_goal_dict`` (``_goal_progress``); there is no dedicated ``/progress``
  sub-resource, so this endpoint is new (no duplication). Same filter
  rule as ``app._goal_progress`` (which mirrors
  ``gui/views/goals_view._progresso``): tasks of the goal's project,
  excluding deleted/archived, filtered by the goal's tag/epic/sprint,
  excluding local-only tasks (``is_local``); done = task in an
  ``is_done`` column. Note: the GUI ``_progresso`` does NOT exclude
  ``is_local`` while ``app._goal_progress`` does — this endpoint follows
  the backend rule (``app._goal_progress``), the canonical one.
- ``GET /api/todos/unassigned`` — TODOs with ``project_id IS NULL``,
  same item shape and ordering as ``GET /api/todos`` (``_todo_dict``:
  ``order_by(done, sort_order, id)``). ``app.py`` has no such filter
  (``GET /api/todos`` only accepts an explicit ``?projectId=`` value,
  which cannot express NULL), so this endpoint is new; the existing
  endpoint is left untouched.

Reused from app.py (NOT duplicated here)
----------------------------------------
Goals CRUD + embedded ``progress`` dict, TODOs list/create/update/snooze/
delete + ``/api/todos/pending``, ``GET /api/projects/metrics`` and the
``/api/metrics/detail`` router (``ext_insights``).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from relay.db.models import (
    Epic,
    Goal,
    Label,
    Task,
    Todo,
    get_session,
)

router = APIRouter()


def db():
    """Yield a workspace DB session (same pattern as ``api.app.db``)."""
    session = get_session()
    try:
        yield session
    finally:
        session.close()


def _todo_dict(t: Todo) -> dict:
    """Same shape as ``api.app._todo_dict``."""
    return {
        "id": t.id,
        "text": t.text,
        "done": t.done,
        "sortOrder": t.sort_order,
        "priority": t.priority or "MEDIUM",
        "notes": t.notes,
        "recurrence": t.recurrence or "NONE",
        "dueAt": t.due_at.isoformat() if t.due_at else None,
        "snoozedUntil": t.snoozed_until.isoformat() if t.snoozed_until else None,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "completedAt": t.completed_at.isoformat() if t.completed_at else None,
        "projectId": t.project_id,
        "tags": t.tags or "",
    }


def _goal_progress(s: Session, goal: Goal) -> dict:
    """Same rule as ``api.app._goal_progress``: project tasks (not
    deleted/archived), filtered by the goal's tag/epic/sprint, excluding
    local-only tasks; done = task in an ``is_done`` column."""
    q = s.query(Task).filter(
        Task.project_id == goal.project_id,
        Task.deleted_at.is_(None),
        Task.archived_at.is_(None),
    )
    if goal.tag:
        q = q.filter(Task.labels.any(Label.name == goal.tag))
    if goal.epic_id:
        q = q.filter(Task.epics.any(Epic.id == goal.epic_id))
    if goal.sprint_id:
        q = q.filter(Task.sprint_id == goal.sprint_id)
    tasks = [t for t in q.all() if not t.is_local]
    done = [t for t in tasks if t.column is not None and t.column.is_done]
    pct = round(len(done) / len(tasks) * 100) if tasks else 0
    return {"done": len(done), "total": len(tasks), "pct": pct}


@router.get("/api/goals/{goal_id}/progress")
def goal_progress(goal_id: int, s: Session = Depends(db)):
    """Lightweight progress for one goal (``{done, total, pct}``)."""
    goal = s.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    return _goal_progress(s, goal)


@router.get("/api/todos/unassigned")
def unassigned_todos(s: Session = Depends(db)):
    """TODOs without a project (``project_id IS NULL``).

    Same item shape and ordering as ``GET /api/todos``.
    """
    todos = (
        s.query(Todo)
        .filter(Todo.project_id.is_(None))
        .order_by(Todo.done, Todo.sort_order, Todo.id)
        .all()
    )
    return [_todo_dict(t) for t in todos]
