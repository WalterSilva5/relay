import { t } from '../i18n'
import { Card, PageHeader } from '../ui'
import Icon from '../components/Icon.jsx'

const SECTIONS = [
  {
    icon: 'target',
    title: 'O papel dos agentes',
    body: 'Agentes de IA são auxiliares dos desenvolvedores. Ajudam a acelerar o trabalho repetitivo, documentar progresso e preparar código para revisão humana.\n\nO que agentes fazem:\n- Auxiliam na implementação de tarefas\n- Documentam progresso com comentários estruturados\n- Criam code reviews detalhados\n- Criam tarefas de revisão para o desenvolvedor validar\n- Geram relatórios e resumos do dia\n\nO que agentes NUNCA fazem:\n- Commits ou pushs (responsabilidade exclusiva do dev)\n- Tocar em tarefas marcadas como "Requer desenvolvedor"\n- Tomar decisões de arquitetura sem consultar o dev',
  },
  {
    icon: '1',
    title: 'Crie um projeto',
    body: 'Acesse a aba Projetos e crie um novo projeto com nome e chave (ex: MEU-PROJ). O board será criado automaticamente com as colunas: Backlog, A fazer, Fazendo, Revisão e Concluído.',
  },
  {
    icon: '2',
    title: 'Adicione tarefas ao board',
    body: 'No Board, use o campo de texto na parte inferior de cada coluna para criar tarefas rapidamente. Clique em uma tarefa para abrir o detalhe e preencher descrição, prioridade, tipo, checklist e labels.',
  },
  {
    icon: '3',
    title: 'Skills para agentes',
    body: 'Skills são instruções que ensinam agentes de IA a interagir com o Relay via API. A instalação no diretório .claude/skills/ do seu projeto é feita no app desktop (aba Skills). Na página Skills daqui você visualiza, copia ou baixa o conteúdo de cada skill.',
  },
  {
    icon: '4',
    title: 'Fluxo de trabalho: dev + agente',
    body: 'O desenvolvedor lidera, o agente auxilia:\n\n1. Dev cria tarefas no board com descrição e critérios\n2. Agente pega uma tarefa e move para Fazendo\n3. Agente auxilia na implementação e documenta progresso\n4. Agente cria Code Review detalhado na tarefa\n5. Agente SEMPRE cria uma tarefa de revisão para o dev\n6. Agente move para Revisão (exige code review)\n7. Dev revisa as alterações, testa e faz commit/push\n8. Dev move para Concluído após validar\n\nA tarefa de revisão garante que o desenvolvedor sempre valide o trabalho do agente antes de ir para produção.',
  },
  {
    icon: '5',
    title: 'Tarefas de revisão',
    body: 'Ao concluir qualquer implementação, o agente DEVE criar uma tarefa de revisão para o desenvolvedor. Essa tarefa inclui:\n- Resumo do que foi feito\n- Arquivos alterados\n- O que testar\n- Pontos de atenção',
  },
  {
    icon: '6',
    title: 'Memória agentic',
    body: 'A página Memória agentic guarda fatos, decisões e contexto do workspace com busca semântica. Agentes consultam essa base para retomar contexto entre sessões. Você pode registrar, buscar e perguntar à memória por IA.',
  },
  {
    icon: '7',
    title: 'Acompanhe métricas',
    body: 'A aba Métricas mostra:\n- Total de tarefas e progresso\n- Throughput semanal (tarefas concluídas por semana)\n- Lead time e cycle time médios\n- Distribuição por tipo e prioridade\n- Alertas de tarefas com prazo vencido',
  },
  {
    icon: '8',
    title: 'Meu Dia e relatórios',
    body: 'A tela Meu Dia é o ponto central do dia de trabalho:\n- Notas do dia com template de foco, tarefas e bloqueios\n- Geração de relatório com resumo de atividades\n- Timeline de atividade do dia',
  },
  {
    icon: '9',
    title: 'Assistente',
    body: 'O Assistente é um agente de IA interno que roda com seu próprio provedor (LM Studio local, opencode, etc.):\n- Lê o board e resume o estado do trabalho\n- Sugere prioridades para o dia\n- Solicita revisões de tarefas\n- Cria TODOs e comenta tarefas\n\nConfigure o provedor em Configurações → Provedores de IA.',
  },
  {
    icon: '10',
    title: 'Reuniões (gravações)',
    body: 'A tela de Reuniões gerencia gravações feitas no app desktop: transcrição, resumo, análise com contexto do projeto e exportação. A gravação em si (microfone/áudio do sistema, atalho Ctrl+Shift+R) acontece no desktop.',
  },
  {
    icon: 'lock',
    title: 'Senhas e recursos do desktop',
    body: 'Alguns recursos são exclusivos do app desktop: cofre de senhas KeePass (atalho ↗ Senhas no menu abre o app nativo), gravação de áudio, instalação de skills e entrada por voz no Praticar Inglês.',
  },
  {
    icon: '?',
    title: 'Atalhos da versão web',
    body: '- F9 — Mostrar/ocultar menu lateral\n- Ctrl+Enter — Salvar registro na Daily do projeto',
  },
]

export default function Guia() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Como usar o Relay')}
        description={t('Gerencie tarefas com um board kanban e use agentes de IA como auxiliares dos desenvolvedores — eles ajudam a implementar, documentar e preparar código para revisão humana via API REST.')}
      />

      <div className="space-y-3">
        {SECTIONS.map((s) => {
          const numero = /^\d+$|^\?$/.test(s.icon)

          return (
            <Card key={s.title} className="flex gap-3">
              <span
                className={`grid h-control w-control shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  numero ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-muted'
                }`}
              >
                {numero ? s.icon : <Icon name={s.icon} size={18} />}
              </span>
              <div className="min-w-0">
                <h2 className="text-md font-semibold text-fg">{t(s.title)}</h2>
                <p className="mt-1 whitespace-pre-wrap text-base text-fg">{t(s.body)}</p>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
