import { Navigate } from "react-router-dom";

export default function Comparativo() {
  return <Navigate to="/relatorios?aba=comparativos&visao=completa" replace />;
}
