"""Insights hub for the Electron shell: dashboard, metrics, labels, KB.

Companion router for ``relay.api.app``. It only adds the endpoints the
PySide GUI reads straight from SQLite and that ``app.py`` does not expose
yet. Everything already covered there (``/api/activity``,
``/api/projects/metrics``, goals/todos/labels/documents CRUD,
``/api/kb/notes``, ``/api/kb/ask``, ``/api/digest``, ``/api/coach/tip``)
is intentionally NOT duplicated here.

The integrator owns ``app.include_router(router)``; this module only
declares ``router = APIRouter()`` with final ``/api/...`` paths.

Data logic mirrors the GUI views 1:1 so the Electron shell renders the
same numbers:
- ``dashboard_view._refresh_summary`` / ``_refresh_overdue`` /
  ``_refresh_projects`` (cut-off "dev entregue" via
  ``relay.dimensions.dev_done_ids_by_project``)
- ``metrics_view.refresh``

Out of scope on purpose (purely local, no backend needed):
- Pomodoro timer (``gui/widgets/pomodoro.py``): in-memory QTimer only.
- Eye-care breaks (``relay/eyecare.py`` + tray/main_window): state lives
  in ``~/.relay/config.json`` and meeting detection is a local window
  check; no workspace DB involved.
- Coach floating card (``gui/coach_widget.py``): thin view over
  ``relay.coach.build_context`` + ``generate_tip``, already exposed as
  ``GET /api/coach/tip`` and ``GET /api/coach/config``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from relay.db.models import (
    ActivityLog,  # noqa: F401  (re-exported for integrators/tests)
    BoardColumn,
    Document,
    Goal,  # noqa: F401
    Label,
    Project,
    Task,
    Todo,
    get_session,
)
from relay.dimensions import dev_done_ids_by_project

router = APIRouter()


def db():
    """Yield a workspace DB session (same pattern as ``api.app.db``)."""
    session = get_session()
    try:
        yield session
    finally:
        session.close()


def _dev_ids(s: Session) -> dict:
    """Done-ish column ids per project ("dev entregue" cut-off)."""
    return dev_done_ids_by_project(s.query(BoardColumn).all())


def _as_date(value):
    if value is None:
        return None
    return value.date() if hasattr(value, "date") else value


def _iso(value):
    return value.isoformat() if value else None


def _doc_dict(d: Document) -> dict:
    """Same shape as ``api.app._document_dict``."""
    return {
        "id": d.id,
        "taskId": d.task_id,
        "projectId": d.project_id,
        "title": d.title,
        "body": d.body,
        "type": d.type,
        "version": d.version,
        "createdAt": _iso(d.created_at),
        "updatedAt": _iso(d.updated_at),
    }


# ---------------------------------------------------------------------------
# Dashboard hub (dashboard_view._refresh_summary/_refresh_overdue/_refresh_projects)
# ---------------------------------------------------------------------------


@router.get("/api/dashboard/summary")
def dashboard_summary(s: Session = Depends(db)):
    """Summary cards: active tasks, done (7d), overdue, in progress.

    Mirrors ``DashboardView._refresh_summary``, including the per-project
    "dev entregue" cut-off for the overdue card.
    """
    active = s.query(Task).filter(Task.deleted_at.is_(None)).all()
    done_cols = {c.id for c in s.query(BoardColumn).filter(BoardColumn.is_done.is_(True)).all()}
    dev_by_project = _dev_ids(s)
    dev_all = {cid for ids in dev_by_project.values() for cid in ids}
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    today = datetime.utcnow().date()

    done_recent = sum(
        1 for t in active
        if t.column_id in done_cols and t.updated_at and t.updated_at >= seven_days_ago
    )
    overdue = sum(
        1 for t in active
        if _as_date(t.due_date) is not None
        and _as_date(t.due_date) < today
        and t.column_id not in dev_by_project.get(t.project_id, dev_all)
    )
    fazendo = {
        c.id for c in s.query(BoardColumn).filter(BoardColumn.name == "Fazendo").all()
    }
    in_progress = sum(1 for t in active if t.column_id in fazendo)
    return {
        "totalActive": len(active),
        "done7d": done_recent,
        "overdue": overdue,
        "inProgress": in_progress,
    }


@router.get("/api/dashboard/overdue")
def dashboard_overdue(
    limit: int = Query(default=50, le=200),
    s: Session = Depends(db),
):
    """Overdue task list for the dashboard card.

    Mirrors ``DashboardView._refresh_overdue``: past due date AND dev not
    delivered yet (per-project cut-off), oldest first.
    """
    dev_by_project = _dev_ids(s)
    dev_all = {cid for ids in dev_by_project.values() for cid in ids}
    today = datetime.utcnow().date()
    candidates = (
        s.query(Task)
        .filter(Task.deleted_at.is_(None), Task.due_date.isnot(None))
        .order_by(Task.due_date.asc())
        .all()
    )
    items = []
    for t in candidates:
        dev_ids = dev_by_project.get(t.project_id, dev_all)
        if _as_date(t.due_date) < today and t.column_id not in dev_ids:
            items.append({
                "id": t.id,
                "code": t.code,
                "title": t.title,
                "dueDate": _iso(t.due_date),
                "projectId": t.project_id,
                "projectKey": t.project.key if t.project else None,
                "assignee": t.assignee,
            })
            if len(items) >= limit:
                break
    return items


@router.get("/api/dashboard/projects")
def dashboard_projects(s: Session = Depends(db)):
    """Per-project progress cards (done/total + per-column counts).

    Mirrors ``DashboardView._refresh_projects``. Done = task in an
    ``is_done`` column of its project.
    """
    out = []
    for p in s.query(Project).order_by(Project.name).all():
        columns = (
            s.query(BoardColumn)
            .filter(BoardColumn.project_id == p.id)
            .order_by(BoardColumn.order)
            .all()
        )
        done_ids = {c.id for c in columns if c.is_done}
        tasks = (
            s.query(Task)
            .filter(Task.project_id == p.id, Task.deleted_at.is_(None))
            .all()
        )
        done = sum(1 for t in tasks if t.column_id in done_ids)
        counts: dict[int, int] = {}
        for t in tasks:
            counts[t.column_id] = counts.get(t.column_id, 0) + 1
        out.append({
            "id": p.id,
            "key": p.key,
            "name": p.name,
            "total": len(tasks),
            "done": done,
            "pct": round(done / len(tasks) * 100) if tasks else 0,
            "columns": [
                {"id": c.id, "name": c.name, "count": counts.get(c.id, 0)}
                for c in columns
            ],
        })
    return out


# ---------------------------------------------------------------------------
# Metrics detail (metrics_view.refresh parity)
# ---------------------------------------------------------------------------


@router.get("/api/metrics/detail")
def metrics_detail(s: Session = Depends(db)):
    """Full metrics payload with the exact semantics of ``MetricsView``.

    Compared to ``GET /api/projects/metrics`` this also returns the
    overdue count (with the "dev entregue" cut-off), done/total splits per
    type/priority, and the 8 calendar-week (Mon-Sun) throughput buckets the
    GUI draws.
    """
    now = datetime.utcnow()
    seven_ago = now - timedelta(days=7)
    thirty_ago = now - timedelta(days=30)

    tasks = s.query(Task).filter(Task.deleted_at.is_(None)).all()
    cols_by_id = {c.id: c for c in s.query(BoardColumn).all()}
    done_tasks = [t for t in tasks if cols_by_id.get(t.column_id) and cols_by_id[t.column_id].is_done]
    done_ids_set = {t.id for t in done_tasks}

    last_7d = sum(1 for t in done_tasks if t.updated_at and t.updated_at >= seven_ago)
    last_30d = sum(1 for t in done_tasks if t.updated_at and t.updated_at >= thirty_ago)

    lead_times = [
        (t.updated_at - t.created_at).total_seconds() / 3600
        for t in done_tasks
        if t.updated_at and t.created_at and t.updated_at >= thirty_ago
    ]
    avg_lead = round(sum(lead_times) / len(lead_times), 1) if lead_times else None
    avg_cycle = avg_lead  # same approximation as the GUI

    dev_all = {cid for ids in _dev_ids(s).values() for cid in ids}
    overdue = sum(
        1 for t in tasks
        if t.due_date and t.due_date < now and t.column_id not in dev_all
    )

    weeks = []
    for i in range(7, -1, -1):
        week_start = now - timedelta(days=now.weekday() + 7 * i)
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = week_start + timedelta(days=7)
        count = sum(
            1 for t in done_tasks
            if t.updated_at and week_start <= t.updated_at < week_end
        )
        weeks.append({"weekStart": week_start.date().isoformat(), "count": count})

    by_type: dict[str, dict] = {}
    for t in tasks:
        tp = t.type or "FEATURE"
        entry = by_type.setdefault(tp, {"type": tp, "total": 0, "done": 0})
        entry["total"] += 1
        if t.id in done_ids_set:
            entry["done"] += 1
    for entry in by_type.values():
        entry["pct"] = round(entry["done"] / entry["total"] * 100) if entry["total"] else 0

    by_priority: dict[str, dict] = {}
    for t in tasks:
        pr = t.priority or "MEDIUM"
        entry = by_priority.setdefault(pr, {"priority": pr, "total": 0, "done": 0})
        entry["total"] += 1
        if t.id in done_ids_set:
            entry["done"] += 1
    for entry in by_priority.values():
        entry["pct"] = round(entry["done"] / entry["total"] * 100) if entry["total"] else 0

    by_project = []
    for p in s.query(Project).order_by(Project.name).all():
        ptasks = [t for t in tasks if t.project_id == p.id]
        pdone = [t for t in ptasks if t.id in done_ids_set]
        by_project.append({
            "projectId": p.id,
            "key": p.key,
            "name": p.name,
            "total": len(ptasks),
            "done": len(pdone),
            "pct": round(len(pdone) / len(ptasks) * 100) if ptasks else 0,
        })

    return {
        "summary": {
            "total": len(tasks),
            "done": len(done_tasks),
            "last7d": last_7d,
            "last30d": last_30d,
            "avgLeadHours": avg_lead,
            "avgCycleHours": avg_cycle,
            "overdue": overdue,
        },
        "weeklyThroughput": weeks,
        "byType": sorted(by_type.values(), key=lambda e: e["type"]),
        "byPriority": [by_priority[k] for k in ("URGENT", "HIGH", "MEDIUM", "LOW") if k in by_priority],
        "byProject": by_project,
    }


# ---------------------------------------------------------------------------
# Labels with usage counts (labels_view shows "{count} tarefas" per card)
# ---------------------------------------------------------------------------


@router.get("/api/labels/with-counts")
def labels_with_counts(s: Session = Depends(db)):
    """All labels with the number of non-deleted tasks using each one."""
    out = []
    for lb in s.query(Label).order_by(Label.name).all():
        count = sum(1 for t in (lb.tasks or []) if t.deleted_at is None)
        out.append({"id": lb.id, "name": lb.name, "color": lb.color, "taskCount": count})
    return out


# ---------------------------------------------------------------------------
# TODOs bulk clear (todos_view._clear_done)
# ---------------------------------------------------------------------------


@router.post("/api/todos/clear-completed")
def clear_completed_todos(s: Session = Depends(db)):
    """Delete every completed TODO (the "Limpar concluidos" button)."""
    removed = s.query(Todo).filter(Todo.done.is_(True)).delete(synchronize_session=False)
    s.commit()
    return {"removed": removed}


# ---------------------------------------------------------------------------
# Single-document fetch (documents CRUD has list/create/update/delete only)
# ---------------------------------------------------------------------------


@router.get("/api/documents/{doc_id}")
def get_document(doc_id: int, s: Session = Depends(db)):
    """Fetch one document by id (KB editor `_open` parity)."""
    doc = s.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    return _doc_dict(doc)


# ---------------------------------------------------------------------------
# Single KB note with backlinks (kb_view._open + _update_backlinks parity)
# ---------------------------------------------------------------------------


@router.get("/api/kb/notes/{note_id}")
def kb_note_detail(note_id: int, s: Session = Depends(db)):
    """One KB note plus the notes linking to it via ``[[title]]``."""
    from relay.kb import backlinks

    doc = (
        s.query(Document)
        .filter(Document.id == note_id, Document.type == "KB")
        .first()
    )
    if not doc:
        raise HTTPException(404, "KB note not found")
    notes = [
        {"id": d.id, "title": d.title, "body": d.body or ""}
        for d in s.query(Document).filter(Document.type == "KB").all()
    ]
    links = backlinks(notes).get(doc.id, [])
    return {
        "id": doc.id,
        "title": doc.title,
        "body": doc.body or "",
        "projectId": doc.project_id,
        "version": doc.version,
        "updatedAt": _iso(doc.updated_at),
        "backlinks": links,
    }
