import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { 
  Users, 
  CreditCard, 
  Receipt, 
  Webhook, 
  Settings,
  Clock,
  LucideIcon
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/shared/components/ui/button";
import { useNavigate } from "react-router-dom";

interface AdminLogEntry {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  admin_id: string;
  profiles: {
    nome_completo: string | null;
  } | null;
}

interface ActivityItem {
  id: string;
  timestamp: string;
  userName: string;
  action: string;
  resource: string;
  resourceType: 'user' | 'plan' | 'subscription' | 'webhook' | 'system';
}

interface RecentActivityCardProps {
  activities?: ActivityItem[];
  loading?: boolean;
  onViewAll?: () => void;
}

const RESOURCE_TYPE_CONFIG: Record<ActivityItem['resourceType'], { icon: LucideIcon; color: string }> = {
  user: { icon: Users, color: 'text-blue-500' },
  plan: { icon: CreditCard, color: 'text-purple-500' },
  subscription: { icon: Receipt, color: 'text-green-500' },
  webhook: { icon: Webhook, color: 'text-orange-500' },
  system: { icon: Settings, color: 'text-gray-500' }
};

export const RecentActivityCard = ({ 
  activities: providedActivities, 
  loading: providedLoading,
  onViewAll 
}: RecentActivityCardProps) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchRecentActivity = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('admin_logs')
        .select(`
          id,
          created_at,
          action,
          entity_type,
          entity_id,
          admin_id,
          profiles!admin_logs_admin_id_fkey (
            nome_completo
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      const formattedActivities: ActivityItem[] = (data as AdminLogEntry[] || []).map((log) => ({
        id: log.id,
        timestamp: log.created_at,
        userName: log.profiles?.nome_completo || 'Usuário desconhecido',
        action: log.action,
        resource: log.entity_id || log.entity_type,
        resourceType: mapEntityTypeToResourceType(log.entity_type)
      }));

      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (providedActivities !== undefined) {
      setActivities(providedActivities);
      setLoading(providedLoading || false);
    } else {
      fetchRecentActivity();
    }
  }, [providedActivities, providedLoading, fetchRecentActivity]);

  const mapEntityTypeToResourceType = (entityType: string): ActivityItem['resourceType'] => {
    const mapping: Record<string, ActivityItem['resourceType']> = {
      'user': 'user',
      'profile': 'user',
      'plan': 'plan',
      'subscription': 'subscription',
      'webhook': 'webhook',
      'system': 'system'
    };
    return mapping[entityType.toLowerCase()] || 'system';
  };

  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      navigate('/admin/audit');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Atividade Recente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Atividade Recente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade recente registrada
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Atividade Recente</CardTitle>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleViewAll}
        >
          Ver tudo
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const config = RESOURCE_TYPE_CONFIG[activity.resourceType];
            const Icon = config.icon;

            return (
              <div key={activity.id} className="flex items-start gap-4">
                <div className={`h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 ${config.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {activity.userName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activity.action} • {activity.resource}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(activity.timestamp), {
                      addSuffix: true,
                      locale: ptBR
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
