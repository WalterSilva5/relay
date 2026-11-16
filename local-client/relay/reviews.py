"""Review semanal manual: montagem do markdown no formato do vault
(`lideranca/avaliacao/AAAA-MM-DD-review-semanal-<pessoa>.md`), validação das
regras de conteúdo e comparação simples entre semanas ("pontos que se repetem").

Formato-alvo (espelho dos arquivos enviados):
    # Avaliação semanal — <NOME> · semana de <DD> a <DD>/<MM>/<AAAA>
    **Semana de <DD>/<MM>/<AAAA>**
    Avaliador: <nome>
    <N>· Competências Técnicas
    <N>· Competências Comportamentais
    ## Comentário do Avaliador
    <3 parágrafos>
    ---
    ## Evidências (interno — não copiar para o formulário)
    <bullets>
    ## Próxima semana (proposta)
    <bullets>
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date

SUMMARY_MAX = 200

_FACTS_HEADER = ("| O que | PR ou card | Evidência |",
                 "|---|---|---|")


def slug_pessoa(nome: str) -> str:
    """'Moisés Silva' -> 'moises-silva' (para o nome do arquivo)."""
    sem_acento = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", sem_acento.lower()).strip("-")
    return slug or "pessoa"


def export_filename(person_name: str, period_end) -> str:
    """`AAAA-MM-DD-review-semanal-<pessoa>.md` (data = fim do período)."""
    dia = period_end.isoformat() if hasattr(period_end, "isoformat") else str(period_end)
    return f"{dia}-review-semanal-{slug_pessoa(person_name)}.md"


def _f(v) -> str:
    return (v or "").strip()


# ---------------------------------------------------------------------------
# Tabela de fatos (o que | PR ou card | evidência)
# ---------------------------------------------------------------------------

def parse_facts(facts_md: str) -> list[dict]:
    """Markdown table -> [{what, ref, evidence}]. Ignora cabeçalho e linhas vazias."""
    linhas: list[dict] = []
    for ln in (facts_md or "").splitlines():
        ln = ln.strip()
        if not ln.startswith("|"):
            continue
        cels = [c.strip() for c in ln.strip("|").split("|")]
        if len(cels) < 3:
            continue
        if set("".join(cels)) <= set("-: ") and not any(re.search(r"[a-zA-Z0-9]", c) for c in cels):
            continue  # linha separadora |---|---|
        if cels[0].lower() in ("o que", "what"):
            continue  # cabeçalho
        linhas.append({"what": cels[0], "ref": cels[1], "evidence": " | ".join(cels[2:]).strip()})
    return linhas


def dump_facts(linhas: list[dict]) -> str:
    """[{what, ref, evidence}] -> markdown table (o que está vazio é descartado)."""
    validas = [l for l in linhas if _f(l.get("what"))]
    corpo = ["| " + " | ".join([_f(l.get("what")), _f(l.get("ref")), _f(l.get("evidence"))]) + " |"
             for l in validas]
    return "\n".join([*_FACTS_HEADER, *corpo])


def facts_as_bullets(facts_md: str) -> list[str]:
    """Fatos -> bullets no formato das evidências do vault."""
    bullets = []
    for l in parse_facts(facts_md):
        partes = [p for p in [_f(l["what"]), _f(l["ref"]), _f(l["evidence"])] if p]
        if partes:
            bullets.append("- " + " — ".join(partes))
    return bullets


# ---------------------------------------------------------------------------
# Validação das regras de conteúdo
# ---------------------------------------------------------------------------

def comment_blocks(comment_md: str) -> list[str]:
    """Os 3 blocos do comentário final (separados por linha em branco)."""
    return [b.strip() for b in re.split(r"\n\s*\n", comment_md or "") if b.strip()]


def validate_export(review) -> list[str]:
    """Erros que BLOQUEIAM a exportação/marcação como enviado."""
    erros: list[str] = []
    if not _f(review.person_name):
        erros.append("Informe a pessoa.")
    if not getattr(review, "period_start", None) or not getattr(review, "period_end", None):
        erros.append("Informe a semana (início e fim).")
    frase = _f(review.summary_one_line)
    if not frase:
        erros.append("“Em uma frase” é obrigatório.")
    elif len(frase) > SUMMARY_MAX:
        erros.append(f"“Em uma frase” passa de {SUMMARY_MAX} caracteres ({len(frase)}).")
    blocos = comment_blocks(review.comment_md)
    if len(blocos) < 3:
        erros.append(
            f"O comentário final exige os 3 blocos preenchidos (entrega, "
            f"reconhecimento/atenção, próximos passos) — há {len(blocos)}."
        )
    return erros


_CARD_OR_PR_RE = re.compile(r"(^|\D)(#?\d{4,5})\b")
_QA_RE = re.compile(r"\bQA\b")
_ATENCAO_RE = re.compile(r"aten[cç][aã]o", re.IGNORECASE)


def content_warnings(review) -> list[str]:
    """Alertas que NÃO bloqueiam (só avisam no formulário)."""
    avisos: list[str] = []
    comentario = review.comment_md or ""
    if _CARD_OR_PR_RE.search(comentario):
        avisos.append("Há número de card/PR no comentário — números só nas evidências.")
    if _QA_RE.search(comentario):
        avisos.append("Aparece “QA” — usar “Testes e validações”.")
    if len(_ATENCAO_RE.findall(comentario)) > 1:
        avisos.append("Mais de um ponto de atenção — o formato pede um único ponto (ou reconhecimento).")
    return avisos


# ---------------------------------------------------------------------------
# Montagem do markdown final
# ---------------------------------------------------------------------------

def _fmt_dia(d) -> str:
    return d.strftime("%d/%m/%Y") if isinstance(d, date) else str(d or "")


def _fmt_curto(d) -> str:
    return d.strftime("%d") if isinstance(d, date) else str(d or "")


def _bullets(texto_md: str) -> list[str]:
    """Normaliza texto livre em bullets (linhas `- ` passam direto)."""
    saidas = []
    for ln in (texto_md or "").splitlines():
        ln = ln.strip()
        if not ln:
            continue
        saidas.append(ln if ln.startswith(("-", "*", "1.", "2.", "3.")) else f"- {ln}")
    return saidas


def build_markdown(review, prev=None) -> str:
    """Monta o .md no formato do vault. `prev` não entra no arquivo (só na tela)."""
    ini, fim = review.period_start, review.period_end
    titulo = f"# Avaliação semanal — {_f(review.person_name)} · semana de {_fmt_curto(ini)} a {_fmt_dia(fim)}"
    linhas = [
        titulo,
        "",
        f"**Semana de {_fmt_dia(ini)}**",
        f"Avaliador: {_f(review.evaluator) or '—'}",
        "",
        f"{review.tech_score if review.tech_score is not None else 'N'}· Competências Técnicas",
        f"{review.soft_score if review.soft_score is not None else 'N'}· Competências Comportamentais",
        "",
        "## Comentário do Avaliador",
        "",
        (review.comment_md or "").strip(),
        "",
        "---",
        "",
        "## Evidências (interno — não copiar para o formulário)",
        "",
    ]
    evidentes = facts_as_bullets(review.facts_md) + _bullets(review.evidence_md)
    linhas += evidentes if evidentes else ["- (nenhuma evidência registrada)"]
    linhas += ["", "## Próxima semana (proposta)", ""]
    proximas = _bullets(review.next_week_md)
    linhas += proximas if proximas else ["- (a definir)"]
    return "\n".join(linhas).rstrip() + "\n"


# ---------------------------------------------------------------------------
# Comparação entre semanas ("nota anterior", "pontos que se repetem")
# ---------------------------------------------------------------------------

_STOP = set("de da do das dos em no na nos nas ao aos e o a os as um uma uns umas que se com por para como mais foi era são ter tem isso este esta isto".split())


def _termos(texto: str) -> set[str]:
    palavras = re.findall(r"[a-zà-ú]{4,}", (texto or "").lower())
    return {p for p in palavras if p not in _STOP}


def repeated_points(atual, anterior, limite: int = 8) -> list[str]:
    """Termos relevantes que aparecem nos dois reviews (fatos + comentário)."""
    ta = _termos((atual.facts_md or "") + "\n" + (atual.comment_md or ""))
    tb = _termos((anterior.facts_md or "") + "\n" + (anterior.comment_md or ""))
    repetidos = sorted(ta & tb)
    # prioriza os que aparecem no comentário atual (o que foi dito de novo)
    no_comentario = _termos(atual.comment_md or "")
    repetidos.sort(key=lambda p: (p not in no_comentario, p))
    return repetidos[:limite]
