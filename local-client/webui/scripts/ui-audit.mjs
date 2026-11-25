#!/usr/bin/env node
// Auditoria de UI: falha se as páginas voltarem a usar valores soltos.
// Uso: npm run ui:audit  (ou `--warn` para só listar)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const WARN = process.argv.includes('--warn')

// Páginas já migradas (zero ocorrência exigida). As demais seguem em migração.
// Todas as páginas foram migradas; qualquer uma que volte a usar valor solto
// quebra o `npm run ui:audit`.
const PADRAO = 'ApiTester,Assistente,Base,Biblioteca,Board,Configuracoes,Dashboard,Design,Estudos,Ferramentas,Goals,Guia,Ingles,Labels,Memoria,Metricas,MeuDia,Projects,PrReviews,Reunioes,Reviews,Skills,SprintPlanning,TechLinks,Time,Todos,Traducao'
const MIGRATED = new Set(
  (process.env.UI_MIGRATED || PADRAO)
    .split(',').map((s) => s.trim()).filter(Boolean),
)

const problemas = []

function walk(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.jsx?$/.test(nome)) check(p)
  }
}

const RE_HEX = /#[0-9a-fA-F]{3,8}\b/
const RE_PX = /\b\d+(\.\d+)?px\b/
const RE_INLINE = /style=\{\{/

function check(file) {
  const rel = relative(SRC, file).replaceAll('\\', '/')
  const src = readFileSync(file, 'utf8')
  const linhas = src.split('\n')
  const ehPagina = rel.startsWith('pages/')
  const nomePagina = rel.replace('pages/', '').replace('.jsx', '')
  const exigirLimpo = ehPagina && MIGRATED.has(nomePagina)

  linhas.forEach((linha, i) => {
    const n = i + 1
    // ignora comentários
    if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return
    if (ehPagina && RE_INLINE.test(linha)) {
      const permitido = /style=\{\{\s*(width|height|transform|left|top|minWidth|maxWidth)/.test(linha)
      if (!permitido) problemas.push({ rel, n, tipo: 'style inline', trecho: linha.trim().slice(0, 90), exigirLimpo })
    }
    if (ehPagina && RE_HEX.test(linha)) {
      problemas.push({ rel, n, tipo: 'cor hex', trecho: linha.trim().slice(0, 90), exigirLimpo })
    }
    if (ehPagina && RE_PX.test(linha)) {
      problemas.push({ rel, n, tipo: 'valor em px', trecho: linha.trim().slice(0, 90), exigirLimpo })
    }
  })
}

walk(SRC)

if (problemas.length === 0) {
  console.log('ui:audit ok — nenhuma página usa valores soltos.')
  process.exit(0)
}

const bloqueantes = problemas.filter((p) => p.exigirLimpo)
const avisos = problemas.filter((p) => !p.exigirLimpo)

for (const p of problemas) {
  const marca = p.exigirLimpo ? 'ERRO' : 'aviso'
  console.log(`${marca} ${p.rel}:${p.n} · ${p.tipo} · ${p.trecho}`)
}
console.log(
  `\n${bloqueantes.length} bloqueante(s) nas páginas migradas · ${avisos.length} aviso(s) nas demais.`,
)
process.exit(WARN ? 0 : bloqueantes.length ? 1 : 0)
