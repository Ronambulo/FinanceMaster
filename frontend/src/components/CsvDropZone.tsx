import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { ImportCsvDialog } from '@/components/ImportCsvDialog'

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/* Atajo oculto: mientras la página que lo monta está visible, soltar un CSV en
   cualquier parte abre la revisión de importación (pensado para las órdenes de
   MyInvestor en Portfolio). Solo se muestra algo al arrastrar un archivo. */
export function CsvDropZone() {
  const { toast } = useToast()
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const depth = useRef(0)
  // Con el modal abierto, su propia zona de carga es la que manda
  const dialogOpen = useRef(false)
  dialogOpen.current = !!file

  useEffect(() => {
    function onEnter(e: DragEvent) {
      if (!hasFiles(e) || dialogOpen.current) return
      depth.current += 1
      setDragging(true)
    }
    function onOver(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault() // permite soltar y evita que el navegador abra el archivo
      if (dialogOpen.current) return
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    function onLeave(e: DragEvent) {
      if (!hasFiles(e) || dialogOpen.current) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault() // fuera de la zona de carga del modal, no navegar al archivo
      if (dialogOpen.current) return
      depth.current = 0
      setDragging(false)
      const dropped = e.dataTransfer?.files?.[0]
      if (!dropped) return
      if (!/\.csv$/i.test(dropped.name) && dropped.type !== 'text/csv') {
        toast('Solo se pueden importar archivos CSV', 'error')
        return
      }
      setFile(dropped)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [toast])

  return (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm animate-in fade-in-0">
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-card/90 px-6 py-10 text-center shadow-lg">
            <Upload className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">Suelta el CSV para revisarlo</p>
            <p className="text-xs text-muted-foreground">Órdenes de MyInvestor o extracto de cualquier banco soportado</p>
          </div>
        </div>
      )}
      <ImportCsvDialog open={!!file} initialFile={file} onClose={() => setFile(null)} />
    </>
  )
}
