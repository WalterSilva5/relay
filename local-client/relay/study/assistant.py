"""Assistente de estudo sob demanda (IA acionada por botões).

Cada ação (explicar, exercícios, quiz, flashcards, sugerir tópicos, tirar
dúvida) roda em uma QThread para não travar a GUI, reusando o provedor de IA
ativo. Ações "de texto" devolvem markdown; "sugerir tópicos" devolve uma lista
estruturada para adicionar ao plano com 1 clique.
"""
from __future__ import annotations

import json
import logging

from PySide6.QtCore import QThread, Signal

from relay.ai.providers import build_chat_model
from relay.transcricoes.summarizer import _parse_json_response

logger = logging.getLogger("relay.study.assistant")

SYSTEM = (
    "Você é um tutor de programação experiente e didático. Responda sempre em "
    "português do Brasil, de forma clara e prática. Quando fizer sentido, use "
    "exemplos e trechos de código curtos. Formate a resposta em Markdown."
)

# Ações de texto (retornam markdown)
_PROMPTS = {
    "explain": (
        "Explique de forma didática o tópico \"{topic}\"{plan_ctx}. "
        "Comece por uma visão geral simples, depois aprofunde nos pontos "
        "principais com exemplos. Termine com um resumo de 3-5 bullets."
    ),
    "exercises": (
        "Crie de 3 a 5 exercícios práticos sobre \"{topic}\"{plan_ctx}. "
        "Para cada um: um título, o enunciado, a dificuldade (fácil/médio/difícil) "
        "e uma dica. Não dê a solução completa — apenas a dica."
    ),
    "quiz": (
        "Crie um quiz de 5 perguntas sobre \"{topic}\"{plan_ctx} para testar o "
        "conhecimento do estudante. Numere as perguntas. Ao final, em uma seção "
        "separada chamada \"Gabarito\", liste as respostas."
    ),
    "flashcards": (
        "Crie de 6 a 10 flashcards de revisão sobre \"{topic}\"{plan_ctx}. "
        "Use exatamente o formato, um por linha:\n"
        "**P:** pergunta curta\n**R:** resposta objetiva"
    ),
}

_ASK_PROMPT = (
    "O estudante está estudando \"{topic}\"{plan_ctx} e tem a seguinte dúvida:\n\n"
    "{question}\n\nResponda de forma objetiva e didática."
)

_SUGGEST_SYSTEM = (
    "Você é um mentor que monta roteiros de estudo. Responda SEMPRE apenas com "
    "JSON válido, sem texto fora do JSON."
)

_SUGGEST_PROMPT = (
    "Monte a lista de tópicos essenciais para estudar \"{plan}\", em uma ordem "
    "de aprendizado coerente (do básico ao avançado).\n"
    "{existing_ctx}\n"
    "{context}"
    "Retorne APENAS este JSON:\n"
    "{{\"topics\": [{{\"title\": \"nome do tópico\", \"estimate_hours\": número}}]}}\n"
    "Regras: 6 a 12 tópicos; títulos curtos; estimate_hours é um inteiro de horas "
    "realista; NÃO repita tópicos que já existem. "
    "Adapte a profundidade, o ritmo e o foco ao CONTEXTO do estudante quando fornecido."
)

_ROADMAP_QUESTIONS_SYSTEM = (
    "Você é um mentor que monta roteiros de estudo personalizados. Antes de montar o roteiro, "
    "você faz algumas perguntas objetivas ao estudante para adaptar o conteúdo. "
    "Responda SEMPRE apenas com JSON válido, sem texto fora do JSON."
)

_ROADMAP_QUESTIONS_PROMPT = (
    "O estudante quer um roteiro de estudos para o plano \"{plan}\".\n"
    "{existing_ctx}\n"
    "Gere de 3 a 5 perguntas curtas e objetivas para personalizar o roteiro "
    "(ex.: nível atual, objetivo/meta, tempo disponível por semana, foco/subáreas de interesse, "
    "pré-requisitos já dominados, formato preferido).\n"
    "Retorne APENAS este JSON:\n"
    "{{\"questions\": [\"pergunta 1\", \"pergunta 2\", ...]}}"
)

_DIAGNOSE_SYSTEM = (
    "Você é um mentor que diagnostica dificuldade de aprendizado. Sua premissa: "
    "quando alguém trava num tópico, quase nunca é falta de capacidade — é um "
    "pré-requisito faltando. Você reconstrói a base a partir do zero, do mais "
    "básico ao ponto de travamento. Responda SEMPRE apenas com JSON válido, sem "
    "texto fora do JSON."
)

_DIAGNOSE_PROMPT = (
    "O estudante travou no tópico \"{topic}\" (plano \"{plan}\").\n"
    "Onde ele trava: {question}\n"
    "{existing_ctx}\n"
    "Diagnostique quais pré-requisitos estão faltando e monte o caminho de "
    "reconstrução da base, do mais básico até o ponto de travamento.\n"
    "Retorne APENAS este JSON:\n"
    "{{\"markdown\": \"diagnóstico em Markdown, em português do Brasil, com as seções: "
    "## Onde você travou (reformule a dificuldade em 1-2 frases), "
    "## Diagnóstico (qual base está faltando e por quê, sem culpar capacidade), "
    "## Pré-requisitos em ordem (lista numerada do mais básico ao ponto de travamento, "
    "1 frase sobre cada um), "
    "## Como validar cada um (1 teste/exercício rápido por pré-requisito), "
    "## Quando voltar ao tópico (critério objetivo)\", "
    "\"prerequisites\": [{{\"title\": \"nome curto do pré-requisito\", "
    "\"estimate_hours\": número inteiro de horas}}]}}\n"
    "Regras: 2 a 6 pré-requisitos, do mais básico primeiro; títulos curtos; "
    "seja específico (nada de 'estude mais a base'); não invente tópicos fora "
    "do caminho até o ponto de travamento."
)

TEXT_ACTIONS = set(_PROMPTS.keys())


def _plan_ctx(plan_title: str) -> str:
    return f" (dentro do plano de estudo \"{plan_title}\")" if plan_title else ""


def generate_text(action: str, *, topic: str = "", plan: str = "", question: str = "") -> str:
    """Executa uma ação de texto (explain/exercises/quiz/flashcards/ask) e
    devolve markdown. Síncrona — usada pela API e pelo worker da GUI."""
    subject = topic or plan or ""
    llm = build_chat_model(temperature=0.4)
    plan_ctx = _plan_ctx(plan)
    if action == "ask":
        user = _ASK_PROMPT.format(topic=subject, plan_ctx=plan_ctx, question=question)
    else:
        tmpl = _PROMPTS.get(action)
        if not tmpl:
            raise ValueError(f"Ação desconhecida: {action}")
        user = tmpl.format(topic=subject, plan_ctx=plan_ctx)
    resp = llm.invoke([("system", SYSTEM), ("user", user)])
    return getattr(resp, "content", str(resp)).strip()


def roadmap_questions(plan: str, existing: list[str] | None = None) -> list[str]:
    """1ª etapa do fluxo de roadmap: perguntas para o estudante complementar o
    contexto antes de gerar os tópicos. Devolve uma lista de perguntas."""
    existing = existing or []
    existing_ctx = (
        "Tópicos que já existem no plano: " + ", ".join(existing)
        if existing else "O plano ainda não tem tópicos."
    )
    llm = build_chat_model(temperature=0.4)
    user = _ROADMAP_QUESTIONS_PROMPT.format(plan=plan, existing_ctx=existing_ctx)
    resp = llm.invoke([("system", _ROADMAP_QUESTIONS_SYSTEM), ("user", user)])
    parsed = _parse_json_response(getattr(resp, "content", str(resp)))
    out = []
    for q in (parsed.get("questions", []) if isinstance(parsed, dict) else []):
        if isinstance(q, str) and q.strip():
            out.append(q.strip())
    return out or [
        "Qual é o seu nível atual neste assunto?",
        "Qual o seu objetivo com este plano?",
        "Quanto tempo por semana você tem disponível?",
        "Há alguma subárea ou foco específico?",
    ]


def suggest_topics(plan: str, existing: list[str] | None = None, context: str = "") -> list[dict]:
    """2ª etapa: gera os tópicos considerando o CONTEXTO complementado pelo
    estudante. Devolve list[{title, estimate_hours}]."""
    existing = existing or []
    llm = build_chat_model(temperature=0.3)
    existing_ctx = (
        "Tópicos que JÁ existem no plano (não repita): " + ", ".join(existing)
        if existing else "O plano ainda não tem tópicos."
    )
    ctx = f"CONTEXTO DO ESTUDANTE:\n{context.strip()}\n" if context and context.strip() else ""
    user = _SUGGEST_PROMPT.format(plan=plan, existing_ctx=existing_ctx, context=ctx)
    resp = llm.invoke([("system", _SUGGEST_SYSTEM), ("user", user)])
    parsed = _parse_json_response(getattr(resp, "content", str(resp)))
    topics: list[dict] = []
    for item in parsed.get("topics", []) if isinstance(parsed, dict) else []:
        if isinstance(item, dict) and item.get("title"):
            topics.append({
                "title": str(item["title"]).strip()[:200],
                "estimate_hours": item.get("estimate_hours"),
            })
        elif isinstance(item, str) and item.strip():
            topics.append({"title": item.strip()[:200], "estimate_hours": None})
    return topics


def diagnose_prerequisites(topic: str, *, plan: str = "", stuck: str = "",
                           existing: list[str] | None = None) -> dict:
    """Diagnostica pré-requisitos faltantes a partir do ponto de travamento.

    Premissa (lelouch.dev): travar num tópico quase nunca é falta de
    capacidade — é lacuna de pré-requisito. Devolve
    `{markdown, prerequisites}`: o diagnóstico legível e a lista de
    pré-requisitos em ordem para adicionar ao plano com 1 clique.
    """
    existing = existing or []
    existing_ctx = (
        "Tópicos que o estudante diz já dominar (não repita como novidade): " + ", ".join(existing)
        if existing else "Sem informação sobre o que o estudante já domina."
    )
    llm = build_chat_model(temperature=0.3)
    user = _DIAGNOSE_PROMPT.format(
        topic=topic or "(não informado)", plan=plan or "(sem plano)",
        question=(stuck or "").strip() or "(não detalhou onde trava)",
        existing_ctx=existing_ctx,
    )
    resp = llm.invoke([("system", _DIAGNOSE_SYSTEM), ("user", user)])
    parsed = _parse_json_response(getattr(resp, "content", str(resp)))
    markdown = ""
    prereqs: list[dict] = []
    if isinstance(parsed, dict):
        markdown = str(parsed.get("markdown", "") or "").strip()
        for item in parsed.get("prerequisites", []) or []:
            if isinstance(item, dict) and item.get("title"):
                prereqs.append({
                    "title": str(item["title"]).strip()[:200],
                    "estimate_hours": item.get("estimate_hours"),
                })
            elif isinstance(item, str) and item.strip():
                prereqs.append({"title": item.strip()[:200], "estimate_hours": None})
    if not markdown:
        # fallback: devolve o texto bruto em vez de falhar
        markdown = getattr(resp, "content", str(resp)).strip()
    return {"markdown": markdown, "prerequisites": prereqs}


def run_action(action: str, *, topic: str = "", plan: str = "",
               question: str = "", existing: list[str] | None = None, context: str = ""):
    """Despacha uma ação. Retorna str (texto), list[str] (roadmap_questions),
    list[dict] (suggest_topics) ou dict (diagnose: {markdown, prerequisites})."""
    if action == "roadmap_questions":
        return roadmap_questions(plan or topic, existing)
    if action == "suggest_topics":
        return suggest_topics(plan or topic, existing, context)
    if action == "diagnose":
        return diagnose_prerequisites(topic or plan, plan=plan, stuck=question, existing=existing)
    return generate_text(action, topic=topic, plan=plan, question=question)


_TOPICS_FROM_MATERIAL_SYSTEM = (
    "Você é um mentor que monta roteiros de estudo. Recebe a definição de um plano "
    "(título, categoria, descrição) e, opcionalmente, um MATERIAL anexado (ebooks, "
    "apostilas, documentos). Responda SEMPRE apenas com JSON válido, sem texto fora do JSON."
)

_TOPICS_FROM_MATERIAL_PROMPT = (
    "Monte a lista de tópicos de estudo para o plano abaixo, em uma ordem de aprendizado coerente.\n"
    "PLANO: título=\"{title}\" | categoria={category}\n"
    "{description}\n"
    "{material_intro}{content}\n\n"
    "Retorne APENAS este JSON:\n"
    "{{\"topics\": [{{\"title\": \"tópico\", \"estimate_hours\": número}}]}}\n"
    "Regras: 6 a 15 tópicos; títulos curtos; estimate_hours é um inteiro de horas realista. "
    "Quando houver MATERIAL, os tópicos devem cobrir o conteúdo dele; sem material, baseie-se no título/descrição."
)


def topics_from_material(material: str = "", *, title: str = "",
                         category: str = "", description: str = "") -> list[dict]:
    """Gera os tópicos de um plano a partir dos campos + material anexado (opcional).

    Retorna list[{title, estimate_hours}].
    """
    words = material.split()
    clamped = " ".join(words[:6000]) if len(words) > 6000 else material
    material_intro = "MATERIAL ANEXADO (pode estar truncado):\n" if clamped.strip() else ""
    desc = f"Descrição: {description}" if description else ""
    llm = build_chat_model(temperature=0.3)
    user = _TOPICS_FROM_MATERIAL_PROMPT.format(
        title=title or "(sem título)", category=category or "CURSO",
        description=desc, material_intro=material_intro, content=clamped,
    )
    resp = llm.invoke([("system", _TOPICS_FROM_MATERIAL_SYSTEM), ("user", user)])
    parsed = _parse_json_response(getattr(resp, "content", str(resp)))
    topics: list[dict] = []
    for item in (parsed.get("topics", []) if isinstance(parsed, dict) else []):
        if isinstance(item, dict) and item.get("title"):
            topics.append({
                "title": str(item["title"]).strip()[:200],
                "estimate_hours": item.get("estimate_hours"),
            })
        elif isinstance(item, str) and item.strip():
            topics.append({"title": item.strip()[:200], "estimate_hours": None})
    return topics


class StudyAIWorker(QThread):
    """Executa UMA ação do assistente e emite o resultado.

    result(action, payload): payload é str (markdown) para ações de texto e
    para "ask"; para "suggest_topics" é uma list[dict] {title, estimate_hours}.
    """

    result = Signal(str, object)
    failed = Signal(str, str)   # (action, error)

    def __init__(self, action: str, *, topic: str = "", plan: str = "",
                 question: str = "", existing: list[str] | None = None,
                 context: str = "", parent=None):
        super().__init__(parent)
        self.action = action
        self.topic = topic or plan or ""
        self.plan = plan
        self.question = question
        self.existing = existing or []
        self.context = context

    def run(self) -> None:
        try:
            payload = run_action(
                self.action, topic=self.topic, plan=self.plan,
                question=self.question, existing=self.existing, context=self.context,
            )
            self.result.emit(self.action, payload)
        except Exception as e:  # noqa: BLE001
            logger.warning("Study AI (%s) falhou: %s", self.action, e)
            self.failed.emit(self.action, str(e))
