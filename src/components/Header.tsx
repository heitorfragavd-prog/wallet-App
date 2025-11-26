
import { Button } from "@/shared/components/ui/button";
import { MessageCircle, Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/shared/components/ThemeToggle";

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="bg-orange-500 rounded-lg p-2">
              <span className="text-white font-bold text-xl">W</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">Wallet</span>
          </Link>
          
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#recursos" className="text-gray-600 hover:text-orange-500 transition-colors">
              Recursos
            </a>
            <a href="#como-funciona" className="text-gray-600 hover:text-orange-500 transition-colors">
              Como Funciona
            </a>
            <a href="#precos" className="text-gray-600 hover:text-orange-500 transition-colors">
              Preços
            </a>
            <a href="#contato" className="text-gray-600 hover:text-orange-500 transition-colors">
              Contato
            </a>
          </nav>

          <div className="hidden md:flex items-center space-x-4">
            <ThemeToggle />
            <Link to="/login">
              <Button variant="outline">
                Fazer Login
              </Button>
            </Link>
            <Link to="/login">
              <Button className="bg-orange-500 hover:bg-orange-600">
                Começar Grátis
              </Button>
            </Link>
          </div>

          <button 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-100">
            <nav className="flex flex-col space-y-4 mt-4">
              <a href="#recursos" className="text-gray-600 hover:text-orange-500 transition-colors">
                Recursos
              </a>
              <a href="#como-funciona" className="text-gray-600 hover:text-orange-500 transition-colors">
                Como Funciona
              </a>
              <a href="#precos" className="text-gray-600 hover:text-orange-500 transition-colors">
                Preços
              </a>
              <a href="#contato" className="text-gray-600 hover:text-orange-500 transition-colors">
                Contato
              </a>
              <div className="flex flex-col space-y-2 pt-4 border-t border-gray-100">
                <div className="flex justify-center pb-2">
                  <ThemeToggle />
                </div>
                <Link to="/login">
                  <Button variant="outline" className="w-full">
                    Fazer Login
                  </Button>
                </Link>
                <Link to="/login">
                  <Button className="bg-orange-500 hover:bg-orange-600 w-full">
                    Começar Grátis
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};
