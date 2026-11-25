// Separa classes de largura das demais. Os primitivos usam a largura no
// wrapper (o controle interno é sempre w-full); assim `w-40`, `sm:w-72` etc.
// funcionam sem brigar com o `w-full` interno na ordem do CSS do Tailwind.
const WIDTH = /(^|:)(w|min-w|max-w|basis)-|(^|:)(flex-(1|auto|initial|none)|grow|grow-0|shrink|shrink-0)$/

export function splitWidthClasses(className = '') {
  const parts = String(className).split(/\s+/).filter(Boolean)
  const widths = parts.filter((c) => WIDTH.test(c))
  const rest = parts.filter((c) => !WIDTH.test(c))
  return { widths, rest }
}
