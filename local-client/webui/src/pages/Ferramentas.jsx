import { Link } from 'react-router-dom'
import { Card, PageHeader } from '../ui'
import { t } from '../i18n'
import Icon from '../components/Icon.jsx'

const ITEMS = [
  ['/estudos', 'book', 'Estudos', 'Planos, tópicos e assistente de estudo'],
  ['/metricas', 'dashboard', 'Métricas', 'Velocity, lead time e cycle time'],
  ['/labels', 'layers', 'Labels', 'Organize tarefas com labels coloridas'],
  ['/biblioteca', 'clipboard', 'Biblioteca', 'Snippets, runbooks, triagem, code review, git, tempo'],
  ['/api-tester', 'activity', 'Testador de API', 'Monte, execute e salve requisições HTTP'],
  ['/base', 'brain', 'Base de conhecimento', 'Notas com backlinks e Q&A por IA'],
  ['/techlinks', 'external', 'TechLinks', 'Atalhos de sites de tecnologia'],
  ['/traducao', 'globe', 'Tradutor', 'Traduza texto entre idiomas (estilo Google Tradutor)'],
]

// Hub de atalhos: o cartão inteiro é um link do router (teclado, foco e nova aba).
export default function Ferramentas() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Ferramentas')}
        description={t('Funcionalidades extras — clique para abrir.')}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map(([to, icon, label, desc]) => (
          <Card key={to} padding="sm" className="transition-colors hover:border-accent">
            <Link to={to} className="flex h-full flex-col gap-3">
              <span
                aria-hidden="true"
                className="grid h-control-lg w-control-lg place-items-center rounded-md bg-accent-soft text-accent"
              >
                <Icon name={icon} size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-md font-semibold text-fg">{t(label)}</h2>
                <p className="mt-1 text-sm text-fg-muted">{t(desc)}</p>
              </div>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}
