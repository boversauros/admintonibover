"use client";
import React, { useState, useEffect, useRef } from "react";
import { Search, X, Plus } from "lucide-react";
import { Keyword } from "@/app/_lib/types";
import { keywordsService } from "@/app/_lib/keywords-service";

interface KeywordSearchProps {
  currentKeywords: string[];
  language: "ca" | "en";
  onAddKeyword: (keyword: string) => void;
  onRemoveKeyword: (keyword: string) => void;
}

export const KeywordSearch: React.FC<KeywordSearchProps> = ({
  currentKeywords,
  language,
  onAddKeyword,
  onRemoveKeyword,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Keyword[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search keywords when query changes
  useEffect(() => {
    const searchKeywords = async () => {
      if (searchQuery.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      setIsSearching(true);
      const response = await keywordsService.search(searchQuery, language);

      if (response.data) {
        // Filter out already selected keywords
        const filteredSuggestions = response.data.filter(
          (k) => !currentKeywords.includes(k.keyword)
        );
        setSuggestions(filteredSuggestions);
      }
      setIsSearching(false);
    };

    const debounceTimer = setTimeout(searchKeywords, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, language, currentKeywords]);

  const handleSelectKeyword = (keyword: Keyword) => {
    onAddKeyword(keyword.keyword);
    setSearchQuery("");
    setShowSuggestions(false);
  };

  const handleCreateNewKeyword = async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    // Check if it already exists in current keywords
    if (
      currentKeywords.some(
        (k) => k.toLowerCase() === trimmedQuery.toLowerCase()
      )
    ) {
      setSearchQuery("");
      return;
    }

    // Create new keyword in the database
    const response = await keywordsService.create(trimmedQuery, language);
    if (response.data) {
      onAddKeyword(response.data.keyword);
      setSearchQuery("");
      setShowSuggestions(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        handleSelectKeyword(suggestions[0]);
      } else if (searchQuery.trim()) {
        handleCreateNewKeyword();
      }
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
        Paraules clau
      </h3>

      <div ref={searchRef} className="relative">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyPress={handleKeyPress}
            placeholder="Buscar o afegir paraula clau..."
            className="w-full bg-gray-900/50 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
          />
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && (searchQuery.trim() || suggestions.length > 0) && (
          <div className="absolute top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
            {isSearching ? (
              <div className="px-3 py-2 text-sm text-gray-400">Cercant...</div>
            ) : (
              <>
                {suggestions.map((keyword) => (
                  <button
                    key={keyword.id}
                    type="button"
                    onClick={() => handleSelectKeyword(keyword)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    {keyword.keyword}
                  </button>
                ))}

                {searchQuery.trim() &&
                  !suggestions.some(
                    (s) => s.keyword.toLowerCase() === searchQuery.toLowerCase()
                  ) && (
                    <button
                      type="button"
                      onClick={handleCreateNewKeyword}
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors border-t border-gray-800"
                    >
                      <span className="flex items-center gap-2">
                        <Plus className="w-3 h-3" />
                        Crear "{searchQuery}"
                      </span>
                    </button>
                  )}

                {suggestions.length === 0 && !searchQuery.trim() && (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    Escriu per buscar paraules clau
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Selected keywords */}
      <div className="flex flex-wrap gap-1.5">
        {currentKeywords.map((keyword) => (
          <span
            key={keyword}
            className="bg-gray-700/30 text-gray-300 px-2 py-1 rounded text-xs flex items-center gap-1"
          >
            {keyword}
            <button
              type="button"
              onClick={() => onRemoveKeyword(keyword)}
              className="text-gray-400 hover:text-gray-200"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {currentKeywords.length === 0 && (
          <span className="text-gray-500 text-xs">Cap paraula clau</span>
        )}
      </div>
    </div>
  );
};
