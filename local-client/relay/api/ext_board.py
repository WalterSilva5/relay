"""Board/flow HTTP coverage for the Electron shell.

The desktop GUI talks to SQLite directly in several board/flow spots that
had no HTTP equivalent. This module closes exactly those gaps — everything
else in the BOARD/FLUXO scope already exists in ``relay.api.app`` and is
reused as-is (see the report at the bottom of this docstring).

Mount (done once by the integrator, NOT here)::

    from relay.api.ext_board import router
    app.include_router(router)

New endpoints
-------------
- ``GET /api/projects/{project_id}/tasks/search`` — task search with the
  filters the GUI FilterBar applies client-side (epic, sprint/backlog,
  column, unassigned) that ``GET /api/tasks`` does not offer.
- ``POST /api/tasks/{code}/move-next`` — quick-move ("Mover ->" button):
  advance the card to the next column, enforcing the same entry gates as
  ``POST /api/tasks/{code}/move``.
- ``GET /api/projects/{project_id}/activity`` — project-scoped activity
  feed (``ActivityLog`` has no project column, so ``GET /api/activity``
  cannot answer "what moved here recently").
- ``GET /api/projects/{project_id}/assignees`` — assignable people: project
  members plus legacy free-text assignees found on cards, with open-task
  counts (drives the assignee combo and the "Responsavel" filter).

Reused from app.py (NOT duplicated here)
----------------------------------------
board (``GET /api/projects/{id}/board``), columns CRUD + reorder +
template, move (with code-review gate), task CRUD + archive/unarchive +
archived list, checklist create/toggle/delete, dependencies add/remove,
flow, context, history, changelog, comments CRUD, members list (with
stats)/create/delete, sprints CRUD + complete + retrospectives + retro
actions, epics CRUD + attach/detach, project links CRUD + reorder,
global activity feed. WIP alerts are derived client-side from the board
payload (columns carry ``wipLimit`` + their tasks).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from relay.db.models import (
    ActivityLog,
    BoardColumn,
    Comment,
    Epic,
    Evidence,
    GateRule,
    Member,
    ParityResult,
    Project,
    Task,
    get_session,
    task_epics,
    task_labels,
)

router = APIRouter()

# Column names that require a CODE_REVIEW comment before a card may enter,
# mirroring ColumnWidget.dropEvent in the desktop GUI.
REVIEW_COLUMN_NAMES = {"revisao", "revisão", "review"}


def get_db():
    session = get_session()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Serializers (local copies of the app.py shapes; ext_board must not import
# relay.api.app to avoid a circular import once the integrator includes this
# router into the main app).
# ---------------------------------------------------------------------------


def _brief(t: Task) -> dict:
    return {
        "id": t.id,
        "code": t.code,
        "number": t.number,
        "title": t.title,
        "type": t.type,
        "priority": t.priority,
        "status": t.status,
        "columnId": t.column_id,
        "estimateMd": t.estimate_md,
        "dueDate": t.due_date.isoformat() if t.due_date else None,
        "assignee": t.assignee,
        "requiresHuman": t.requires_human or False,
        "isLocal": bool(t.is_local),
        "parentId": t.parent_id,
        "sprintId": t.sprint_id,
        "doneAt": t.done_at.isoformat() if t.done_at else None,
        "archivedAt": t.archived_at.isoformat() if t.archived_at else None,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
        "labels": [{"id": lb.id, "name": lb.name, "color": lb.color} for lb in t.labels],
        "epics": [{"id": e.id, "name": e.name, "color": e.color} for e in t.epics],
    }


def _full(t: Task) -> dict:
    d = _brief(t)
    d.update(
        {
            "description": t.description,
            "objective": t.objective,
            "acceptance": t.acceptance,
            "rank": t.rank,
            "projectId": t.project_id,
            "projectKey": t.project.key if t.project else None,
            "checklist": [
                {
                    "id": c.id,
                    "title": c.title,
                    "checked": c.checked,
                    "sortOrder": c.sort_order,
                }
                for c in t.checklist
            ],
            "blockedBy": [
                {
                    "id": dep.id,
                    "taskId": dep.blocker.id,
                    "code": dep.blocker.code,
                    "title": dep.blocker.title,
                    "status": dep.blocker.status,
                }
                for dep in t.blocked_by
            ],
            "blocking": [
                {
                    "id": dep.id,
                    "taskId": dep.blocked.id,
                    "code": dep.blocked.code,
                    "title": dep.blocked.title,
                    "status": dep.blocked.status,
                }
                for dep in t.blocking
            ],
            "subtasks": [_brief(s) for s in t.subtasks if s.deleted_at is None],
        }
    )
    return d


def _activity_dict(a: ActivityLog, task_code: Optional[str] = None) -> dict:
    return {
        "id": a.id,
        "entityType": a.entity_type,
        "entityId": a.entity_id,
        "action": a.action,
        "detail": a.detail,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
        "taskCode": task_code,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_task(code_or_id: str, s: Session) -> Task:
    """Same resolution as app._resolve_task: 'KEY-N' code or numeric id."""
    if "-" in code_or_id:
        parts = code_or_id.rsplit("-", 1)
        if len(parts) == 2 and parts[1].isdigit():
            task = (
                s.query(Task)
                .join(Project)
                .filter(
                    Project.key == parts[0],
                    Task.number == int(parts[1]),
                    Task.deleted_at.is_(None),
                )
                .first()
            )
            if task:
                return task
    if code_or_id.isdigit():
        task = (
            s.query(Task)
            .filter(Task.id == int(code_or_id), Task.deleted_at.is_(None))
            .first()
        )
        if task:
            return task
    raise HTTPException(status_code=404, detail=f"Task '{code_or_id}' not found")


def _gate_missing(task: Task, dest: BoardColumn, s: Session) -> list[str]:
    """Entry gates for the destination column.

    Mirrors the desktop GUI rule (a review column requires a CODE_REVIEW
    comment) plus any GateRule rows configured for the column, with the same
    semantics as app._check_gate but without rule seeding (seeding stays in
    app.py, triggered by the main move endpoint).
    """
    missing: list[str] = []
    if dest.name.strip().lower() in REVIEW_COLUMN_NAMES:
        has_review = (
            s.query(Comment)
            .filter(Comment.task_id == task.id, Comment.type == "CODE_REVIEW")
            .first()
        )
        if not has_review:
            missing.append("CODE_REVIEW")
    rule = (
        s.query(GateRule)
        .filter(GateRule.project_id == task.project_id, GateRule.column_id == dest.id)
        .first()
    )
    if rule is None:
        return missing
    if rule.require_evidence:
        evs = s.query(Evidence).filter(Evidence.task_id == task.id).all()
        if len(evs) < (rule.min_evidence or 1):
            missing.append("EVIDENCIA")
        elif rule.required_evidence_kinds:
            required = {
                k.strip().upper()
                for k in rule.required_evidence_kinds.split(",")
                if k.strip()
            }
            if not required.issubset({e.kind.upper() for e in evs}):
                missing.append("EVIDENCIA_KIND")
    if rule.require_parity or rule.forbidden_parity:
        pars = s.query(ParityResult).filter(ParityResult.task_id == task.id).all()
        forb = (rule.forbidden_parity or "").upper()
        if forb and any(p.status.upper() == forb for p in pars):
            missing.append("PARITY_FIEL")
        elif rule.require_parity and not any(
            p.status.upper() == "FIEL" for p in pars
        ):
            missing.append("PARITY_FIEL")
    if rule.require_comment_type:
        has = (
            s.query(Comment)
            .filter(
                Comment.task_id == task.id,
                Comment.type == rule.require_comment_type,
            )
            .first()
        )
        if not has:
            missing.append(rule.require_comment_type)
    return missing


# ---------------------------------------------------------------------------
# 1. Task search with board filters
# ---------------------------------------------------------------------------


@router.get("/api/projects/{project_id}/tasks/search")
def search_tasks(
    project_id: int,
    epicId: Optional[int] = None,
    sprintId: Optional[int] = None,
    noSprint: bool = False,
    columnId: Optional[int] = None,
    assignee: Optional[str] = None,
    unassigned: bool = False,
    type: Optional[str] = None,  # noqa: A002 - matches the app.py query style
    priority: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    labelId: Optional[int] = None,
    includeArchived: bool = False,
    limit: int = Query(default=200, le=1000),
    s: Session = Depends(get_db),
):
    """Search project tasks with the filters the GUI FilterBar applies.

    ``GET /api/tasks`` has no epic/sprint/column/unassigned filters; the
    desktop GUI applies them client-side over the board payload. The Electron
    shell gets them server-side here.
    """
    if not s.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "Project not found")
    if sprintId is not None and noSprint:
        raise HTTPException(400, "sprintId and noSprint are mutually exclusive")

    q = s.query(Task).filter(
        Task.project_id == project_id, Task.deleted_at.is_(None)
    )
    if not includeArchived:
        q = q.filter(Task.archived_at.is_(None))
    if epicId is not None:
        q = q.join(task_epics, task_epics.c.task_id == Task.id).filter(
            task_epics.c.epic_id == epicId
        )
    if sprintId is not None:
        q = q.filter(Task.sprint_id == sprintId)
    if noSprint:
        q = q.filter(Task.sprint_id.is_(None))
    if columnId is not None:
        q = q.filter(Task.column_id == columnId)
    if unassigned:
        q = q.filter(or_(Task.assignee.is_(None), Task.assignee == ""))
    elif assignee:
        q = q.filter(Task.assignee == assignee)
    if type:
        q = q.filter(Task.type == type)
    if priority:
        q = q.filter(Task.priority == priority)
    if status:
        q = q.join(BoardColumn, BoardColumn.id == Task.column_id).filter(
            BoardColumn.name == status
        )
    if labelId is not None:
        q = q.join(task_labels, task_labels.c.task_id == Task.id).filter(
            task_labels.c.label_id == labelId
        )
    if search:
        pattern = f"%{search}%"
        q = q.filter(Task.title.ilike(pattern) | Task.description.ilike(pattern))
    tasks = q.order_by(Task.created_at.desc()).limit(limit).all()
    return [_brief(t) for t in tasks]


# ---------------------------------------------------------------------------
# 2. Quick-move to the next column
# ---------------------------------------------------------------------------


@router.post("/api/tasks/{code}/move-next")
def move_task_next(code: str, s: Session = Depends(get_db)):
    """Advance a card to the next column (the GUI "Mover ->" quick-move).

    409 when the card is already in the last column; 422 (with the missing
    requirements, like the main move endpoint) when the next column has an
    entry gate — e.g. a review column without a CODE_REVIEW comment.
    """
    task = _resolve_task(code, s)
    old_col = task.column
    cols = (
        s.query(BoardColumn)
        .filter(BoardColumn.project_id == task.project_id)
        .order_by(BoardColumn.order)
        .all()
    )
    if not cols:
        raise HTTPException(500, "Project has no columns")
    try:
        idx = next(i for i, c in enumerate(cols) if c.id == task.column_id)
    except StopIteration:
        idx = -1
    if idx + 1 >= len(cols):
        raise HTTPException(409, "Task is already in the last column")
    dest = cols[idx + 1]
    missing = _gate_missing(task, dest, s)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "missing": missing,
                "message": f"{dest.name} requires: {', '.join(missing)}",
            },
        )
    task.column_id = dest.id
    task.updated_at = datetime.utcnow()
    if dest.is_done:
        if task.done_at is None:
            task.done_at = datetime.utcnow()
    else:
        task.done_at = None
    s.add(
        ActivityLog(
            entity_type="task",
            entity_id=task.id,
            action="moved",
            detail=f"{old_col.name if old_col else '?'} -> {dest.name}",
        )
    )
    s.commit()
    s.refresh(task)
    return _full(task)


# ---------------------------------------------------------------------------
# 3. Project-scoped activity feed
# ---------------------------------------------------------------------------


@router.get("/api/projects/{project_id}/activity")
def project_activity(
    project_id: int,
    limit: int = Query(default=50, le=200),
    s: Session = Depends(get_db),
):
    """Recent board/flow activity for one project (moves, comments, ...).

    ``GET /api/activity`` cannot scope by project because ``ActivityLog``
    carries no project column; this endpoint joins through the project's
    tasks and their comments.
    """
    if not s.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "Project not found")
    task_ids = [
        t.id
        for t in s.query(Task.id)
        .filter(Task.project_id == project_id)
        .all()
    ]
    if not task_ids:
        return []
    comment_ids = [
        c.id
        for c in s.query(Comment.id)
        .filter(Comment.task_id.in_(task_ids))
        .all()
    ]
    entries = (
        s.query(ActivityLog)
        .filter(
            or_(
                (ActivityLog.entity_type == "task")
                & (ActivityLog.entity_id.in_(task_ids)),
                (ActivityLog.entity_type == "comment")
                & (ActivityLog.entity_id.in_(comment_ids or [-1])),
            )
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    codes = {
        t.id: t.code
        for t in s.query(Task).filter(Task.id.in_(task_ids)).all()
    }
    comments_task = {}
    if comment_ids:
        for c in s.query(Comment).filter(Comment.id.in_(comment_ids)).all():
            comments_task[c.id] = c.task_id
    out = []
    for a in entries:
        code = codes.get(a.entity_id) if a.entity_type == "task" else None
        if code is None and a.entity_type == "comment":
            code = codes.get(comments_task.get(a.entity_id))
        out.append(_activity_dict(a, code))
    return out


# ---------------------------------------------------------------------------
# 4. Assignable people
# ---------------------------------------------------------------------------


@router.get("/api/projects/{project_id}/assignees")
def project_assignees(project_id: int, s: Session = Depends(get_db)):
    """People assignable to cards: members plus legacy names on cards.

    Drives the task-detail assignee combo and the "Responsavel" filter, which
    the GUI builds from ``Member`` rows plus distinct ``Task.assignee``
    strings (hand-typed names predate the members list).
    """
    if not s.query(Project).filter(Project.id == project_id).first():
        raise HTTPException(404, "Project not found")
    members = (
        s.query(Member)
        .filter(Member.project_id == project_id)
        .order_by(Member.name)
        .all()
    )
    counts: dict[str, int] = {}
    for (name,) in (
        s.query(Task.assignee)
        .filter(
            Task.project_id == project_id,
            Task.deleted_at.is_(None),
            Task.archived_at.is_(None),
            Task.assignee.isnot(None),
            Task.assignee != "",
        )
        .all()
    ):
        counts[name] = counts.get(name, 0) + 1
    seen = set()
    out = []
    for m in members:
        seen.add(m.name)
        out.append(
            {
                "name": m.name,
                "color": m.color,
                "taskCount": counts.get(m.name, 0),
                "inMembers": True,
            }
        )
    for name in sorted(counts, key=str.lower):
        if name not in seen:
            out.append(
                {
                    "name": name,
                    "color": None,
                    "taskCount": counts[name],
                    "inMembers": False,
                }
            )
    return out
