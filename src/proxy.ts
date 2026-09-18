import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const protectedRoutes = [
  '/dashboard',
  '/questoes',
  '/simulados',
  '/revisoes',
  '/desempenho',
  '/estudar',
  '/concursos',
  '/perfil',
  '/admin',
]
const authRoutes = ['/login', '/register', '/reset-password']

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie))
  return to
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  const isAuthRoute = authRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  const response = NextResponse.next()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return isProtected
      ? new NextResponse('Aplicativo temporariamente indisponível.', { status: 503 })
      : response
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getUser valida o token no servidor; getSession apenas confiaria no cookie local.
  const { data: { user } } = await supabase.auth.getUser()

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return copyCookies(response, NextResponse.redirect(loginUrl))
  }

  if (isProtected && user) {
    const [{ data: administrator, error: adminError }, { data: access, error: accessError }] = await Promise.all([
      supabase.from('administradores').select('usuario_id').eq('usuario_id', user.id).maybeSingle(),
      supabase.from('acessos_estudante').select('status, expira_em').eq('usuario_id', user.id).maybeSingle(),
    ])
    const accessMigrationPending = adminError?.code === 'PGRST205' || accessError?.code === 'PGRST205'
    const active = administrator || (access?.status === 'ativo' && new Date(access.expira_em).getTime() > Date.now())
    if (!accessMigrationPending && !active) {
      return copyCookies(response, NextResponse.redirect(new URL('/acesso-expirado', request.url)))
    }
  }

  if (isAuthRoute && user) {
    return copyCookies(response, NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
