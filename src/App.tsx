import React, { Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Layout } from '@/components/Layout'

// ─── Lazy pages ──────────────────────────────────────────────────────────────
const Login          = React.lazy(() => import('@/pages/Login'))
const Dashboard      = React.lazy(() => import('@/pages/Dashboard'))
const Colaboradores  = React.lazy(() => import('@/pages/Colaboradores'))
const Obras          = React.lazy(() => import('@/pages/Obras'))
const Funcoes        = React.lazy(() => import('@/pages/Funcoes'))
const Epis           = React.lazy(() => import('@/pages/Epis'))
const Ocorrencias    = React.lazy(() => import('@/pages/Ocorrencias'))
const Documentos     = React.lazy(() => import('@/pages/Documentos'))
const Ponto          = React.lazy(() => import('@/pages/Ponto'))
const Pagamentos     = React.lazy(() => import('@/pages/Pagamentos'))
const Premios        = React.lazy(() => import('@/pages/Premios'))
const ValeTransportePage = React.lazy(() => import('@/pages/ValeTransportePage'))
const Provisoes      = React.lazy(() => import('@/pages/Provisoes'))
const Relatorios     = React.lazy(() => import('@/pages/Relatorios'))
const Configuracoes  = React.lazy(() => import('@/pages/Configuracoes'))

// ─── Full-page loading spinner ───────────────────────────────────────────────
function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

// ─── Not Found ───────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 gap-4">
      <span className="text-6xl font-bold text-muted-foreground/30">404</span>
      <p className="text-muted-foreground text-sm">Página não encontrada</p>
    </div>
  )
}

// ─── Private Route ───────────────────────────────────────────────────────────
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}

// ─── App ─────────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <HashRouter>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* Private — wrapped in Layout */}
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Dashboard />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/colaboradores"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Colaboradores />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/obras"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Obras />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/funcoes"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Funcoes />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/epis"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Epis />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/ocorrencias"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Ocorrencias />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route path="/acidentes" element={<Navigate to="/ocorrencias" replace />} />
              <Route path="/atestados" element={<Navigate to="/ocorrencias" replace />} />
              <Route
                path="/documentos"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Documentos />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/ponto"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Ponto />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/pagamentos"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Pagamentos />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/premios"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Premios />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/vt"
                element={
                  <PrivateRoute>
                    <Layout>
                      <ValeTransportePage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/provisoes"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Provisoes />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/relatorios"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Relatorios />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Configuracoes />
                    </Layout>
                  </PrivateRoute>
                }
              />

              {/* 404 */}
              <Route
                path="*"
                element={
                  <PrivateRoute>
                    <Layout>
                      <NotFound />
                    </Layout>
                  </PrivateRoute>
                }
              />
            </Routes>
          </Suspense>
        </HashRouter>

        {/* Sonner toast notifications */}
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
