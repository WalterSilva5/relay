import clsx from 'clsx'

// Bloco de carregamento. `w` e `h` recebem classes de largura/altura, então o
// esqueleto acompanha o tamanho real do conteúdo que vai substituir.
export function Skeleton({ w = 'w-full', h = 'h-4', rounded = 'rounded-md', className, ...props }) {
  return (
    <div
      aria-hidden="true"
      className={clsx('animate-pulse bg-border/60', rounded, w, h, className)}
      {...props}
    />
  )
}
