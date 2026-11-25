import { useEffect, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import CommandPalette from './CommandPalette.jsx'
import WorkspaceSelector from '../components/WorkspaceSelector.jsx'
import ProjectSelector from '../components/ProjectSelector.jsx'

// Estrutura do app: sidebar fixa (rail opcional) + topbar + conteúdo rolável.
// O menu vira gaveta no mobile; a rail é persistida por usuário.
export default function AppShell({ children }) {
  const [rail, setRail] = useState(() => {
    try { return localStorage.getItem('relay.sidebarRail') === '1' } catch { return false }
  })
  const [navOpen, setNavOpen] = useState(false)
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('relay.sidebarRail', rail ? '1' : '0') } catch { /* modo privado */ }
  }, [rail])

  // ⌘K / Ctrl+K abre a busca global
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      {/* desktop: sidebar fixa */}
      <div className="hidden md:flex">
        <Sidebar rail={rail} onToggleRail={() => setRail((v) => !v)} onNavigate={() => {}}>
          <div className="space-y-2 px-3">
            <WorkspaceSelector />
            <ProjectSelector />
          </div>
        </Sidebar>
      </div>

      {/* mobile: gaveta */}
      {navOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-fg/40 backdrop-blur-sm"
            onClick={() => setNavOpen(false)}
          />
          <div className="relative h-full w-[min(84vw,300px)] shadow-lg">
            <Sidebar rail={false} onToggleRail={() => setRail(false)} onNavigate={() => setNavOpen(false)}>
              <div className="space-y-2 px-3">
                <WorkspaceSelector />
                <ProjectSelector />
              </div>
            </Sidebar>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenPalette={() => setPalette(true)} onOpenNav={() => setNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="app-container py-6 md:py-8">{children}</div>
        </main>
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  )
}
