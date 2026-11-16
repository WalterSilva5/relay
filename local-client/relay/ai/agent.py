"""Agente estratégico interno (LangGraph + ferramentas da aplicação)."""
from __future__ import annotations

from relay.ai.profiles import find_profile, tools_for_profile
from relay.ai.providers import build_chat_model
from relay.ai.tools import ALL_TOOLS
from relay.config import get_active_ai_provider

SYSTEM_PROMPT = (
    "Você é o assistente do Relay, uma aplicação local "
    "de gestão de tarefas para desenvolvedores.\n\n"
    "Regras gerais:\n"
    "- Você é um AUXILIAR. Nunca faz commits, pushs ou decisões de arquitetura.\n"
    "- Use search_memory no início de sessões e quando precisar de contexto "
    "histórico (decisões, preferências, episódios, procedimentos).\n"
    "- Use remember para gravar decisões importantes, preferências do dev e "
    "lições aprendidas (kind: fact|decision|preference|episode|procedure|context).\n"
    "- Consulte search_knowledge_base para notas KB (2º cérebro) com backlinks.\n"
    "- Seja conciso e direto. Responda em português do Brasil.\n"
    "- Se não houver projeto ou dados, oriente o usuário a criar primeiro."
)

# Cache do grafo compilado por (base_url, model, temperatura, perfil). Evita
# recompilar o ReAct a cada mensagem do chat.
_AGENT_CACHE: dict = {}


def build_agent(temperature: float = 0.3, profile: str | None = None):
    """Constrói (ou reusa do cache) o agente ReAct com as ferramentas do perfil.
    Pode lançar ProviderNotConfigured se não houver provedor/modelo configurado."""
    provider = get_active_ai_provider() or {}
    key = (provider.get("base_url"), provider.get("model"), round(float(temperature), 2),
           find_profile(profile)["id"])
    cached = _AGENT_CACHE.get(key)
    if cached is not None:
        return cached

    llm = build_chat_model(temperature=temperature)
    from langgraph.prebuilt import create_react_agent

    tools = tools_for_profile(profile, ALL_TOOLS)
    prompt = SYSTEM_PROMPT + "\n\n" + find_profile(profile)["system"]
    agent = create_react_agent(llm, tools, prompt=prompt)
    _AGENT_CACHE[key] = agent
    return agent


def clear_agent_cache() -> None:
    """Descarta os agentes em cache (ex.: ao trocar de provedor)."""
    _AGENT_CACHE.clear()


def run_agent(messages: list[dict], profile: str | None = None) -> str:
    """Executa o agente com o histórico de mensagens (role/content) e retorna o texto final.

    messages: lista de {"role": "user"|"assistant", "content": str}
    profile: id do perfil (estrategista|tutor|revisor); padrão = estrategista.
    """
    agent = build_agent(profile=profile)
    lc_messages = [(m["role"], m["content"]) for m in messages]
    result = agent.invoke({"messages": lc_messages})
    final = result["messages"][-1]
    return getattr(final, "content", str(final))
