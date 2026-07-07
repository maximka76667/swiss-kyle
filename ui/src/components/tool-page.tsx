interface Props {
  title: string
  description: React.ReactNode
  children: React.ReactNode
}

export function ToolPage({ title, description, children }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 pb-24">
      <div className="w-full max-w-2xl">
        <h1 className="text-center text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}
