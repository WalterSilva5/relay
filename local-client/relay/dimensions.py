"""Dimensões de agrupamento do projeto: módulo, submódulo, sprint, plataforma, tag.

Nem toda label é "módulo". No projeto da migração convivem, na mesma tabela de
labels, coisas de naturezas diferentes:

- **módulo**     — `cashier`, `config`, `financeiro`   (unidade de entrega)
- **submódulo / onda** — `cfg-e1`, `fin-e2`, `onda-1`  (pacote dentro do módulo)
- **sprint**     — `sprint-1` … `sprint-5`
- **plataforma** — `vm`, `var3-app`, `var-mobile`, `service`, `engine` (onde roda)
- **processo**   — `fundacao`, `infra`, `bug`, `despriorizado` (natureza/estado)

Misturar tudo em "por módulo" distorce as métricas. Este módulo classifica as
labels e agrega cada dimensão separadamente, para a UI, o PDF e os agentes.
"""
from __future__ import annotations

import re

from relay.module_plan import MODULE_PLAN, PLAN_ORDER, delivery_label

# ---------------------------------------------------------------------------
# Classificação
# ---------------------------------------------------------------------------

# Módulos canônicos: vêm da taxonomia de rótulos exibidos.
# O rótulo exibido é o próprio nome do módulo, como no plano.
MODULES: dict[str, str] = {nome: dados["label"] for nome, dados in MODULE_PLAN.items()}

# Prefixos de submódulo (`cfg-e1`) -> módulo dono.
SUBMODULE_PREFIXES: dict[str, str] = {
    "cfg": "config",
    "fin": "financeiro",
    "tro": "troca",
    "ven": "venda",
    "csh": "cashier",
    "cli": "cliente",
    "aut": "auth",
    "tcf": "config",
}

# `onda-N` é a sub-entrega (onda) do cashier no projeto da migração.
WAVE_MODULE = "cashier"

PLATFORM_LABELS = {
    "vm", "service", "engine", "enginefiscal", "var3-app", "var3_app",
    "var-mobile", "var_mobile", "tesouraria", "tesouraria-api",
    "app", "mobile", "desktop", "web",
}

PROCESS_LABELS = {
    "fundacao", "fundação", "infra", "bug", "bugs", "hotfix",
    "despriorizado", "debt", "tech-debt", "techdebt", "divida-tecnica",
    "p0", "p1", "p2", "melhoria", "refactor",
}

_SPRINT_RE = re.compile(r"^sprint[-_ ]?(\d+)$", re.IGNORECASE)
_SUBMODULE_RE = re.compile(r"^([a-z]{2,4})[-_ ]?e(\d+)$", re.IGNORECASE)
_WAVE_RE = re.compile(r"^onda[-_ ]?(\d+)$", re.IGNORECASE)

# rótulos legíveis das naturezas
PROCESS_LABELS_PT = {
    "fundacao": "Fundação",
    "fundação": "Fundação",
    "infra": "Infra",
    "bug": "Bug",
    "bugs": "Bug",
    "hotfix": "Hotfix",
    "despriorizado": "Despriorizado",
    "debt": "Dívida técnica",
    "tech-debt": "Dívida técnica",
    "techdebt": "Dívida técnica",
    "divida-tecnica": "Dívida técnica",
    "p0": "P0",
    "p1": "P1",
    "p2": "P2",
    "melhoria": "Melhoria",
    "refactor": "Refactor",
}


def classify_label(nome: str) -> dict:
    """Classifica uma label em uma das dimensões.

    Retorna `{kind, module, code, label, order}` onde `kind` é
    `MODULE | SUBMODULE | SPRINT | PLATFORM | PROCESS | OTHER`.
    """
    bruto = (nome or "").strip()
    chave = bruto.lower()

    if not chave:
        return {"kind": "OTHER", "module": None, "code": bruto, "label": bruto, "order": 99}

    if chave in MODULES:
        return {"kind": "MODULE", "module": chave, "code": chave,
                "label": MODULES[chave], "order": 0}

    m = _SPRINT_RE.match(chave)
    if m:
        return {"kind": "SPRINT", "module": None, "code": chave,
                "label": f"Sprint {m.group(1)}", "order": int(m.group(1))}

    m = _WAVE_RE.match(chave)
    if m:
        return {"kind": "SUBMODULE", "module": WAVE_MODULE, "code": chave,
                "label": delivery_label(chave) or f"Onda {m.group(1)}",
                "order": int(m.group(1))}

    m = _SUBMODULE_RE.match(chave)
    if m:
        prefixo, numero = m.group(1).lower(), m.group(2)
        modulo = SUBMODULE_PREFIXES.get(prefixo)
        if modulo:
            return {"kind": "SUBMODULE", "module": modulo, "code": chave,
                    "label": delivery_label(chave) or f"E{numero}", "order": int(numero)}

    if chave in PLATFORM_LABELS:
        return {"kind": "PLATFORM", "module": None, "code": chave,
                "label": bruto, "order": 0}

    if chave in PROCESS_LABELS:
        return {"kind": "PROCESS", "module": None, "code": chave,
                "label": PROCESS_LABELS_PT.get(chave, bruto), "order": 0}

    return {"kind": "OTHER", "module": None, "code": chave, "label": bruto, "order": 99}


# ---------------------------------------------------------------------------
# Agregação
# ---------------------------------------------------------------------------


def _pct(done: int, total: int) -> int:
    return round(done / total * 100) if total else 0


def _normalizar(nome: str) -> str:
    return "".join(ch for ch in (nome or "").lower() if ch.isalnum())


def dev_done_column(columns):
    """Coluna em que o desenvolvimento é considerado concluído (Dev Box).

    No fluxo do time (`Doing → Dev Review → Dev Box → In Test → Done`), o
    card em Dev Box é "dev concluído, aguardando teste" — é isso que a
    métrica de módulo deve refletir, e não só o que já passou por Done.
    """
    for col in sorted(columns or [], key=lambda c: c.order):
        if _normalizar(getattr(col, "name", "")) == "devbox":
            return col
    return None


def dev_done_ids(columns) -> set:
    """Ids das colunas a partir do desenvolvimento concluído (Dev Box ou depois).

    Ponto de verdade do corte "dev entregue": sem Dev Box no fluxo, cai na
    coluna de conclusão.
    """
    coluna_dev = dev_done_column(columns)
    if coluna_dev is None:
        return {c.id for c in columns or [] if c.is_done}
    return {c.id for c in columns if c.order >= coluna_dev.order}


def dev_done_ids_by_project(columns) -> dict:
    """`dev_done_ids` por projeto — para telas que agregam vários projetos."""
    por_projeto: dict = {}
    for c in columns or []:
        por_projeto.setdefault(c.project_id, []).append(c)
    return {pid: dev_done_ids(cols) for pid, cols in por_projeto.items()}


# Colunas que contam como "entregue" (vão para o % Finalizado) além da
# conclusão formal: estágios de teste/aceite. Normalizado igual ao Dev Box,
# então vale para boards em PT ou EN ("In Test", "Em teste", ...).
DELIVERED_STAGE_NAMES = frozenset({
    "intest", "emteste", "intestes", "emtestes",
    "verified", "verificado", "verificada",
    "accepted", "aceito", "aceita",
})


def delivered_ids(columns, done_ids) -> set:
    """Ids das colunas que contam como entregues: conclusão formal + teste/aceite.

    Ponto de verdade do "% Finalizado": tudo que já passou pelo
    desenvolvimento E pelo teste conta como entrega, mesmo sem o aceite final.
    """
    entregues = set(done_ids or ())
    for c in columns or []:
        if _normalizar(getattr(c, "name", "")) in DELIVERED_STAGE_NAMES:
            entregues.add(c.id)
    return entregues


def delivered_ids_by_project(columns) -> dict:
    """`delivered_ids` por projeto — para telas que agregam vários projetos."""
    por_projeto: dict = {}
    for c in columns or []:
        por_projeto.setdefault(c.project_id, []).append(c)
    return {
        pid: delivered_ids(cols, {c.id for c in cols if c.is_done})
        for pid, cols in por_projeto.items()
    }


def is_overdue(task, dev_ids, hoje=None) -> bool:
    """Vencida = prazo no passado E desenvolvimento ainda não concluído.

    A partir de Dev Box (inclusive) o card deixa de ser "vencido", porque o
    compromisso de desenvolvimento foi cumprido — mesmo que o aceite (Done)
    ainda esteja pendente.
    """
    from datetime import date as _date
    hoje = hoje or _date.today()
    venc = getattr(task, "due_date", None)
    if venc is None:
        return False
    dia = venc.date() if hasattr(venc, "date") else venc
    return dia < hoje and task.column_id not in dev_ids


def aggregate_dimensions(tasks, done_ids, columns=None) -> dict:
    """Agrupa as tarefas por dimensão, usando apenas cartões existentes.

    - `modules`: somente grupos com cartões, cada um com as sub-entregas
      observadas; sem metas, contagens planejadas ou total de endpoints
    - cada módulo traz **duas leituras de cartões**: `developed` (Dev Box ou
      depois = desenvolvimento concluído) e `done` (entregue = Done ou
      estágio de teste/aceite: In Test, Verified, Accepted)
    - `sprints`, `platforms`, `process`, `other`: dimensões independentes
    - `unlabeled`: cartões sem nenhuma label de módulo (honestidade da métrica)
    """
    # tarefa local (lembrete pessoal) não entra em métrica nenhuma
    locais = sum(1 for t in tasks if getattr(t, "is_local", False))
    tasks = [t for t in tasks if not getattr(t, "is_local", False)]
    total_cards = len(tasks)

    coluna_dev = dev_done_column(columns)
    if coluna_dev is not None:
        desenvolvidos_ids = {
            c.id for c in columns if c.order >= coluna_dev.order
        }
    else:
        # board sem Dev Box: cai na coluna de conclusão
        desenvolvidos_ids = set(done_ids)

    por_modulo: dict[str, set] = {}
    sub_por_modulo: dict[str, dict[str, set]] = {}
    sprints: dict[str, set] = {}
    plataformas: dict[str, set] = {}
    processos: dict[str, set] = {}
    outras: dict[str, set] = {}
    com_modulo: set = set()

    for t in tasks:
        for lb in t.labels:
            info = classify_label(lb.name)
            kind = info["kind"]
            if kind == "MODULE":
                por_modulo.setdefault(info["module"], set()).add(t.id)
                com_modulo.add(t.id)
            elif kind == "SUBMODULE":
                mod = info["module"]
                por_modulo.setdefault(mod, set()).add(t.id)
                com_modulo.add(t.id)
                sub_por_modulo.setdefault(mod, {}).setdefault(info["code"], set()).add(t.id)
            elif kind == "SPRINT":
                sprints.setdefault(info["code"], set()).add(t.id)
            elif kind == "PLATFORM":
                plataformas.setdefault(info["code"], set()).add(t.id)
            elif kind == "PROCESS":
                processos.setdefault(info["code"], set()).add(t.id)
            else:
                outras.setdefault(info["code"], set()).add(t.id)

    entregues_ids = delivered_ids(columns, done_ids)

    def _item(code: str, ids: set, rotulo: str | None = None) -> dict:
        done = sum(1 for t in tasks if t.id in ids and t.column_id in entregues_ids)
        developed = sum(1 for t in tasks if t.id in ids and t.column_id in desenvolvidos_ids)
        return {
            "name": code,
            "label": rotulo or code,
            "total": len(ids),
            # `done` = entregue (Done ou teste/aceite); `developed` = dev concluído
            "done": done,
            "pct": _pct(done, len(ids)),
            "developed": developed,
            "developedPct": _pct(developed, len(ids)),
        }

    modulos: list[dict] = []
    usados: set[str] = set()

    def _monta_modulo(chave: str, rotulo: str, plano: dict | None) -> dict:
        ids = por_modulo.get(chave, set())
        item = _item(chave, ids, rotulo)
        subs = []
        # sub-entregas conhecidas em ordem, depois as que só existem em label
        vistos: set[str] = set()
        for codigo, rotulo_sub in (plano or {}).get("deliveries", []):
            s_ids = sub_por_modulo.get(chave, {}).get(codigo, set())
            if not s_ids:
                continue
            vistos.add(codigo)
            sub = _item(codigo, s_ids, rotulo_sub)
            subs.append(sub)
        for codigo, s_ids in sorted(
            sub_por_modulo.get(chave, {}).items(),
            key=lambda kv: classify_label(kv[0]).get("order", 0),
        ):
            if codigo in vistos:
                continue
            sub = _item(codigo, s_ids, delivery_label(codigo) or codigo)
            subs.append(sub)
        item["submodules"] = subs
        item["submodules_total"] = sum(s["total"] for s in subs)
        return item

    # 1) módulos conhecidos com cartões, na ordem da taxonomia
    for chave in PLAN_ORDER:
        plano = MODULE_PLAN.get(chave)
        if not plano or chave not in por_modulo:
            continue
        usados.add(chave)
        modulos.append(_monta_modulo(chave, plano["label"], plano))

    # 2) módulos encontrados em label que não estão na taxonomia (não perder dado)
    for chave in sorted(por_modulo):
        if chave in usados:
            continue
        rotulo = MODULES.get(chave, chave)
        modulos.append(_monta_modulo(chave, rotulo, None))

    def _lista(fonte: dict[str, set], rotulos: dict[str, str] | None = None) -> list[dict]:
        itens = [_item(cod, ids, (rotulos or {}).get(cod)) for cod, ids in fonte.items()]
        itens.sort(key=lambda x: (-x["total"], x["name"]))
        return itens

    sprints_lista = _lista(
        sprints, {cod: classify_label(cod)["label"] for cod in sprints}
    )
    sprints_lista.sort(key=lambda x: (
        classify_label(x["name"]).get("order", 0), x["name"]
    ))

    return {
        "cards": total_cards,
        "local": locais,
        "developmentColumn": coluna_dev.name if coluna_dev is not None else None,
        "modules": modulos,
        "sprints": sprints_lista,
        "platforms": _lista(plataformas),
        "process": _lista(processos, PROCESS_LABELS_PT),
        "other": _lista(outras),
        "unlabeled": {
            "total": total_cards - len(com_modulo),
            "done": sum(
                1 for t in tasks
                if t.id not in com_modulo and t.column_id in entregues_ids
            ),
        },
        "with_module": len(com_modulo),
    }
