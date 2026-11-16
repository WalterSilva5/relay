"""Review de PR: montagem do markdown no formato do template
(`lideranca/reviews/TEMPLATE-review-pr.md`), validação das regras de conteúdo,
numeração `NN-` a partir da pasta de destino e parse das tabelas.

Formato-alvo:
    # Review — PR #<id> · <título>
    **Link:** <url> · **Autor:** <nome> · **Branch:** `<origem>` → `<alvo>` · **Base:** `<merge-base>` · **Data da revisão:** <dd/mm>
    ## 1. Em uma frase
    ## 2. O que o PR faz (fluxo)
    ## 3. Como foi implementado (peças)
    ## 4. O que muda de comportamento
    ## 5. O que eu conferi (evidência)
    ## 6. Achados
    **Perguntas ao autor:**
    ## 7. Comentário final (para o PR)
    ## 8. Veredito
    **Voto registrado:** <…> · **Comentário publicado:** <…>
    ---
    ## Evidências internas (não copiar para o PR)
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date
from pathlib import Path

SENTENCE_MAX = 200

VERDICTS = ("APROVAR", "APROVAR_COM_SUGESTOES", "AGUARDANDO_AUTOR", "REJEITAR")
VERDICT_LABELS = {
    "APROVAR": "Aprovar",
    "APROVAR_COM_SUGESTOES": "Aprovar com sugestões",
    "AGUARDANDO_AUTOR": "Aguardando autor",
    "REJEITAR": "Rejeitar",
}

IMPLEMENTATION_DEFAULT = (
    "| Peça | Papel |\n"
    "|---|---|\n"
    "| Controller/rota | |\n"
    "| Seam (nativo/genexus/shadow) | |\n"
    "| Regras (BO) | |\n"
    "| Banco (DAO) | |\n"
    "| Fachada da rota do app | |"
)


def slug_texto(texto: str, limite: int = 50) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")
    return (slug or "pr")[:limite]


def parse_pr_url(url: str) -> dict:
    """Extrai {repo, number} de URLs do Azure DevOps ou GitHub. Vazio se irreconhecível."""
    u = (url or "").strip()
    m = re.search(r"dev\.azure\.com/[^/]+/[^/]+/_git/([^/]+)/pullrequest/(\d+)", u)
    if m:
        return {"repo": m.group(1), "number": int(m.group(2))}
    m = re.search(r"github\.com/[^/]+/([^/]+)/pull/(\d+)", u)
    if m:
        return {"repo": m.group(1).removesuffix(".git"), "number": int(m.group(2))}
    return {}


def dump_findings(linhas: list[dict]) -> str:
    validas = [l for l in linhas if (l.get("problema") or "").strip()]
    corpo = ["| Severidade | Arquivo:linha | Problema | Sugestão |", "|---|---|---|---|"] + [
        f"| {(l.get('severidade') or '').strip()} | {(l.get('onde') or '').strip()} | "
        f"{(l.get('problema') or '').strip()} | {(l.get('sugestao') or '').strip()} |"
        for l in validas
    ]
    return "\n".join(corpo)


def _f(v) -> str:
    return (v or "").strip() if isinstance(v, str) else (v if v is not None else "")


def validate_export(r) -> list[str]:
    """Erros que BLOQUEIAM exportação/envio."""
    erros: list[str] = []
    if not _f(r.pr_title) and not r.pr_number:
        erros.append("Informe o PR (número/título — cole a URL).")
    frase = _f(r.one_sentence)
    if not frase:
        erros.append("“Em uma frase” é obrigatório.")
    elif len(frase) > SENTENCE_MAX:
        erros.append(f"“Em uma frase” passa de {SENTENCE_MAX} caracteres ({len(frase)}).")
    if not _f(r.flow_md):
        erros.append("“O que o PR faz (fluxo)” é obrigatório.")
    if not _f(r.final_comment_md):
        erros.append("“Comentário final” é obrigatório.")
    return erros


_CARD_OR_PR_RE = re.compile(r"(^|\D)(#?\d{4,5})\b")
_QA_RE = re.compile(r"\bQA\b")
_ATENCAO_RE = re.compile(r"aten[cç][aã]o", re.IGNORECASE)


def content_warnings(final_comment_md: str | None) -> list[str]:
    """Alertas que NÃO bloqueiam (só avisam no formulário)."""
    avisos: list[str] = []
    comentario = final_comment_md or ""
    if _CARD_OR_PR_RE.search(comentario):
        avisos.append("O comentário final cita número de card/PR — números só nas evidências.")
    if _QA_RE.search(comentario):
        avisos.append("Aparece “QA” — sugerido: “Testes e validações”.")
    if len(_ATENCAO_RE.findall(comentario)) > 1:
        avisos.append("Mais de um ponto de atenção no comentário final.")
    return avisos


def _fmt_data(d) -> str:
    if isinstance(d, date):
        return d.strftime("%d/%m")
    return str(d or "—")


def _bullets(texto_md: str | None) -> list[str]:
    saidas = []
    for ln in (texto_md or "").splitlines():
        ln = ln.strip()
        if not ln:
            continue
        saidas.append(ln if ln.startswith(("-", "*", "1.", "2.", "3.")) else f"- {ln}")
    return saidas


def _checklist(r) -> list[str]:
    def marca(v: bool) -> str:
        return "x" if v else " "
    testes = "Testes rodados"
    if r.tests_run is not None:
        falhas = r.tests_failures if r.tests_failures is not None else 0
        skipped = r.tests_skipped if r.tests_skipped is not None else 0
        testes += f": **{r.tests_run} testes, {falhas} falhas, {skipped} skipped**"
    else:
        testes += ": **<n> testes, <falhas> falhas, <skipped> skipped**"
    return [
        f"- [{marca(r.checked_base)}] Base correta (`merge-base`) e escopo só do card",
        f"- [{marca(r.checked_conflicts)}] Sem conflito (`merge-tree`)",
        f"- [{marca(r.checked_tests)}] {testes}",
        f"- [{marca(r.checked_parity)}] Paridade/contrato: ...",
        f"- [{marca(r.checked_multi)}] Multi-tenant, shadow, logs, IDs longos (quando aplicável)",
    ]


def build_markdown(r) -> str:
    """Monta o .md idêntico ao template."""
    titulo = f"# Review — PR #{r.pr_number or '?'} · {_f(r.pr_title) or '(sem título)'}"
    meta = (f"**Link:** {_f(r.pr_url) or '—'} · **Autor:** {_f(r.pr_author) or '—'} · "
            f"**Branch:** `{_f(r.source_branch) or '?'}` → `{_f(r.target_branch) or '?'}` · "
            f"**Base:** `{_f(r.merge_base) or '?'}` · **Data da revisão:** {_fmt_data(r.review_date)}")
    vereditos = "\n".join(
        f"- [{'x' if r.verdict == v else ' '}] {VERDICT_LABELS[v]}" for v in VERDICTS
    )
    linhas = [
        titulo, "",
        meta, "",
        "## 1. Em uma frase", "",
        _f(r.one_sentence), "",
        "## 2. O que o PR faz (fluxo)", "",
        _f(r.flow_md), "",
        "## 3. Como foi implementado (peças)", "",
        _f(r.implementation_md) or IMPLEMENTATION_DEFAULT, "",
        "## 4. O que muda de comportamento", "",
        _f(r.behavior_md) or "- ...\n- Desvios conscientes: ...", "",
        "## 5. O que eu conferi (evidência)",
        *_checklist(r), "",
        "## 6. Achados",
        _f(r.findings_md) or "| Severidade | Arquivo:linha | Problema | Sugestão |\n|---|---|---|---|\n| | | | |",
        "",
        "**Perguntas ao autor:**",
        *(_bullets(r.questions_md) or ["- ..."]),
        "",
        "## 7. Comentário final (para o PR)", "",
        _f(r.final_comment_md), "",
        "## 8. Veredito",
        vereditos, "",
        f"**Voto registrado:** {_f(r.vote) or '<sim/não>'} · **Comentário publicado:** {_f(r.comment_published) or '<sim/não · data>'}",
        "",
        "---", "",
        "## Evidências internas (não copiar para o PR)",
    ]
    evidentes = _bullets(r.evidence_md)
    linhas += evidentes if evidentes else ["- ..."]
    return "\n".join(linhas).rstrip() + "\n"


def next_number(destino: Path) -> int:
    """Próximo NN a partir dos `NN-review-pr-*` existentes na pasta."""
    maior = 0
    if destino.is_dir():
        for f in destino.iterdir():
            m = re.match(r"(\d+)-review-pr-", f.name)
            if m:
                maior = max(maior, int(m.group(1)))
    return maior + 1


def export_filename(numero: int, pr_number, pr_title: str) -> str:
    return f"{numero:02d}-review-pr-{pr_number or 's-n'}-{slug_texto(pr_title)}.md"
