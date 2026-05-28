import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

type Form = z.infer<typeof schema>

export function Login() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    setLoading(true)
    try {
      const res = await authApi.login(data)
      setAuth(res.user, res.access_token)
      navigate('/')
    } catch (e: any) {
      toast(e.message || 'Error al iniciar sesión', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/[0.04] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/25">
            <span className="text-xl font-bold text-primary tracking-tight">FM</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">FinanceMaster</h1>
            <p className="text-sm text-muted-foreground mt-1">Tus finanzas, bajo control</p>
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-white/[0.07] bg-card p-6 shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          <h2 className="text-base font-semibold text-foreground mb-5">Iniciar sesión</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input
                type="email"
                placeholder="tu@email.com"
                className="bg-white/[0.04] border-white/[0.08] focus:border-primary/40 focus:ring-primary/20"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contraseña</Label>
              <Input
                type="password"
                placeholder="••••••••"
                className="bg-white/[0.04] border-white/[0.08] focus:border-primary/40 focus:ring-primary/20"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          ¿Sin cuenta?{' '}
          <Link to="/registro" className="text-primary/80 hover:text-primary transition-colors">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
