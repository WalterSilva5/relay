import { useEffect, useMemo, useState } from 'react'
import { getTechLinks, saveTechLinks } from '../api-techlinks'
import { t } from '../i18n'

const vazio = () => ({ nome: '', url: '', categoria: 'Notícias', descricao: '' })

export default function TechLinks() {
  const [links, setLinks] = useState([])
  const [form, setForm] = useState(vazio())
  const [editando, setEditando] = useState(null) // índice em edição, ou null
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)

  const carregar = () =>
    getTechLinks()
      .then((d) => {
        setLinks(d.links || [])
        setErro('')
      })
      .catch((e) => setErro(e.response?.data?.detail || String(e.message || e)))

  useEffect(() => {
    carregar()
  }, [])

  const persistir = async (nova) => {
    try {
      const d = await saveTechLinks(nova)
      setLinks(d.links || nova)
      setErro('')
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2000)
    } catch (e) {
      setErro(e.response?.data?.detail || String(e.message || e))
    }
  }

  const aoAdicionar = () => {
    if (!form.nome.trim() || !form.url.trim()) {
      setErro(t('Preencha ao menos nome e URL.'))
      return
    }
    const novo = {
      nome: form.nome.trim(),
      url: form.url.trim(),
      categoria: form.categoria.trim() || 'Notícias',
      descricao: form.descricao,
    }
    setForm(vazio())
    persistir([...links, novo])
  }

  const aoSalvarEdicao = (i) => {
    const atual = links[i]
    if (!atual.nome.trim() || !atual.url.trim()) {
      setErro(t('Preencha ao menos nome e URL.'))
      return
    }
    const nova = links.map((l, j) =>
      j === i
        ? {
            nome: l.nome.trim(),
            url: l.url.trim(),
            categoria: (l.categoria || '').trim() || 'Notícias',
            descricao: l.descricao || '',
          }
        : l,
    )
    setEditando(null)
    persistir(nova)
  }

  const aoRemover = (i) => {
    if (!window.confirm(t('Remover este atalho?'))) return
    persistir(links.filter((_, j) => j !== i))
  }

  const mudar = (i, campo, valor) =>
    setLinks(links.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))

  const grupos = useMemo(() => {
    const ordem = []
    const porCat = {}
    links.forEach((l, i) => {
      const cat = (l.categoria || '').trim() || 'Geral'
      if (!porCat[cat]) {
        porCat[cat] = []
        ordem.push(cat)
      }
      porCat[cat].push([i, l])
    })
    return ordem.map((cat) => [cat, porCat[cat]])
  }, [links])

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h2>{t('Novidades de tecnologia')}</h2>
      <p style={{ opacity: 0.7 }}>
        {t('Clique num cartão para abrir no navegador.')}
      </p>
      {erro && <p style={{ color: 'var(--danger, #c00)' }}>{erro}</p>}
      {salvo && <p style={{ color: 'var(--ok, #090)' }}>{t('Salvo!')}</p>}

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 20,
          alignItems: 'flex-end',
        }}
      >
        <label>
          {t('Nome')}
          <br />
          <input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="daily.dev"
          />
        </label>
        <label>
          {t('URL')}
          <br />
          <input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://…"
            style={{ width: 260 }}
          />
        </label>
        <label>
          {t('Categoria')}
          <br />
          <input
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            placeholder={t("Notícias")}
          />
        </label>
        <label>
          {t('Descrição')}
          <br />
          <input
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder={t("O que tem de bom aqui")}
            style={{ width: 260 }}
          />
        </label>
        <button onClick={aoAdicionar}>+ {t('Adicionar atalho')}</button>
      </div>

      {links.length === 0 && <p style={{ opacity: 0.6 }}>{t('Nenhum atalho salvo ainda.')}</p>}

      {grupos.map(([cat, itens]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <h4 style={{ textTransform: 'uppercase', opacity: 0.6 }}>{cat}</h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {itens.map(([i, l]) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border, #ccc)',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                {editando === i ? (
                  <>
                    <input
                      value={l.nome}
                      onChange={(e) => mudar(i, 'nome', e.target.value)}
                      placeholder={t("Nome")}
                      style={{ width: '100%', marginBottom: 6 }}
                    />
                    <input
                      value={l.url}
                      onChange={(e) => mudar(i, 'url', e.target.value)}
                      placeholder="https://…"
                      style={{ width: '100%', marginBottom: 6 }}
                    />
                    <input
                      value={l.categoria || ''}
                      onChange={(e) => mudar(i, 'categoria', e.target.value)}
                      placeholder={t("Categoria")}
                      style={{ width: '100%', marginBottom: 6 }}
                    />
                    <input
                      value={l.descricao || ''}
                      onChange={(e) => mudar(i, 'descricao', e.target.value)}
                      placeholder={t("Descrição")}
                      style={{ width: '100%', marginBottom: 6 }}
                    />
                    <button onClick={() => aoSalvarEdicao(i)}>{t('Salvar')}</button>{' '}
                    <button onClick={() => { setEditando(null); carregar() }}>
                      {t('Cancelar')}
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <strong>{l.nome}</strong>
                      <button
                        onClick={() => aoRemover(i)}
                        title={t("Remover atalho")}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                    {l.descricao && (
                      <p style={{ opacity: 0.75, margin: '6px 0' }}>{l.descricao}</p>
                    )}
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.url}
                    </a>
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => setEditando(i)}>{t('Editar')}</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
