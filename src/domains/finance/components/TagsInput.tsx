import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { X, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTags } from "../hooks/useTags";
import { Tag } from "../types";

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  placeholder?: string;
  className?: string;
}

export function TagsInput({
  value = [],
  onChange,
  maxTags,
  placeholder = "Digite uma tag e pressione Enter ou vírgula",
  className,
}: TagsInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  const { getTagSuggestions, createTag } = useTags();

  useEffect(() => {
    if (inputValue.trim()) {
      const matchingSuggestions = getTagSuggestions(inputValue);
      // Filter out already selected tags
      const filteredSuggestions = matchingSuggestions.filter(
        tag => !value.includes(tag.nome)
      );
      setSuggestions(filteredSuggestions);
      setShowSuggestions(filteredSuggestions.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    setSelectedSuggestionIndex(-1);
  }, [inputValue, value]);

  const addTag = async (tagName: string) => {
    const trimmedTag = tagName.trim();
    
    if (!trimmedTag) return;
    
    // Check if max tags reached
    if (maxTags && value.length >= maxTags) {
      return;
    }
    
    // Check if tag already exists in selection
    if (value.includes(trimmedTag)) {
      setInputValue("");
      return;
    }

    // Check if tag exists in database, if not create it
    const existingTag = suggestions.find(
      tag => tag.nome.toLowerCase() === trimmedTag.toLowerCase()
    );
    
    if (!existingTag) {
      // Create new tag in database
      await createTag({ nome: trimmedTag, cor: '#6366F1' });
    }

    onChange([...value, trimmedTag]);
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        addTag(suggestions[selectedSuggestionIndex].nome);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag when backspace is pressed on empty input
      removeTag(value[value.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleSuggestionClick = (tagName: string) => {
    addTag(tagName);
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background min-h-[42px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        {value.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="flex items-center gap-1 px-2 py-1"
          >
            <TagIcon className="h-3 w-3" />
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-0"
          disabled={maxTags ? value.length >= maxTags : false}
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-60 overflow-auto"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => handleSuggestionClick(suggestion.nome)}
              className={cn(
                "w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center gap-2",
                selectedSuggestionIndex === index && "bg-accent text-accent-foreground"
              )}
            >
              <TagIcon className="h-4 w-4" style={{ color: suggestion.cor }} />
              <span>{suggestion.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
