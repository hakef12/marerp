import { createBrowserRouter, Outlet } from 'react-router';
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POSComplete";
import Mesas from "./pages/Mesas";
import Caja from "./pages/Caja";
import Inventario from "./pages/Inventario";
import Contabilidad from "./pages/Contabilidad";
import TalentoHumano from "./pages/TalentoHumano";
import Cocina from "./pages/Cocina";
import Auditoria from "./pages/Auditoria";
import BusinessIntelligence from "./pages/BusinessIntelligence";
import IngenieriaMenu from "./pages/IngenieriaMenu";
import SuperAdmin from "./pages/SuperAdmin";
import Usuarios from "./pages/Usuarios";
import Proyectos from "./pages/Proyectos";
import ConfiguracionFacturacion from "./pages/ConfiguracionFacturacion";
import ConsultaFacturas from "./pages/ConsultaFacturas";
import ConsultaRetenciones from "./pages/ConsultaRetenciones";
import ConfiguracionSistema from "./pages/ConfiguracionSistema";
import Suscripcion from "./pages/Suscripcion";
import Produccion from "./pages/Produccion";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/AppLayout";
import KDSScreen from "./pages/KDSScreen";
import RequireAuth from "./components/RequireAuth";

// Componente Root que renderiza el layout con Outlet para las rutas hijas
function Root() {
  return <AppLayout />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Dashboard },
      { path: "pos", Component: POS },
      { path: "mesas", Component: Mesas },
      { path: "caja", Component: Caja },
      { path: "inventario", Component: Inventario },
      { path: "contabilidad", Component: Contabilidad },
      { path: "rrhh", Component: TalentoHumano },
      { path: "cocina", Component: Cocina },
      { path: "auditoria", Component: Auditoria },
      { path: "bi", Component: BusinessIntelligence },
      { path: "ingenieria-menu", Component: IngenieriaMenu },
      { path: "usuarios", Component: Usuarios },
      { path: "admin", Component: SuperAdmin },
      { path: "proyectos", Component: Proyectos },
      { path: "facturacion/configuracion", Component: ConfiguracionFacturacion },
      { path: "facturacion/consulta", Component: ConsultaFacturas },
      { path: "facturacion/retenciones", Component: ConsultaRetenciones },
      { path: "configuracion", Component: ConfiguracionSistema },
      { path: "suscripcion", Component: Suscripcion },
      { path: "produccion", Component: Produccion },
      { path: "*", Component: NotFound },
    ],
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/kds",
    element: (
      <RequireAuth>
        <KDSScreen />
      </RequireAuth>
    ),
  },
]);