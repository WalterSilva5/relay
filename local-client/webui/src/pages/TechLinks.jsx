import { useEffect, useMemo, useState } from 'react'
import { getTechLinks, saveTechLinks } from '../api-techlinks'
import { t } from '../i18n'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  useToast,
} from '../ui'
import Icon from '../components/Icon.jsx'

const vazio = () => ({ nome: '', url: '', categoria: 'Notícias', descricao: '' })

export default function TechLinks() {
  const [links, setLinks] = useState([])
  const [form, setForm] = useState(vazio())
  const [editando, setEditando] = useState(null) // índice em edição, ou null
  const [removendo, setRemovendo] = useState(null) // índice aguardando confirmação
  const [erro, setErro] = useState('')
  const toast = useToast()

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
      toast({ title: t('Salvo!'), tone: 'success' })
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
    setRemovendo(i)
  }

  const confirmarRemocao = async () => {
    if (removendo === null) return
    await persistir(links.filter((_, j) => j !== removendo))
    setRemovendo(null)
  }

  const copiar = async (url) => {
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: t('Copiado!'), tone: 'success' })
    } catch (e) {
      setErro(e.response?.data?.detail || String(e.message || e))
    }
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
    <div className="space-y-6">
      <PageHeader
        title={t('Novidades de tecnologia')}
        description={t('Clique num cartão para abrir no navegador.')}
      />

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label={t('Nome')}>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="daily.dev"
            />
          </Field>
          <Field label={t('URL')}>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…"
            />
          </Field>
          <Field label={t('Categoria')}>
            <Input
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              placeholder={t('Notícias')}
            />
          </Field>
          <Field label={t('Descrição')}>
            <Input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder={t('O que tem de bom aqui')}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Button onClick={aoAdicionar}>
            <Icon name="plus" size={14} /> {t('Adicionar atalho')}
          </Button>
        </div>
      </Card>

      {links.length === 0 && <EmptyState title={t('Nenhum atalho salvo ainda.')} />}

      {grupos.map(([cat, itens]) => (
        <section key={cat} className="space-y-2">
          <SectionTitle>{cat}</SectionTitle>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {itens.map(([i, l]) => (
              <Card key={i} padding="sm" className="flex flex-col gap-2">
                {editando === i ? (
                  <div className="space-y-2">
                    <Field label={t('Nome')}>
                      <Input value={l.nome} onChange={(e) => mudar(i, 'nome', e.target.value)} placeholder={t('Nome')} />
                    </Field>
                    <Field label={t('URL')}>
                      <Input value={l.url} onChange={(e) => mudar(i, 'url', e.target.value)} placeholder="https://…" />
                    </Field>
                    <Field label={t('Categoria')}>
                      <Input value={l.categoria || ''} onChange={(e) => mudar(i, 'categoria', e.target.value)} placeholder={t('Categoria')} />
                    </Field>
                    <Field label={t('Descrição')}>
                      <Input value={l.descricao || ''} onChange={(e) => mudar(i, 'descricao', e.target.value)} placeholder={t('Descrição')} />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => aoSalvarEdicao(i)}>
                        {t('Salvar')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setEditando(null); carregar() }}>
                        {t('Cancelar')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 text-md font-semibold text-fg">{l.nome}</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={t('Remover atalho')}
                        title={t('Remover atalho')}
                        onClick={() => aoRemover(i)}
                      >
                        <Icon name="close" size={14} />
                      </Button>
                    </div>

                    {l.descricao && <p className="text-sm text-fg-muted">{l.descricao}</p>}

                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm text-accent hover:underline"
                    >
                      {l.url}
                    </a>

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <Button variant="secondary" size="sm" onClick={() => setEditando(i)}>
                        {t('Editar')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => copiar(l.url)}>
                        <Icon name="clipboard" size={14} /> {t('Copiar')}
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            ))}
          </div>
        </section>
      ))}

      <ConfirmDialog
        open={removendo !== null}
        onOpenChange={(open) => { if (!open) setRemovendo(null) }}
        title={t('Remover este atalho?')}
        description={removendo !== null ? links[removendo]?.nome : undefined}
        confirmLabel={t('Remover atalho')}
        tone="danger"
        onConfirm={confirmarRemocao}
      />
    </div>
  )
}
