import { useState } from 'react'
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, Chip, ConfirmDialog,
  DataTable, Dialog, Divider, EmptyState, Field, Input, PageHeader, Progress,
  RadioGroup, SearchInput, SectionTitle, SegmentedControl, Select, Skeleton,
  Spinner, StatCard, Switch, Tabs, Textarea, Toolbar, Tooltip, useToast,
} from '../ui'
import Icon from '../components/Icon.jsx'

// Catálogo vivo do design system. Fonte da verdade visual: se um componente
// não está aqui, não deve ser usado em página.
export default function Design() {
  const [seg, setSeg] = useState('md')
  const [sel, setSel] = useState('doing')
  const [check, setCheck] = useState(true)
  const [sw, setSw] = useState(true)
  const [radio, setRadio] = useState('a')
  const [busca, setBusca] = useState('')
  const [tab, setTab] = useState('resumo')
  const [dlg, setDlg] = useState(false)
  const [conf, setConf] = useState(false)
  const toast = useToast()

  return (
    <div className="space-y-8">
      <PageHeader
        title="Design system"
        description="Componentes, estados e tamanhos — a referência visual do Relay."
        breadcrumb={[{ label: 'Ferramentas' }, { label: 'Design' }]}
        actions={<Button onClick={() => toast?.({ title: 'Funcionou', description: 'Toast de exemplo', tone: 'success' })}>Testar toast</Button>}
      />

      <section>
        <SectionTitle>Botões</SectionTitle>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button>Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Perigo</Button>
          <Button variant="link">Link</Button>
          <Button loading>Carregando</Button>
          <Button disabled>Desabilitado</Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm">sm</Button>
          <Button>md</Button>
          <Button size="lg">lg</Button>
          <Button iconOnly aria-label="Novo">+</Button>
        </div>
      </section>

      <section>
        <SectionTitle>Campos</SectionTitle>
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          <Field label="Nome" hint="Como aparece no card" required counter="3/60">
            <Input placeholder="Ex.: validar senha do operador" />
          </Field>
          <Field label="Com erro" error="Campo obrigatório">
            <Input invalid defaultValue="" placeholder="Preencha" />
          </Field>
          <Field label="Seleção">
            <Select
              value={sel}
              onValueChange={setSel}
              options={[
                { value: 'todo', label: 'A fazer' },
                { value: 'doing', label: 'Fazendo' },
                { value: 'done', label: 'Concluído' },
              ]}
            />
          </Field>
          <Field label="Busca">
            <SearchInput value={busca} onChange={setBusca} placeholder="Buscar…" />
          </Field>
          <Field label="Texto longo">
            <Textarea placeholder="Descreva o contexto…" />
          </Field>
          <div className="space-y-3">
            <Checkbox label="Contar no progresso" checked={check} onCheckedChange={setCheck} />
            <Switch label="Ocultar por responsável" checked={sw} onCheckedChange={setSw} />
            <RadioGroup
              name="demo"
              value={radio}
              onValueChange={setRadio}
              options={[{ value: 'a', label: 'Opção A' }, { value: 'b', label: 'Opção B' }]}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Indicadores</SectionTitle>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Tarefas" value={349} icon={<Icon name="clipboard" size={18} />} />
          <StatCard label="Entregues" value={234} icon={<Icon name="check" size={18} />} delta={{ value: '67%', tone: 'success' }} />
          <StatCard label="Lead time (h)" value={187} icon={<Icon name="activity" size={18} />} />
          <StatCard label="Atenção" value={12} icon={<Icon name="activity" size={18} />} tone="warning" hint="paradas há 14 dias" />
        </div>
        <div className="mt-3 space-y-2">
          <Progress value={67} />
          <Progress value={92} tone="success" />
          <Progress value={35} tone="warning" />
        </div>
      </section>

      <section>
        <SectionTitle>Etiquetas e avatares</SectionTitle>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge>Neutro</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="success">OK</Badge>
          <Badge variant="warning">Atenção</Badge>
          <Badge variant="danger">Atrasado</Badge>
          <Badge variant="outline">Outline</Badge>
          <Chip dot>Em teste</Chip>
          <Avatar name="Walter Silva" />
          <Avatar name="Jeferson" size="sm" />
          <Tooltip content="Tooltip no hover"><Button variant="ghost" size="sm">Hover aqui</Button></Tooltip>
        </div>
      </section>

      <section>
        <SectionTitle>Navegação e estados</SectionTitle>
        <div className="mt-2 space-y-3">
          <SegmentedControl
            options={[{ value: 'sm', label: 'Compacto' }, { value: 'md', label: 'Padrão' }, { value: 'lg', label: 'Amplo' }]}
            value={seg}
            onChange={setSeg}
          />
          <Tabs
            tabs={[{ value: 'resumo', label: 'Resumo' }, { value: 'transcricao', label: 'Transcrição', badge: 2 }]}
            value={tab}
            onValueChange={setTab}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDlg(true)}>Abrir diálogo</Button>
            <Button variant="danger" onClick={() => setConf(true)}>Excluir…</Button>
          </div>
          <EmptyState title="Nada por aqui" description="Quando houver dados, eles aparecem nesta área." action={<Button size="sm">Criar</Button>} />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Spinner />
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Tabela</SectionTitle>
        <Card className="mt-2 p-0">
          <DataTable
            columns={[
              { key: 'code', header: 'Código', width: 'w-28' },
              { key: 'title', header: 'Título' },
              { key: 'status', header: 'Status', render: (r) => <Badge variant={r.tone}>{r.status}</Badge> },
              { key: 'when', header: 'Atualizado', align: 'right', hideOnMobile: true },
            ]}
            rows={[
              { code: 'MIG-14669', title: 'Venda: atualizar documento', status: 'Em teste', tone: 'warning', when: '23/11' },
              { code: 'MIG-13879', title: 'Card arquivado', status: 'Concluído', tone: 'success', when: '23/11' },
            ]}
            rowKey={(r) => r.code}
          />
        </Card>
      </section>

      <Divider />
      <p className="text-xs text-fg-muted">
        Regra: página não escreve px nem hex. Só usa estes componentes e as classes do tema.
      </p>

      <Dialog open={dlg} onOpenChange={setDlg} title="Diálogo de exemplo" description="Título, descrição e conteúdo com foco preso." footer={<Button onClick={() => setDlg(false)}>Fechar</Button>}>
        <p className="text-base text-fg-muted">Conteúdo do diálogo, com rolagem quando necessário.</p>
      </Dialog>

      <ConfirmDialog
        open={conf}
        onOpenChange={setConf}
        title="Excluir reunião?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={() => { setConf(false); toast?.({ title: 'Excluído', tone: 'success' }) }}
      />
    </div>
  )
}
