import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'
import Icon from '../components/Icon'

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

export default function Ferramentas() {
  const nav = useNavigate()
  return (
    <div>
      <h1 className="page-title">{t('Ferramentas')}</h1>
      <p className="subtitle">{t('Funcionalidades extras — clique para abrir.')}</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
          marginTop: 12,
        }}
      >
        {ITEMS.map(([to, icon, label, desc]) => (
          <div
            key={to}
            className="card"
            style={{ cursor: 'pointer', minHeight: 120 }}
            onClick={() => nav(to)}
          >
            <span className="muted">
              <Icon name={icon} size={22} />
            </span>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8 }}>{t(label)}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t(desc)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
