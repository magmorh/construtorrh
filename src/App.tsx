import React, { Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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
const ProvisaoRescisao = React.lazy(() => import('@/pages/ProvisaoRescisao'))
const Relatorios     = React.lazy(() => import('@/pages/Relatorios'))
const Configuracoes  = React.lazy(() => import('@/pages/Configuracoes'))
const Playbooks         = React.lazy(() => import('@/pages/Playbooks'))
const Feriados          = React.lazy(() => import('@/pages/Feriados'))
const FechamentoPonto   = React.lazy(() => import('@/pages/FechamentoPonto'))
const Usuarios       = React.lazy(() => import('@/pages/Usuarios'))
const EncargosPage   = React.lazy(() => import('@/pages/EncargosPage'))
const Adiantamentos  = React.lazy(() => import('@/pages/Adiantamentos'))
const PortalAdmin    = React.lazy(() => import('@/pages/PortalAdmin'))
const Solicitacoes   = React.lazy(() => import('@/pages/Solicitacoes'))
const Juridico       = React.lazy(() => import('@/pages/Juridico'))
const Contratos      = React.lazy(() => import('@/pages/Contratos'))
// Portal externo (sem Layout principal)
const PortalLogin        = React.lazy(() => import('@/pages/portal/PortalLogin'))
const PortalHome         = React.lazy(() => import('@/pages/portal/PortalHome'))
const PortalPonto        = React.lazy(() => import('@/pages/portal/PortalPonto'))
const PortalOcorrencias  = React.lazy(() => import('@/pages/portal/PortalOcorrencias'))
const PortalSolicitacoes = React.lazy(() => import('@/pages/portal/PortalSolicitacoes'))
const PortalProducao     = React.lazy(() => import('@/pages/portal/PortalProducao'))
const PortalEpis         = React.lazy(() => import('@/pages/portal/PortalEpis'))
const PortalDocumentos   = React.lazy(() => import('@/pages/portal/PortalDocumentos'))
const PortalPlaybook     = React.lazy(() => import('@/pages/portal/PortalPlaybook'))
const PortalMensagens    = React.lazy(() => import('@/pages/portal/PortalMensagens'))
const PortalProjetos     = React.lazy(() => import('@/pages/portal/PortalProjetos'))
const PortalLancamentos  = React.lazy(() => import('@/pages/portal/PortalLancamentos'))
const PortalClima        = React.lazy(() => import('@/pages/portal/PortalClima'))
const MensagensAdmin     = React.lazy(() => import('@/pages/MensagensAdmin'))
const CestaBasica        = React.lazy(() => import('@/pages/CestaBasica'))
const Contracheques      = React.lazy(() => import('@/pages/Contracheques'))
const PortalContracheque = React.lazy(() => import('@/pages/portal/PortalContracheque'))

// Portal do Gestor
const GestorDashboard    = React.lazy(() => import('@/pages/gestor/GestorDashboard'))
const GestorPresenca     = React.lazy(() => import('@/pages/gestor/GestorPresenca'))
const GestorProducao     = React.lazy(() => import('@/pages/gestor/GestorProducao'))
const GestorAtestados    = React.lazy(() => import('@/pages/gestor/GestorAtestados'))
const GestorAcidentes    = React.lazy(() => import('@/pages/gestor/GestorAcidentes'))
const GestorMeteorologia = React.lazy(() => import('@/pages/gestor/GestorMeteorologia'))
const GestorRelatorios   = React.lazy(() => import('@/pages/gestor/GestorRelatorios'))
const GestorLogin        = React.lazy(() => import('@/pages/gestor/GestorLogin'))
const GestorAdmin        = React.lazy(() => import('@/pages/gestor/GestorAdmin'))

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

// ─── Master Route ─────────────────────────────────────────────────────────────
const MASTER_EMAIL = 'magmodrive@gmail.com'

function MasterRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.email !== MASTER_EMAIL) {
    return (
      <Layout>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16 }}>
          <span style={{ fontSize:48 }}>🔒</span>
          <h2 style={{ fontSize:20, fontWeight:700, margin:0 }}>Acesso Restrito</h2>
          <p style={{ color:'var(--muted-foreground)', textAlign:'center', maxWidth:360 }}>
            Esta área é restrita ao administrador master do sistema.
          </p>
        </div>
      </Layout>
    )
  }
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
          <ErrorBoundary>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* ── Portal Externo (público, sem Layout) ── */}
              <Route path="/portal"            element={<PortalLogin />} />
              <Route path="/portal/home"       element={<PortalHome />} />
              <Route path="/portal/ponto"         element={<PortalPonto />} />
              <Route path="/portal/ocorrencias"   element={<PortalOcorrencias />} />
              <Route path="/portal/solicitacoes"  element={<PortalSolicitacoes />} />
              <Route path="/portal/producao"      element={<PortalProducao />} />
              <Route path="/portal/epis"          element={<PortalEpis />} />
              <Route path="/portal/documentos"    element={<PortalDocumentos />} />
              <Route path="/portal/playbook"      element={<PortalPlaybook />} />
              <Route path="/portal/mensagens"     element={<PortalMensagens />} />
              <Route path="/portal/projetos"      element={<PortalProjetos />} />
              <Route path="/portal/lancamentos"   element={<PortalLancamentos />} />
              <Route path="/portal/clima"          element={<PortalClima />} />

              {/* Login do Gestor — público */}
              <Route path="/gestor-login" element={<GestorLogin />} />

              {/* Portal do Gestor — privado (gestor OU admin logado) */}
              <Route path="/gestor" element={<GestorDashboard />} />
              <Route path="/gestor/presenca" element={<GestorPresenca />} />
              <Route path="/gestor/producao" element={<GestorProducao />} />
              <Route path="/gestor/atestados" element={<GestorAtestados />} />
              <Route path="/gestor/acidentes" element={<GestorAcidentes />} />
              <Route path="/gestor/meteorologia" element={<GestorMeteorologia />} />
              <Route path="/gestor/relatorios" element={<GestorRelatorios />} />
              {/* Admin: gerenciar gestores — só master */}
              <Route path="/gestor-admin" element={<PrivateRoute><Layout><GestorAdmin /></Layout></PrivateRoute>} />

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
                path="/playbooks"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Playbooks />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/feriados"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Feriados />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/fechamento-ponto"
                element={
                  <PrivateRoute>
                    <Layout>
                      <FechamentoPonto />
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
              <Route
                path="/juridico"
                element={
                  <PrivateRoute>
                    <Layout><Juridico /></Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/contratos"
                element={
                  <PrivateRoute>
                    <Layout><Contratos /></Layout>
                  </PrivateRoute>
                }
              />
              <Route path="/rescisoes" element={<Navigate to="/provisoes" replace />} />
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
                path="/adiantamentos"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Adiantamentos />
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
                path="/cesta-basica"
                element={
                  <PrivateRoute>
                    <Layout>
                      <CestaBasica />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/encargos"
                element={
                  <PrivateRoute>
                    <Layout>
                      <EncargosPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/provisoes"
                element={
                  <PrivateRoute>
                    <Layout>
                      <ProvisaoRescisao />
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
              <Route
                path="/usuarios"
                element={
                  <MasterRoute>
                    <Layout>
                      <Usuarios />
                    </Layout>
                  </MasterRoute>
                }
              />
              <Route
                path="/portal-admin"
                element={
                  <MasterRoute>
                    <Layout>
                      <PortalAdmin />
                    </Layout>
                  </MasterRoute>
                }
              />
              <Route
                path="/solicitacoes"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Solicitacoes />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/mensagens"
                element={
                  <PrivateRoute>
                    <Layout>
                      <MensagensAdmin />
                    </Layout>
                  </PrivateRoute>
                }
              />

              <Route
                path="/contracheques"
                element={
                  <PrivateRoute>
                    <Layout>
                      <Contracheques />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route path="/portal/contracheque" element={<PortalContracheque />} />

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
          </ErrorBoundary>
        </HashRouter>

        {/* Sonner toast notifications */}
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
