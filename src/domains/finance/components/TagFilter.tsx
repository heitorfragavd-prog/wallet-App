import { useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Tag as TagIcon, X } from "lucide-react";
import { useTags } from "../hooks/useTags";
import { cn } from "@/lib/utils";

interface TagFilterProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  className?: string;
}

export function TagFilter({ selectedTags, onTagsChange, className }: TagFilterProps) {
  const { tags } = useTags();
  const [open, setOpen] = useState(false);

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onTagsChange(selectedTags.filter(t => t !== tagName));
    } else {
      onTagsChange([...selectedTags, tagName]);
    }
  };

  const clearAllTags = () => {
    onTagsChange([]);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <TagIcon className="h-4 w-4" />
            Filtrar por Tags
            {selectedTags.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0">
                {selectedTags.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Filtrar por Tags</h4>
              {selectedTags.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllTags}
                  className="h-auto p-1 text-xs"
                >
                  Limpar
                </Button>
              )}
            </div>
            
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma tag disponível
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.nome);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSelected && "bg-primary text-primary-foreground"
                      )}
                      style={isSelected ? { backgroundColor: tag.cor } : undefined}
                      onClick={() => toggleTag(tag.nome)}
                    >
                      <TagIcon className="h-3 w-3 mr-1" />
                      {tag.nome}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tagName) => {
            const tag = tags.find(t => t.nome === tagName);
            return (
              <Badge
                key={tagName}
                variant="secondary"
                className="gap-1"
                style={tag?.cor ? { backgroundColor: tag.cor, color: 'white' } : undefined}
              >
                {tagName}
                <button
                  onClick={() => toggleTag(tagName)}
                  className="hover:bg-black/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
