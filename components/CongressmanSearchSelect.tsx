'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createClient } from '../utils/supabase/client';
import { Congressman } from '../types/types';

interface CongressmanSearchSelectProps {
  onSelect: (congressman: Congressman | null) => void;
  selectedId?: string;
  placeholder?: string;
  className?: string;
}

export interface CongressmanSearchSelectRef {
  clear: () => void;
}

const CongressmanSearchSelect = forwardRef<CongressmanSearchSelectRef, CongressmanSearchSelectProps>(({
  onSelect,
  selectedId,
  placeholder = 'Search for a congressman...',
  className = '',
}, ref) => {
  const [search, setSearch] = useState('');
  const [congressmen, setCongressmen] = useState<Congressman[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Congressman | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);


  // Expose clear method to parent components
  useImperativeHandle(ref, () => ({
    clear: () => {
      setSelected(null);
      setSearch('');
      onSelect(null);
    }
  }));

  // Fetch congressman by ID if selectedId is provided
  useEffect(() => {
    const fetchSelectedCongressman = async () => {
      const supabase = createClient();
      if (selectedId) {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('congressman')
            .select('id, full_name, party, state')
            .eq('id', selectedId);
          if (error) throw error;
          const found = data[0];
          if (found) {
            setSelected({ id: found.id, full_name: found.full_name, party: found.party, state: found.state} as Congressman);
          }
        } catch (error) {
          console.error('Error fetching selected congressman:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setSelected(null);
      }
    };

    fetchSelectedCongressman();
  }, [selectedId]);

  // Search for congressmen when the search term changes
  useEffect(() => {
    const fetchCongressmen = async () => {
      const supabase = createClient();
      if (search.length < 2) {
        setCongressmen([]);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('congressman')
          .select('id, full_name, party, state')
          .ilike('full_name', `%${search}%`)
          .limit(10);
        if (error) throw error;
        setCongressmen(data as Congressman[]);
      } catch (error) {
        console.error('Error searching congressmen:', error);
        setCongressmen([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchCongressmen, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (congressman: Congressman) => {
    setSelected(congressman);
    setSearch('');
    setIsOpen(false);
    onSelect(congressman);
  };

  const handleClear = () => {
    setSelected(null);
    setSearch('');
    onSelect(null);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {selected ? (
        <div className="flex items-center justify-between p-2 border rounded-md bg-white">
          <div className="flex items-center">
            <span className="text-sm font-medium">
              {selected.full_name} ({selected.party}-{selected.state})
            </span>
          </div>
          <button
            onClick={handleClear}
            className="ml-2 text-gray-400 hover:text-gray-600"
            aria-label="Clear selection"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      )}

      {isOpen && !selected && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {loading ? (
            <div className="p-2 text-center text-gray-500">Loading...</div>
          ) : congressmen.length > 0 ? (
            <ul>
              {congressmen.map((congressman) => (
                <li
                  key={congressman.id}
                  onClick={() => handleSelect(congressman)}
                  className="p-2 hover:bg-gray-100 cursor-pointer"
                >
                  <div className="flex items-center">
                    <span className="text-sm font-medium">
                      {congressman.full_name}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      ({congressman.party}-{congressman.state})
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : search.length >= 2 ? (
            <div className="p-2 text-center text-gray-500">No results found</div>
          ) : (
            <div className="p-2 text-center text-gray-500">Type at least 2 characters to search</div>
          )}
        </div>
      )}
    </div>
  );
});

CongressmanSearchSelect.displayName = 'CongressmanSearchSelect';

export default CongressmanSearchSelect;
