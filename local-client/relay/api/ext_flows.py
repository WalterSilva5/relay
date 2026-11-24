"""Relay Local — HTTP parity extension: FLOWS group.

Covers the GUI direct-DB access that has no equivalent in ``relay.api.app``:

- study sessions update/delete (app.py only has POST/GET)
- daily notes listing + deletion (app.py only has single-day GET/PUT/report)
- Obsidian vault status/config/trigger (GUI-only in daily_view)
- recordings creation + save-to-daily (app.py has read/update/analyze/live)
- transcription settings (whisper model + language; app.py only has model)
- single project fetch (app.py only has list/board)
- label rename/recolor (app.py only has create/delete/attach)
- no-AI standup data (app.py digest requires an AI provider)

Exposes ``router = APIRouter()`` with final paths. The integrator includes it
into the main FastAPI app; this module never touches ``app`` or Qt.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from relay.db.models import (
    ActivityLog,
    BoardColumn,
    Comment,
    DailyNote,
    Document,
    Label,
    Project,
    ProjectDailyEntry,
    Recording,
    StudyPlan,
    StudySession,
    StudyTopic,
    Task,
    get_session,
)

router = APIRouter()


def db():
    session = get_session()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Serialisation helpers (mirror app.py shapes)
# ---------------------------------------------------------------------------


def _session_dict(s: "StudySession") -> dict:
    return {
        "id": s.id, "planId": s.plan_id, "topicId": s.topic_id,
        "topic": {"id": s.topic.id, "title": s.topic.title} if s.topic else None,
        "startedAt": s.started_at.isoformat() if s.started_at else None,
        "endedAt": s.ended_at.isoformat() if s.ended_at else None,
        "durationMin": s.duration_min, "notes": s.notes,
        "confidence": s.confidence,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
    }


def _recording_tags(raw: str) -> list:
    try:
        v = json.loads(raw) if raw else []
        return v if isinstance(v, list) else []
    except Exception:  # noqa: BLE001
        return []


def _recording_dict(r: Recording, full: bool = False) -> dict:
    d = {
        "id": r.id,
        "kind": r.kind or "meeting",
        "title": r.title or "",
        "topic": r.topic or "",
        "duration": r.duration or 0.0,
        "language": r.language or "",
        "tags": _recording_tags(r.tags),
        "hasSummary": bool((r.markdown or "").strip() or (r.summary_json or "").strip()),
        "hasTranscript": bool((r.transcript or "").strip()),
        "preview": (r.transcript or r.markdown or "").strip()[:240],
        "createdAt": r.created_at.isoformat() if r.created_at else None,
        "archivedAt": r.archived_at.isoformat() if r.archived_at else None,
    }
    if full:
        d.update({
            "transcript": r.transcript or "",
            "markdown": r.markdown or "",
            "summaryJson": r.summary_json or "",
        })
    return d


def _project_dict(p: Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "key": p.key,
        "description": p.description,
        "taskSeq": p.task_seq,
        "externalDocsPath": getattr(p, "external_docs_path", "") or "",
        "boardUrl": getattr(p, "azure_board_url", "") or "",
        "azureBoardUrl": getattr(p, "azure_board_url", "") or "",
        "targetDate": p.target_date.isoformat() if getattr(p, "target_date", None) else None,
        "hideAssignee": bool(getattr(p, "hide_assignee", False)),
        "dailyDocsPath": getattr(p, "daily_docs_path", "") or "",
        "prReviewsPath": getattr(p, "pr_reviews_path", "") or "",
        "links": [],
        "createdAt": p.created_at.isoformat() if p.created_at else None,
    }


def _label_dict(lb: Label) -> dict:
    return {"id": lb.id, "name": lb.name, "color": lb.color}


def _sanitize(name: str) -> str:
    return "".join(c if c.isalnum() or c in " -_." else "_" for c in (name or "")).strip()


# ---------------------------------------------------------------------------
# Study sessions — update / delete (app.py only offers POST + GET)
# ---------------------------------------------------------------------------


class StudySessionUpdate(BaseModel):
    notes: Optional[str] = None
    confidence: Optional[int] = Field(default=None, ge=1, le=5)
    endedAt: Optional[str] = None
    durationMin: Optional[int] = None


@router.patch("/api/study/sessions/{session_id}")
def update_study_session(session_id: int, body: StudySessionUpdate, s: Session = Depends(db)):
    sess = s.query(StudySession).filter(StudySession.id == session_id).first()
    if not sess:
        raise HTTPException(404, "Study session not found")
    if body.notes is not None:
        sess.notes = body.notes
    if body.confidence is not None:
        sess.confidence = body.confidence
    if body.endedAt is not None:
        sess.ended_at = datetime.fromisoformat(body.endedAt) if body.endedAt else None
    if body.durationMin is not None:
        old = sess.duration_min or 0
        sess.duration_min = body.durationMin
        if sess.topic is not None:
            delta_h = (body.durationMin - old) / 60
            sess.topic.logged_hours = max(0.0, (sess.topic.logged_hours or 0) + delta_h)
    s.commit()
    s.refresh(sess)
    return _session_dict(sess)


@router.delete("/api/study/sessions/{session_id}")
def delete_study_session(session_id: int, s: Session = Depends(db)):
    sess = s.query(StudySession).filter(StudySession.id == session_id).first()
    if not sess:
        raise HTTPException(404, "Study session not found")
    if sess.topic is not None and sess.duration_min:
        sess.topic.logged_hours = max(0.0, (sess.topic.logged_hours or 0) - sess.duration_min / 60)
    s.delete(sess)
    s.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Daily notes — listing + deletion (app.py only offers single-day endpoints)
# ---------------------------------------------------------------------------


@router.get("/api/daily")
def list_daily_notes(
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 30,
    s: Session = Depends(db),
):
    """Lists notes for a calendar/history view (YYYY-MM-DD range, newest first)."""
    q = s.query(DailyNote)
    if start:
        q = q.filter(DailyNote.date >= start)
    if end:
        q = q.filter(DailyNote.date <= end)
    notes = q.order_by(DailyNote.date.desc()).limit(max(1, min(limit, 500))).all()
    out = []
    for n in notes:
        body = n.body or ""
        report = n.report or ""
        out.append({
            "date": n.date,
            "hasBody": bool(body.strip()),
            "hasReport": bool(report.strip()),
            "preview": (report or body).strip()[:200],
            "createdAt": n.created_at.isoformat() if n.created_at else None,
            "updatedAt": n.updated_at.isoformat() if n.updated_at else None,
        })
    return out


@router.delete("/api/daily/{date}")
def delete_daily_note(date: str, s: Session = Depends(db)):
    note = s.query(DailyNote).filter(DailyNote.date == date).first()
    if not note:
        raise HTTPException(404, "Daily note not found")
    s.delete(note)
    s.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Obsidian vaults — status / config / trigger (GUI-only in daily_view)
# ---------------------------------------------------------------------------


def _workspace_vaults() -> tuple[str, dict]:
    from relay.config import get_active_workspace_id, load_config
    cfg = load_config()
    ws_id = get_active_workspace_id()
    all_vaults = cfg.get("workspace_vaults", {})
    # migrate legacy global format
    if "obsidian_vaults" in cfg and ws_id not in all_vaults:
        from relay.config import save_config
        all_vaults[ws_id] = cfg.pop("obsidian_vaults")
        cfg["workspace_vaults"] = all_vaults
        save_config(cfg)
    return ws_id, all_vaults.get(ws_id, {})


@router.get("/api/obsidian/vaults")
def obsidian_vaults_status(s: Session = Depends(db)):
    """Configured Obsidian vault per project in the active workspace."""
    _, vaults = _workspace_vaults()
    projects = s.query(Project).order_by(Project.name).all()
    items = []
    for p in projects:
        path = (vaults.get(str(p.id)) or "").strip()
        items.append({
            "projectId": p.id,
            "projectKey": p.key,
            "projectName": p.name,
            "vaultPath": path,
            "configured": bool(path),
            "exists": bool(path) and Path(path).is_dir(),
        })
    return {"vaults": items}


class ObsidianVaultSet(BaseModel):
    projectId: int
    path: str = ""  # empty clears the mapping


@router.put("/api/obsidian/vaults")
def obsidian_vault_set(body: ObsidianVaultSet, s: Session = Depends(db)):
    from relay.config import load_config, save_config
    p = s.query(Project).filter(Project.id == body.projectId).first()
    if not p:
        raise HTTPException(404, "Project not found")
    path = (body.path or "").strip()
    if path:
        expanded = str(Path(path).expanduser())
        if not expanded.startswith("/"):
            raise HTTPException(400, "vault path must be absolute")
        path = expanded
    cfg = load_config()
    from relay.config import get_active_workspace_id
    ws_id = get_active_workspace_id()
    all_vaults = cfg.get("workspace_vaults", {})
    ws_vaults = all_vaults.get(ws_id, {})
    if path:
        ws_vaults[str(body.projectId)] = path
    else:
        ws_vaults.pop(str(body.projectId), None)
    all_vaults[ws_id] = ws_vaults
    cfg["workspace_vaults"] = all_vaults
    save_config(cfg)
    return {"ok": True, "projectId": body.projectId, "vaultPath": path}


def _sync_project_to_vault(s: Session, project: Project, vault_path: str) -> dict:
    """Mirrors DailyView._sync_project_to_vault (README/Board/Tasks/Reports/Docs)."""
    base = Path(vault_path) / _sanitize(project.name)
    for sub in ("Board", "Tasks", "Reports", "Docs"):
        (base / sub).mkdir(parents=True, exist_ok=True)

    created = project.created_at.strftime("%Y-%m-%d") if project.created_at else "-"
    readme = [
        f"# {project.name}", "",
        f"**Chave**: {project.key}",
        f"**Descricao**: {project.description or '-'}",
        f"**Criado em**: {created}",
        "", "## Estrutura", "",
        "- `Board/` — Estado atual de cada coluna do kanban",
        "- `Tasks/` — Detalhes de cada tarefa",
        "- `Reports/` — Relatorios diarios",
        "- `Docs/` — Documentos do projeto",
    ]
    (base / "README.md").write_text("\n".join(readme), encoding="utf-8")

    columns = (
        s.query(BoardColumn)
        .filter(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.order)
        .all()
    )
    board_files = 0
    for col in columns:
        tasks = (
            s.query(Task)
            .filter(Task.column_id == col.id, Task.deleted_at == None)  # noqa: E711
            .order_by(Task.rank)
            .all()
        )
        lines = [f"# {col.name}", ""]
        if not tasks:
            lines.append("_Nenhuma tarefa nesta coluna._")
        else:
            for t in tasks:
                human = " (requires dev)" if t.requires_human else ""
                lines.append(f"- [[{t.code} - {_sanitize(t.title)}|{t.code}]] [{t.type or 'FEATURE'}] ({t.priority or 'MEDIUM'}){human}")
        lines.append("")
        (base / "Board" / f"{_sanitize(col.name)}.md").write_text("\n".join(lines), encoding="utf-8")
        board_files += 1

    all_tasks = (
        s.query(Task)
        .filter(Task.project_id == project.id, Task.deleted_at == None)  # noqa: E711
        .order_by(Task.number)
        .all()
    )
    task_files = 0
    for task in all_tasks:
        lines = [
            f"# {task.code} - {task.title}", "",
            f"**Tipo**: {task.type or 'FEATURE'}",
            f"**Prioridade**: {task.priority or 'MEDIUM'}",
            f"**Status**: {task.status}",
            f"**Criado**: {task.created_at.strftime('%Y-%m-%d %H:%M') if task.created_at else '-'}",
        ]
        if task.assignee:
            lines.append(f"**Responsavel**: {task.assignee}")
        if task.due_date:
            lines.append(f"**Prazo**: {task.due_date.strftime('%Y-%m-%d')}")
        if task.requires_human:
            lines.append("**Requer desenvolvedor**: Sim")
        if task.estimate_md:
            lines.append(f"**Estimativa**: {task.estimate_md} dias")
        lines.append("")
        if task.description:
            lines.extend(["## Descricao", "", task.description, ""])
        if task.objective:
            lines.extend(["## Objetivo", "", task.objective, ""])
        if task.acceptance:
            lines.extend(["## Criterios de Aceite", "", task.acceptance, ""])
        if task.checklist:
            lines.extend(["## Checklist", ""])
            for ci in task.checklist:
                mark = "x" if ci.checked else " "
                lines.append(f"- [{mark}] {ci.title}")
            lines.append("")
        if task.comments:
            lines.extend(["## Comentarios", ""])
            for c in task.comments:
                ts = c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else ""
                lines.append(f"### [{c.type}] {ts}")
                lines.append(c.body or "")
                lines.append("")
        (base / "Tasks" / f"{task.code} - {_sanitize(task.title)}.md").write_text("\n".join(lines), encoding="utf-8")
        task_files += 1

    notes = s.query(DailyNote).filter(DailyNote.report != "").order_by(DailyNote.date).all()
    report_files = 0
    for note in notes:
        (base / "Reports" / f"{note.date}.md").write_text(note.report or "", encoding="utf-8")
        report_files += 1

    docs = s.query(Document).filter(
        (Document.project_id == project.id)
        | (Document.task_id.in_(s.query(Task.id).filter(Task.project_id == project.id)))
    ).all()
    doc_files = 0
    for doc in docs:
        lines = [f"# {doc.title}", ""]
        if doc.body:
            lines.append(doc.body)
        (base / "Docs" / f"{_sanitize(doc.title)}.md").write_text("\n".join(lines), encoding="utf-8")
        doc_files += 1

    return {
        "projectId": project.id,
        "base": str(base),
        "boardFiles": board_files,
        "taskFiles": task_files,
        "reportFiles": report_files,
        "docFiles": doc_files,
    }


class ObsidianSyncBody(BaseModel):
    projectId: Optional[int] = None  # absent = every configured project


@router.post("/api/obsidian/sync")
def obsidian_sync(body: ObsidianSyncBody, s: Session = Depends(db)):
    _, vaults = _workspace_vaults()
    if not vaults:
        raise HTTPException(400, "No Obsidian vault configured")
    targets = [str(body.projectId)] if body.projectId is not None else list(vaults.keys())
    results: list[dict] = []
    for pid_str in targets:
        vault_path = (vaults.get(pid_str) or "").strip()
        if not vault_path or not Path(vault_path).is_dir():
            results.append({"projectId": pid_str, "ok": False, "error": "vault not configured or missing"})
            continue
        try:
            pid = int(pid_str)
        except ValueError:
            results.append({"projectId": pid_str, "ok": False, "error": "invalid project id"})
            continue
        project = s.query(Project).filter(Project.id == pid).first()
        if not project:
            results.append({"projectId": pid, "ok": False, "error": "project not found"})
            continue
        try:
            results.append({"ok": True, **_sync_project_to_vault(s, project, vault_path)})
        except OSError as e:
            results.append({"projectId": pid, "ok": False, "error": str(e)})
    synced = sum(1 for r in results if r.get("ok"))
    return {"synced": synced, "results": results}


# ---------------------------------------------------------------------------
# Recordings — creation + save-to-daily
# (app.py has list/live/get/patch/delete/archive/export/analyze/audio)
# ---------------------------------------------------------------------------


class RecordingCreate(BaseModel):
    title: str = ""
    kind: str = "meeting"  # meeting | study
    topic: str = ""
    transcript: str = ""
    markdown: str = ""
    language: str = ""
    duration: float = 0.0


@router.post("/api/recordings", status_code=201)
def create_recording(body: RecordingCreate, s: Session = Depends(db)):
    kind = (body.kind or "meeting").strip().lower()
    if kind not in ("meeting", "study"):
        raise HTTPException(400, "kind must be meeting or study")
    r = Recording(
        kind=kind,
        title=(body.title or "").strip(),
        topic=(body.topic or "").strip(),
        transcript=body.transcript or "",
        markdown=body.markdown or "",
        language=(body.language or "").strip(),
        duration=body.duration or 0.0,
        tags="[]",
    )
    s.add(r)
    s.commit()
    s.refresh(r)
    return _recording_dict(r, full=True)


class SaveToDailyBody(BaseModel):
    date: Optional[str] = None  # YYYY-MM-DD, defaults to today


@router.post("/api/recordings/{rec_id}/save-to-daily")
def recording_save_to_daily(rec_id: int, body: SaveToDailyBody, s: Session = Depends(db)):
    """Appends the recording summary (or transcript fallback) to Meu Dia.

    Mirrors TranscricoesView._save_to_day: appends to DailyNote.report.
    """
    r = s.query(Recording).filter(Recording.id == rec_id).first()
    if not r:
        raise HTTPException(404, "Recording not found")
    md = (r.markdown or "").strip()
    if not md:
        transcript = (r.transcript or "").strip()
        if not transcript:
            raise HTTPException(400, "Recording has no summary or transcript to save")
        kind_label = "Estudo" if (r.kind or "meeting") == "study" else "Reuniao"
        header = f"## {kind_label}" + (f": {r.topic}" if (r.topic or "").strip() else "")
        hora = datetime.now().strftime("%H:%M")
        md = f"{header} ({hora})\n\n{transcript}"
    day = (body.date or "").strip() or datetime.now().strftime("%Y-%m-%d")
    note = s.query(DailyNote).filter(DailyNote.date == day).first()
    if not note:
        note = DailyNote(date=day, body="", report="")
        s.add(note)
    note.report = ((note.report or "") + "\n\n" + md).strip() + "\n"
    s.commit()
    return {"ok": True, "date": day}


# ---------------------------------------------------------------------------
# Transcription settings (app.py settings only carry the whisper model)
# ---------------------------------------------------------------------------


@router.get("/api/settings/transcription")
def get_transcription_settings():
    from relay.config import load_config
    from relay.transcricoes.constants import WHISPER_DEFAULT_LANGUAGE, WHISPER_DEFAULT_MODEL
    cron = load_config().get("settings", {}).get("transcricoes", {})
    return {
        "whisperModel": cron.get("whisper_model", WHISPER_DEFAULT_MODEL),
        "whisperLanguage": cron.get("whisper_language", WHISPER_DEFAULT_LANGUAGE),
    }


class TranscriptionUpdate(BaseModel):
    whisperModel: Optional[str] = None
    whisperLanguage: Optional[str] = None


@router.put("/api/settings/transcription")
def put_transcription_settings(body: TranscriptionUpdate):
    from relay.config import load_config, save_config
    cfg = load_config()
    cron = cfg.setdefault("settings", {}).setdefault("transcricoes", {})
    if body.whisperModel is not None:
        if not body.whisperModel.strip():
            raise HTTPException(400, "whisperModel must not be empty")
        cron["whisper_model"] = body.whisperModel.strip()
    if body.whisperLanguage is not None:
        cron["whisper_language"] = body.whisperLanguage.strip()
    save_config(cfg)
    return {"whisperModel": cron.get("whisper_model", "small"),
            "whisperLanguage": cron.get("whisper_language", "pt")}


# ---------------------------------------------------------------------------
# Projects — single fetch (app.py only offers list + board)
# ---------------------------------------------------------------------------


@router.get("/api/projects/{project_id}")
def get_project(project_id: int, s: Session = Depends(db)):
    p = s.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    d = _project_dict(p)
    d["links"] = [
        {"id": l.id, "projectId": l.project_id, "title": l.title, "url": l.url,
         "sortOrder": l.sort_order,
         "createdAt": l.created_at.isoformat() if l.created_at else None}
        for l in getattr(p, "links", [])
    ]
    return d


# ---------------------------------------------------------------------------
# Labels — rename / recolor (app.py only offers create + delete + attach)
# ---------------------------------------------------------------------------


class LabelUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


@router.patch("/api/labels/{label_id}")
def update_label(label_id: int, body: LabelUpdate, s: Session = Depends(db)):
    lb = s.query(Label).filter(Label.id == label_id).first()
    if not lb:
        raise HTTPException(404, "Label not found")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "name must not be empty")
        clash = s.query(Label).filter(Label.name == name, Label.id != label_id).first()
        if clash:
            raise HTTPException(400, "Label already exists")
        lb.name = name
    if body.color is not None:
        lb.color = body.color
    s.commit()
    s.refresh(lb)
    return _label_dict(lb)


# ---------------------------------------------------------------------------
# Standup — raw done/doing/blockers without requiring an AI provider
# (app.py /api/digest calls the LLM and fails with no provider configured)
# ---------------------------------------------------------------------------


@router.get("/api/standup")
def get_standup(
    date: Optional[str] = None,
    projectId: Optional[int] = None,
    s: Session = Depends(db),
):
    """Standup data for a day (default today): finished, in progress, blockers."""
    day = (date or "").strip() or datetime.now().strftime("%Y-%m-%d")
    try:
        day_start = datetime.fromisoformat(f"{day}T00:00:00")
        day_end = datetime.fromisoformat(f"{day}T23:59:59")
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")

    tq = s.query(Task).filter(Task.deleted_at == None)  # noqa: E711
    if projectId is not None:
        tq = tq.filter(Task.project_id == projectId)
    tasks = tq.all()

    done = [
        {"code": t.code, "title": t.title, "projectId": t.project_id}
        for t in tasks
        if t.column and t.column.is_done
        and ((t.done_at is not None and day_start <= t.done_at <= day_end)
             or (t.done_at is None and t.updated_at is not None
                 and day_start <= t.updated_at <= day_end))
    ]
    doing = [
        {"code": t.code, "title": t.title, "status": t.status,
         "assignee": t.assignee, "projectId": t.project_id}
        for t in tasks
        if t.column and not t.column.is_done and (t.column.order or 0) > 0
    ]

    bq = s.query(ProjectDailyEntry).filter(
        ProjectDailyEntry.date == day, ProjectDailyEntry.kind == "BLOCKER")
    if projectId is not None:
        bq = bq.filter(ProjectDailyEntry.project_id == projectId)
    blockers = [
        {"id": e.id, "projectId": e.project_id, "title": e.title or "",
         "body": e.body or "", "taskCode": e.task_code or ""}
        for e in bq.order_by(ProjectDailyEntry.created_at).all()
    ]

    recent = (
        s.query(ActivityLog)
        .filter(ActivityLog.created_at >= day_start, ActivityLog.created_at <= day_end)
        .order_by(ActivityLog.created_at.desc()).limit(20).all()
    )
    comments = (
        s.query(Comment)
        .filter(Comment.created_at >= day_start, Comment.created_at <= day_end)
        .count()
    )
    return {
        "date": day,
        "projectId": projectId,
        "done": done,
        "doing": doing,
        "blockers": blockers,
        "activityCount": len(recent),
        "commentCount": comments,
    }
