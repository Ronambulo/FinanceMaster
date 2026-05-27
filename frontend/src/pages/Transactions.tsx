import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { txApi, catApi } from '@/lib/api'
import type { Transaction, Category } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Upload, Search, ChevronLeft, ChevronRight, Loader2, Tag, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

function CategoryPicker({ categories, value, onChange }: { categories: Category[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <Select value={value?.toString() || ''} onValueChange={v => onChange(Number(v))}>
      <SelectTrigger className="h-7 text-xs w-40">
        <SelectValue placeholder="Categoría..." />
      </SelectTrigger>
      <SelectContent>
        {categories.map(c => (
          <SelectItem key={c.id} value={c.id.toString()}>
            {c.icon} {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<{ imported: number; skipped_duplicates: number; errors: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const res = await txApi.importCsv(file)
      setResult(res)
      qc.invalidateQueries()
      toast(`Importadas ${res.imported} transacciones`, 'success')
    } catch (err: any) {
      toast(err.message || 'Error al importar', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Importar CSV de Trade Republic</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Haz clic para seleccionar el CSV</p>
            <p className="text-xs text-muted-foreground mt-1">Exportación de transacción.csv</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando...
            </div>
          )}
          {result && (
            <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
              <p className="text-emerald-400">✓ {result.imported} transacciones importadas</p>
              {result.skipped_duplicates > 0 && <p className="text-muted-foreground">↷ {result.skipped_duplicates} duplicadas omitidas</p>}
              {result.errors > 0 && <p className="text-red-400">✗ {result.errors} errores</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Transactions() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>('')
  const [importOpen, setImportOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<number | null>(null)

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, search, catFilter],
    queryFn: () => txApi.list({
      page,
      page_size: 25,
      account_category: 'CASH',
      ...(search ? { search } : {}),
      ...(catFilter ? { category_id: catFilter } : {}),
    }),
    placeholderData: prev => prev,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) => txApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['by-cat'] })
      setEditingCat(null)
      toast('Categoría actualizada', 'success')
    },
  })

  const totalPages = data ? Math.ceil(data.total / 25) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transacciones</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} transacciones</p>
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4 mr-2" /> Importar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o descripción..."
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select value={catFilter} onValueChange={v => { setCatFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories?.map(c => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.icon} {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium">Descripción</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Categoría</th>
                    <th className="text-right px-4 py-3 font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map(tx => (
                    <tr key={tx.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{tx.category?.icon || '💳'}</span>
                          <div>
                            <p className="font-medium truncate max-w-[180px]">{tx.name || tx.description || tx.type}</p>
                            <div className="flex gap-1 mt-0.5">
                              {tx.is_auto_categorized && !tx.is_internal_transfer && (
                                <Badge variant="warning" className="text-xs py-0">Auto</Badge>
                              )}
                              {!tx.category_id && (
                                <Badge variant="muted" className="text-xs py-0">Sin cat.</Badge>
                              )}
                              {tx.is_internal_transfer && (
                                <Badge variant="muted" className="text-xs py-0">Interna</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {editingCat === tx.id ? (
                          <div className="flex items-center gap-1">
                            <CategoryPicker
                              categories={categories || []}
                              value={tx.category_id}
                              onChange={id => updateMutation.mutate({ id: tx.id, data: { category_id: id } })}
                            />
                            <button onClick={() => setEditingCat(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingCat(tx.id)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
                          >
                            {tx.category ? (
                              <span style={{ color: tx.category.color }}>{tx.category.icon} {tx.category.name}</span>
                            ) : (
                              <span className="text-muted-foreground flex items-center gap-1"><Tag className="h-3 w-3" /> Asignar</span>
                            )}
                          </button>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data?.items.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">No se encontraron transacciones</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
