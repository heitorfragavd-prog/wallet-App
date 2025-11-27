import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { AdminSidebarModern } from "./AdminSidebarModern";
import { cn } from "@/lib/utils";

interface AdminLayoutModernProps {
  children: React.ReactNode;
}

export const AdminLayoutModern = ({ children }: AdminLayoutModernProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex relative">
      {/* Mobile Menu Button - Only show when menu is closed */}
      {!isMobileMenuOpen && (
        <div className="lg:hidden fixed top-4 left-4 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 bg-white dark:bg-gray-800 shadow-md rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-screen transition-all duration-300 z-40",
          // Mobile behavior
          isMobileMenuOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
          // Desktop width
          isCollapsed ? "lg:w-20" : "lg:w-64",
          // Mobile always full width when open
          "w-64"
        )}
      >
        {/* Mobile Close Button */}
        <div className="lg:hidden absolute top-4 right-4 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={closeMobileMenu}
          >
            <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </Button>
        </div>

        <AdminSidebarModern
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Collapse Toggle Button - Desktop only, positioned on the edge */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "hidden lg:flex fixed top-6 z-50",
          "h-6 w-6 rounded-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700",
          "hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-600",
          "transition-all duration-300 shadow-sm",
          "items-center justify-center",
          isCollapsed ? "left-[68px]" : "left-[252px]"
        )}
        onClick={toggleCollapse}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3 text-gray-600 dark:text-gray-400" />
        ) : (
          <ChevronLeft className="h-3 w-3 text-gray-600 dark:text-gray-400" />
        )}
      </Button>

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 transition-all duration-300",
          isCollapsed ? "lg:ml-20" : "lg:ml-64"
        )}
      >
        {/* Spacer for mobile menu button */}
        <div className="lg:hidden h-16" />
        
        {/* Content wrapper with padding */}
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  );
};
