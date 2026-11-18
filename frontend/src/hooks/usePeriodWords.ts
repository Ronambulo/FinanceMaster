import { periodWords } from '@/lib/cycles'
import { usePreferencesStore } from '@/store/preferences'
import { usePayrollCycle } from './usePayrollCycle'

/** "ciclo" o "mes" según cómo se cuentan los periodos (Perfil → primer día). */
export function usePeriodWords() {
  const day = usePreferencesStore(s => s.prefs.month_start)
  const payroll = usePayrollCycle(0)
  // Día 1 = meses naturales; otro día fijo = ciclo; nómina = ciclo si se ha detectado.
  return periodWords(day === 1 ? false : day > 1 || payroll.loading || payroll.isPayrollCycle)
}
