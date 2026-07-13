/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Search, FileText, Cpu, Wrench, ShieldAlert, Sparkles, Filter, 
  ExternalLink, ArrowRight, Bot, HelpCircle, Network, Calendar, MapPin, Check, X, RefreshCw
} from 'lucide-react';
import { api } from '../../lib/api/client';

export function SearchResults() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'All' | 'Documents' | 'Equipment' | 'Work Orders' | 'Regulations' | 'Graph'>('All');
  
  // Left facet rail states
  const [selectedFacets, setSelectedFacets] = useState<{
    type: string[];
    plant: string[];
    date: string[];
    status: string[];
  }>({
    type: [],
    plant: [],
    date: [],
    status: []
  });

  // Extract query from URL hash parameters
  useEffect(() => {
    const parseQuery = () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.split('?')[1] || '');
      setQuery(params.get('q') || '');
    };

    parseQuery();
    window.addEventListener('hashchange', parseQuery);
    return () => window.removeEventListener('hashchange', parseQuery);
  }, []);

  // Fetch search results when query changes
  useEffect(() => {
    if (!query) return;
    setIsLoading(true);
    
    api.get<any>(`/search?q=${encodeURIComponent(query)}`)
      .then((res) => {
        setResults(res.results || []);
        // Reset filters on new search query
        setSelectedFacets({
          type: [],
          plant: [],
          date: [],
          status: []
        });
      })
      .catch((err) => {
        console.error('Search query failed', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [query]);

  // Check if query is a natural-language question
  const isNaturalLanguageQuestion = (q: string): boolean => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return false;
    
    const questionStarts = ['why', 'how', 'what', 'which', 'who', 'when', 'where', 'is', 'can', 'are', 'does', 'should'];
    const startsWithQuestion = questionStarts.some(start => trimmed.startsWith(start + ' ') || trimmed.startsWith(start + '\''));
    const endsWithQuestionMark = trimmed.endsWith('?');
    
    return startsWithQuestion || endsWithQuestionMark;
  };

  // Helper to get facet counts dynamically based on current unfiltered search results
  const getFacetCounts = () => {
    const counts = {
      type: {} as Record<string, number>,
      plant: {} as Record<string, number>,
      date: {} as Record<string, number>,
      status: {} as Record<string, number>
    };

    results.forEach(item => {
      counts.type[item.type] = (counts.type[item.type] || 0) + 1;
      counts.plant[item.plant] = (counts.plant[item.plant] || 0) + 1;
      counts.date[item.date] = (counts.date[item.date] || 0) + 1;
      counts.status[item.status] = (counts.status[item.status] || 0) + 1;
    });

    return counts;
  };

  const facetCounts = getFacetCounts();

  // Filter results client-side based on tabs and selected facets
  const filteredResults = results.filter(item => {
    // 1. Tab Filter
    if (activeTab !== 'All' && activeTab !== 'Graph') {
      const tabMap: Record<string, string> = {
        'Documents': 'Documents',
        'Equipment': 'Equipment',
        'Work Orders': 'Work Orders',
        'Regulations': 'Regulations'
      };
      if (item.type !== tabMap[activeTab]) {
        return false;
      }
    }

    // 2. Facet Type Filter
    if (selectedFacets.type.length > 0 && !selectedFacets.type.includes(item.type)) {
      return false;
    }

    // 3. Facet Plant Filter
    if (selectedFacets.plant.length > 0 && !selectedFacets.plant.includes(item.plant)) {
      return false;
    }

    // 4. Facet Date Filter
    if (selectedFacets.date.length > 0 && !selectedFacets.date.includes(item.date)) {
      return false;
    }

    // 5. Facet Status Filter
    if (selectedFacets.status.length > 0 && !selectedFacets.status.includes(item.status)) {
      return false;
    }

    return true;
  });

  const handleToggleFacet = (category: 'type' | 'plant' | 'date' | 'status', value: string) => {
    setSelectedFacets(prev => {
      const currentList = prev[category];
      const newList = currentList.includes(value)
        ? currentList.filter(v => v !== value)
        : [...currentList, value];
      return { ...prev, [category]: newList };
    });
  };

  const clearAllFilters = () => {
    setSelectedFacets({
      type: [],
      plant: [],
      date: [],
      status: []
    });
  };

  const hasActiveFilters = Object.values(selectedFacets).some(arr => arr.length > 0);

  // Count items per tab based on current selected facets (except type facet for specific tabs)
  const getTabCount = (tab: typeof activeTab) => {
    if (tab === 'All' || tab === 'Graph') {
      // Return total results under current filters
      return results.filter(item => {
        if (selectedFacets.plant.length > 0 && !selectedFacets.plant.includes(item.plant)) return false;
        if (selectedFacets.date.length > 0 && !selectedFacets.date.includes(item.date)) return false;
        if (selectedFacets.status.length > 0 && !selectedFacets.status.includes(item.status)) return false;
        return true;
      }).length;
    }

    return results.filter(item => {
      if (item.type !== tab) return false;
      if (selectedFacets.plant.length > 0 && !selectedFacets.plant.includes(item.plant)) return false;
      if (selectedFacets.date.length > 0 && !selectedFacets.date.includes(item.date)) return false;
      if (selectedFacets.status.length > 0 && !selectedFacets.status.includes(item.status)) return false;
      return true;
    }).length;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 font-sans text-xs">
      
      {/* 1. Header Area */}
      <div className="border-b border-border-custom pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div>
          <span className="text-[10px] font-mono text-primary font-bold tracking-widest uppercase block">Refinery Corpus Index</span>
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight flex items-center space-x-2 mt-1">
            <Search className="w-6 h-6 text-primary" />
            <span>Search Results</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Found <strong className="text-text-primary font-semibold">{results.length}</strong> matches for query: <kbd className="bg-surface-muted border border-border-custom px-1.5 py-0.5 rounded text-primary font-mono font-medium">"{query || 'Empty'}"</kbd>
          </p>
        </div>
      </div>

      {/* 2. Ask Copilot Natural Language Banner */}
      {query && isNaturalLanguageQuestion(query) && (
        <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-surface-muted border border-primary/30 rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="absolute top-0 right-0 p-8 pointer-events-none transform translate-x-4 -translate-y-4 opacity-5">
            <Bot className="w-48 h-48 text-primary" />
          </div>
          <div className="flex items-start space-x-4 relative z-10">
            <div className="p-3 bg-primary/20 text-primary rounded-lg border border-primary/30 flex-shrink-0">
              <Bot className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-bold uppercase">Question Detected</span>
              <h3 className="font-display text-base font-bold text-text-primary mt-1.5">This looks like a question — Ask Copilot</h3>
              <p className="text-xs text-text-secondary mt-1 max-w-xl leading-relaxed">
                The AI Expert Copilot can synthesize multi-document summaries, check regulatory constraints, and retrieve historical failure patterns instantly.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.location.hash = `#copilot?q=${encodeURIComponent(query)}`}
            className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-primary/10 transition-all cursor-pointer flex items-center space-x-2 whitespace-nowrap self-stretch md:self-auto justify-center"
          >
            <span>Ask Expert Copilot</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Main Search Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Facet Rail */}
        <div className="lg:col-span-1 space-y-5 bg-surface border border-border-custom p-4 rounded-xl h-fit">
          <div className="flex items-center justify-between pb-3 border-b border-border-custom">
            <h3 className="font-display font-bold text-text-primary tracking-wide uppercase text-[10px] flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span>Facet Filters</span>
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-[10px] text-status-critical hover:underline font-medium cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Facet: Type */}
          <div className="space-y-2">
            <span className="block text-[10px] font-mono text-text-muted uppercase font-bold tracking-wider">Asset/Doc Type</span>
            <div className="space-y-1">
              {Object.keys(facetCounts.type).map(typeVal => {
                const isChecked = selectedFacets.type.includes(typeVal);
                return (
                  <button
                    key={typeVal}
                    onClick={() => handleToggleFacet('type', typeVal)}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between cursor-pointer text-[11px] transition-all ${
                      isChecked ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary hover:bg-surface-muted/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${isChecked ? 'border-primary bg-primary text-white' : 'border-border-custom'}`}>
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className="truncate">{typeVal}</span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono bg-background-custom/60 px-1.5 py-0.2 rounded border border-border-custom/50">
                      {facetCounts.type[typeVal]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Facet: Plant */}
          <div className="space-y-2 pt-3 border-t border-border-custom/40">
            <span className="block text-[10px] font-mono text-text-muted uppercase font-bold tracking-wider">Refinery Sector / Plant</span>
            <div className="space-y-1">
              {Object.keys(facetCounts.plant).map(plantVal => {
                const isChecked = selectedFacets.plant.includes(plantVal);
                return (
                  <button
                    key={plantVal}
                    onClick={() => handleToggleFacet('plant', plantVal)}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between cursor-pointer text-[11px] transition-all ${
                      isChecked ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary hover:bg-surface-muted/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${isChecked ? 'border-primary bg-primary text-white' : 'border-border-custom'}`}>
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className="truncate">{plantVal.split(' - ')[1] || plantVal}</span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono bg-background-custom/60 px-1.5 py-0.2 rounded border border-border-custom/50">
                      {facetCounts.plant[plantVal]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Facet: Date */}
          <div className="space-y-2 pt-3 border-t border-border-custom/40">
            <span className="block text-[10px] font-mono text-text-muted uppercase font-bold tracking-wider">Ingestion Date</span>
            <div className="space-y-1">
              {Object.keys(facetCounts.date).map(dateVal => {
                const isChecked = selectedFacets.date.includes(dateVal);
                return (
                  <button
                    key={dateVal}
                    onClick={() => handleToggleFacet('date', dateVal)}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between cursor-pointer text-[11px] transition-all ${
                      isChecked ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary hover:bg-surface-muted/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${isChecked ? 'border-primary bg-primary text-white' : 'border-border-custom'}`}>
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className="truncate font-mono">{dateVal}</span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono bg-background-custom/60 px-1.5 py-0.2 rounded border border-border-custom/50">
                      {facetCounts.date[dateVal]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Facet: Status */}
          <div className="space-y-2 pt-3 border-t border-border-custom/40">
            <span className="block text-[10px] font-mono text-text-muted uppercase font-bold tracking-wider">Operational Status</span>
            <div className="space-y-1">
              {Object.keys(facetCounts.status).map(statusVal => {
                const isChecked = selectedFacets.status.includes(statusVal);
                return (
                  <button
                    key={statusVal}
                    onClick={() => handleToggleFacet('status', statusVal)}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between cursor-pointer text-[11px] transition-all ${
                      isChecked ? 'bg-primary/10 text-primary font-semibold' : 'text-text-secondary hover:bg-surface-muted/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center ${isChecked ? 'border-primary bg-primary text-white' : 'border-border-custom'}`}>
                        {isChecked && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className="truncate uppercase font-mono text-[10px]">{statusVal}</span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono bg-background-custom/60 px-1.5 py-0.2 rounded border border-border-custom/50">
                      {facetCounts.status[statusVal]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Content Column */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Navigation Tabs */}
          <div className="border-b border-border-custom flex items-center space-x-2 overflow-x-auto scrollbar-none pb-px">
            {(['All', 'Documents', 'Equipment', 'Work Orders', 'Regulations', 'Graph'] as const).map(tab => {
              const isActive = activeTab === tab;
              const count = getTabCount(tab);
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2 px-4 font-display font-bold text-xs tracking-wide uppercase cursor-pointer border-b-2 transition-all flex items-center space-x-2 whitespace-nowrap ${
                    isActive 
                      ? 'border-primary text-primary font-bold' 
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {tab === 'Graph' && <Network className="w-3.5 h-3.5 text-[#A855F7]" />}
                  <span>{tab}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-muted border border-border-custom text-text-muted'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          {isLoading ? (
            <div className="py-16 text-center space-y-3 bg-surface border border-border-custom rounded-xl">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto" />
              <p className="text-text-secondary font-mono tracking-wider">INDEX INGESTION ENGINE RETRIEVING MATCHES...</p>
            </div>
          ) : activeTab === 'Graph' ? (
            
            /* Graph Tab Design */
            <div className="bg-surface-muted border border-border-custom rounded-xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[500px]">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                   style={{
                     backgroundImage: `radial-gradient(#0E7C86 1px, transparent 1px)`,
                     backgroundSize: '20px 20px'
                   }}
              />
              
              <div className="relative z-10 flex items-center justify-between pb-3 border-b border-border-custom/50">
                <div className="flex items-center space-x-2">
                  <Network className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-display font-bold text-text-primary text-sm">Visual Relationship Graph</h3>
                    <p className="text-[10px] text-text-secondary">Connected entity matching nodes fetched from Neo4j schema indices.</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 rounded">Graph matching: Active</span>
              </div>

              {/* Graphic/Visual Nodes Grid */}
              <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
                
                {filteredResults.length === 0 ? (
                  <div className="text-center p-8">
                    <X className="w-8 h-8 text-status-critical mx-auto mb-2" />
                    <p className="text-text-primary font-bold">No connected graph nodes match the active facet query.</p>
                    <p className="text-xs text-text-secondary mt-1">Try resetting the left facet rail filters.</p>
                  </div>
                ) : (
                  <div className="space-y-6 w-full max-w-2xl">
                    <div className="text-center text-text-muted text-[10px] font-mono tracking-widest mb-2 uppercase">
                      Entity Node Hub Network (Depth = 1)
                    </div>
                    
                    {/* Visual graph linking rendering */}
                    <div className="relative flex flex-col md:flex-row flex-wrap gap-4 items-center justify-center">
                      {filteredResults.map((item, idx) => {
                        let nodeColor = 'border-primary/40 bg-primary/5 text-text-primary hover:bg-primary/10';
                        if (item.type === 'Documents') nodeColor = 'border-sky-500/40 bg-sky-500/5 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10';
                        if (item.type === 'Regulations') nodeColor = 'border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10';
                        if (item.type === 'Work Orders') nodeColor = 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10';

                        return (
                          <div key={item.id} className="relative flex items-center">
                            <button
                               onClick={() => window.location.hash = item.link || '#knowledge-graph'}
                              className={`px-4 py-3.5 border rounded-xl text-center cursor-pointer transition-all hover:scale-105 shadow-lg max-w-xs ${nodeColor}`}
                            >
                              <div className="flex items-center space-x-2 justify-between mb-1">
                                <span className="text-[9px] font-mono uppercase tracking-widest opacity-70">{item.type}</span>
                                <span className="text-[10px] font-bold text-white bg-black/40 px-1 rounded">{item.relevance}%</span>
                              </div>
                              <h4 className="font-display font-bold text-[11px] text-text-primary truncate max-w-[180px]">{item.title}</h4>
                              <p className="text-[9px] text-text-secondary truncate mt-0.5 max-w-[180px]">{item.source}</p>
                            </button>
                            
                            {/* Dotted lines connecting nodes */}
                            {idx < filteredResults.length - 1 && (
                              <div className="hidden md:block w-8 border-t-2 border-dashed border-border-custom/60 h-0 relative -right-1 z-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border-custom/50 pt-3 flex items-center justify-between text-[10px] font-mono text-text-muted relative z-10">
                <span>Click any graph node to deep link to its primary knowledge explorer registry.</span>
                <span>Active Nodes: {filteredResults.length}</span>
              </div>
            </div>
          ) : (
            
            /* Standard Result Cards Lists */
            <div className="space-y-4">
              {filteredResults.length === 0 ? (
                <div className="py-20 text-center bg-surface border border-border-custom rounded-xl">
                  <Search className="w-12 h-12 text-text-muted mx-auto mb-3" />
                  <h3 className="font-display text-base font-bold text-text-primary">No search matches found</h3>
                  <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
                    We couldn't locate any refinery records matching your current combination of query parameters and facets. Try clearing some filters.
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="px-4 py-2 mt-4 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg text-xs cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>
              ) : (
                filteredResults.map(item => {
                  let badgeIcon = <FileText className="w-3.5 h-3.5 text-[#0284C7]" />;
                  if (item.type === 'Equipment') badgeIcon = <Cpu className="w-3.5 h-3.5 text-primary" />;
                  if (item.type === 'Work Orders') badgeIcon = <Wrench className="w-3.5 h-3.5 text-[#22C55E]" />;
                  if (item.type === 'Regulations') badgeIcon = <ShieldAlert className="w-3.5 h-3.5 text-[#EAB308]" />;

                  return (
                    <div 
                      key={item.id}
                      className="bg-surface border border-border-custom p-4 rounded-xl shadow hover:border-primary/40 transition-all flex flex-col justify-between hover:shadow-lg hover:shadow-primary/5"
                    >
                      {/* Card Header metadata */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border-custom/50 mb-3 space-y-1 sm:space-y-0">
                        <div className="flex items-center space-x-2">
                          <span className="p-1 bg-surface-muted rounded border border-border-custom flex-shrink-0">
                            {badgeIcon}
                          </span>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted">{item.type}</span>
                          <span className="text-text-muted text-[10px]">•</span>
                          <span className="text-[10px] font-sans font-semibold bg-surface-muted border border-border-custom px-2 py-0.5 rounded text-text-primary truncate max-w-[150px]">
                            {item.source}
                          </span>
                        </div>
                        
                        {/* Match Type Badge */}
                        <div className="flex items-center space-x-2">
                          {item.matchType === 'semantic' ? (
                            <span className="inline-flex items-center space-x-1 text-[9px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>SEMANTIC MATCH</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[9px] font-mono font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                              <span>KEYWORD MATCH</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & snippet */}
                      <div className="space-y-2">
                        <button 
                          onClick={() => window.location.hash = item.link || '#'}
                          className="font-display font-bold text-sm text-text-primary hover:text-primary text-left cursor-pointer transition-colors block"
                        >
                          {item.title}
                        </button>
                        
                        <p 
                          className="text-xs text-text-secondary leading-relaxed font-sans"
                          dangerouslySetInnerHTML={{ __html: item.snippet }}
                        />
                      </div>

                      {/* Score bar & footer metadata */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border-custom/40 mt-4 items-center">
                        
                        {/* Score bar */}
                        <div className="flex items-center space-x-3">
                          <span className="text-[10px] font-mono text-text-muted font-bold tracking-wide">RELEVANCE:</span>
                          <div className="flex-1 bg-surface-muted h-1.5 rounded-full overflow-hidden border border-border-custom/50 max-w-[160px]">
                            <div 
                              className="bg-primary h-full rounded-full" 
                              style={{ width: `${item.relevance}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-text-primary">{item.relevance}%</span>
                        </div>

                        {/* Location / Date info */}
                        <div className="flex items-center justify-end space-x-4 text-text-muted text-[10px] font-mono font-medium">
                          <span className="flex items-center space-x-1 truncate max-w-[200px]">
                            <MapPin className="w-3 h-3 flex-shrink-0 text-text-muted" />
                            <span className="truncate">{item.plant.split(' - ')[1] || item.plant}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3 flex-shrink-0 text-text-muted" />
                            <span>{item.date}</span>
                          </span>
                        </div>

                      </div>

                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
