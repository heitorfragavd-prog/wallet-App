import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Pencil } from "lucide-react";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function EquipePage() {
  const { data: colaboradores, isLoading } = useColaboradores();
  const navigate = useNavigate();
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "socio" | "funcionario">("todos");

  const filtrados = colaboradores?.filter(c => filtroTipo === "todos" || c.tipo === filtroTipo) ?? [];
  const socios = filtrados.filter(c => c.tipo === "socio");
  const funcionarios = filtrados.filter(c => c.tipo === "funcionario");

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Equipe
            </h1>
            <p className="text-sm text-muted-foreground">
              {socios.length} sócio(s) · {funcionarios.length} colaborador(es)
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setFiltroTipo("todos")} className={filtroTipo === "todos" ? "bg-primary text-primary-foreground" : ""}>Todos</Button>
            <Button variant="outline" size="sm" onClick={() => setFiltroTipo("socio")} className={filtroTipo === "socio" ? "bg-primary text-primary-foreground" : ""}>Sócios</Button>
            <Button variant="outline" size="sm" onClick={() => setFiltroTipo("funcionario")} className={filtroTipo === "funcionario" ? "bg-primary text-primary-foreground" : ""}>Funcionários</Button>
            <Button variant="outline" size="sm" onClick={() => setFiltroTipo("folguista")} className={filtroTipo === "folguista" ? "bg-primary text-primary-foreground" : ""}>Folguistas</Button>
            <Button size="sm" onClick={() => navigate("/equipe/novo")}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Users className="h-12 w-12 opacity-30" />
            <p className="text-lg">Nenhum integrante cadastrado na equipe</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/equipe/novo")}>
              <Plus className="h-4 w-4 mr-2" /> Cadastrar primeiro colaborador
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtrados.map((col) => {
              const salario = Number(col.salario_bruto) || 0;
              const vt = Number(col.vale_transporte) || 0;
              const vr = Number(col.vale_refeicao) || 0;
              const outros = Number(col.outros_beneficios) || 0;
              const inss = salario * 0.20;
              const fgts = salario * 0.08;
              const decimo = salario / 12;
              const ferias = (salario / 12) * 1.3333;
              const custoReal = salario + inss + fgts + decimo + ferias + vt + vr + outros;
              const custoPorDia = custoReal / 26;

              return (
                <Card 
                  key={col.id} 
                  className="border-border/40 bg-card/60 backdrop-blur-sm cursor-pointer hover:border-primary/50 transition-colors group relative"
                  onClick={() => navigate(`/equipe/${col.id}`)}
                >
                  <CardContent className="p-4">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/equipe/${col.id}/editar`);
                      }}
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <div className="flex items-start gap-3">
                      <Avatar className="h-14 w-14 border border-border/50 shrink-0">
                        <AvatarImage src={col.foto_url || undefined} className="object-cover" style={{ objectPosition: col.foto_posicao || "50% 15%" }} />
                        <AvatarFallback className="bg-primary/20 text-primary font-bold">
                          {col.nome.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground truncate">{col.nome}</p>
                          <Badge variant="outline" className={
                            col.tipo === "socio" ? "border-purple-500/30 text-purple-400" :
                            col.tipo === "folguista" ? "border-sky-500/30 text-sky-400" :
                            "border-emerald-500/30 text-emerald-400"
                          }>
                            {col.tipo === "socio" ? "Sócio" : col.tipo === "folguista" ? "Folguista" : "Funcionário"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{col.cargo || "Sem cargo"}</p>
                        {col.tipo === "funcionario" && col.status === "experiencia" && (
                          <Badge className="mt-1 bg-amber-500/20 text-amber-400 text-xs">Em experiência</Badge>
                        )}
                      </div>
                    </div>

                    {col.tipo === "socio" && (
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Pró-labore</span>
                          <span className="text-foreground font-medium">{formatCurrency(col.salario_bruto)}</span>
                        </div>
                      </div>
                    )}

                    {col.tipo === "folguista" && (
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Valor Fixo</span>
                          <span className="text-foreground">{formatCurrency(col.salario_bruto)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Por dia</span>
                          <span className="text-emerald-400 font-medium">
                            {formatCurrency(col.salario_bruto / 26)}
                          </span>
                        </div>
                        <div className="text-xs text-sky-400 mt-1">
                          👤 Folguista — sem encargos trabalhistas
                        </div>
                      </div>
                    )}

                    {col.tipo === "funcionario" && (
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Salário</span>
                          <span className="text-foreground">{formatCurrency(col.salario_bruto)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Custo/dia</span>
                          <span className="text-emerald-400 font-medium">
                            {formatCurrency(custoPorDia)}
                          </span>
                        </div>
                        {col.status === "experiencia" && col.data_admissao && (
                          <div className="text-xs text-amber-400 mt-1">
                            ⚡ Experiência: {Math.max(0, 90 - Math.floor((new Date().getTime() - new Date(col.data_admissao).getTime()) / (1000*60*60*24)))} dias restantes
                          </div>
                        )}
                      </div>
                    )}
                </CardContent>
              </Card>
            );
          })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
