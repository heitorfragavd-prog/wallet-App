import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: string; // Tailwind color class like 'bg-blue-500'
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export const AdminPageHeader = ({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  breadcrumbs,
  actions
}: AdminPageHeaderProps) => {
  return (
    <div className="mb-6">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center">
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.path ? (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.path}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {/* Header Content */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Icon with colored background */}
          <div className={cn(
            "h-14 w-14 rounded-xl flex items-center justify-center flex-shrink-0",
            iconColor
          )}>
            <Icon className="h-7 w-7 text-white" />
          </div>

          {/* Title and Subtitle */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
