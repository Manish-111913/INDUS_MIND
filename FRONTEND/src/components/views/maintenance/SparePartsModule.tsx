import { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { api } from '../../../lib/api/client';

export function SparePartsModule() {
  const [parts, setParts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter and search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filterLowStock, setFilterLowStock] = useState(false);
  
  // Row Editing states
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [editingOnHand, setEditingOnHand] = useState<number>(0);
  
  // New part form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPartCode, setNewPartCode] = useState('');
  const [newPartName, setNewPartName] = useState('');
  const [newPartCategory, setNewPartCategory] = useState('');
  const [newPartOnHand, setNewPartOnHand] = useState<number>(0);
  const [newPartMinStock, setNewPartMinStock] = useState<number>(1);
  const [newPartLocation, setNewPartLocation] = useState('');
  const [addError, setAddError] = useState('');

  const loadPartsAndFilters = async () => {
    setLoading(true);
    try {
      const [partsRes, catsRes] = await Promise.all([
        api.get<any[]>('/parts'),
        api.get<string[]>('/lookups?type=part_categories')
      ]);
      setParts(partsRes || []);
      setCategories(catsRes || ['Seals', 'Bearings', 'Valves', 'Gaskets', 'Couplings', 'Filters', 'Fasteners', 'Instrumentation']);
    } catch (err) {
      console.error('Failed to load parts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPartsAndFilters();
  }, []);

  const handleUpdateOnHand = async (id: string) => {
    try {
      const partToUpdate = parts.find(p => p.id === id);
      if (!partToUpdate) return;

      const updatedFields = { on_hand: editingOnHand };
      await api.put(`/parts/${id}`, updatedFields);
      
      setParts(prev => prev.map(p => p.id === id ? { ...p, on_hand: editingOnHand } : p));
      setEditingPartId(null);
    } catch (err) {
      console.error('Failed to update stock quantity:', err);
    }
  };

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartCode || !newPartName || !newPartCategory || !newPartLocation) {
      setAddError('Please fill out all mandatory fields.');
      return;
    }
    setAddError('');
    try {
      const body = {
        code: newPartCode,
        name: newPartName,
        category: newPartCategory,
        on_hand: newPartOnHand,
        min_stock: newPartMinStock,
        location: newPartLocation
      };
      const res = await api.post<any>('/parts', body);
      setParts(prev => [...prev, res || res.data]);
      
      // Reset form
      setNewPartCode('');
      setNewPartName('');
      setNewPartCategory('');
      setNewPartOnHand(0);
      setNewPartMinStock(1);
      setNewPartLocation('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add new part:', err);
      setAddError('Server rejection during new part addition.');
    }
  };

  // Filter list
  const filteredParts = parts.filter(part => {
    if (!part) return false;
    const matchesSearch = (part.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (part.code || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (part.location || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || part.category === selectedCategory;
    const matchesLowStock = !filterLowStock || part.on_hand < part.min_stock;
    return matchesSearch && matchesCat && matchesLowStock;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border-custom pb-4 gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Icons.Layers className="w-5 h-5 text-primary" />
            <span>Plant Spare Parts & Inventory Catalog</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Monitor real-time critical component counts, update physical warehouse balances, and identify safety stock breaches.
          </p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow min-h-[44px]"
        >
          {showAddForm ? <Icons.X className="w-4 h-4" /> : <Icons.Plus className="w-4 h-4" />}
          <span>{showAddForm ? 'Cancel Catalog Add' : 'Register New Spare Part'}</span>
        </button>
      </div>

      {showAddForm && (
        <div className="bg-surface border border-border-custom rounded-xl p-5 space-y-4 animate-fade-in shadow-lg">
          <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border-custom pb-2">
            Register New Warehouse Inventory Unit
          </span>
          <form onSubmit={handleAddPart} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Part Code / SKU</label>
              <input
                type="text"
                required
                placeholder="e.g., SEAL-40M"
                value={newPartCode}
                onChange={(e) => setNewPartCode(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Component Descriptor Name</label>
              <input
                type="text"
                required
                placeholder="e.g., Mechanical Seal 40mm"
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Inventory Category</label>
              <select
                required
                value={newPartCategory}
                onChange={(e) => setNewPartCategory(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">On-Hand Quantity</label>
              <input
                type="number"
                required
                min="0"
                value={newPartOnHand}
                onChange={(e) => setNewPartOnHand(parseInt(e.target.value) || 0)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Safety Min Stock (Alert Threshold)</label>
              <input
                type="number"
                required
                min="1"
                value={newPartMinStock}
                onChange={(e) => setNewPartMinStock(parseInt(e.target.value) || 1)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-mono text-[9px] font-bold uppercase text-text-muted">Storage Location Shed / Bin</label>
              <input
                type="text"
                required
                placeholder="e.g., Shed A-2 Bin 14"
                value={newPartLocation}
                onChange={(e) => setNewPartLocation(e.target.value)}
                className="w-full bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
              />
            </div>

            {addError && (
              <p className="text-status-critical font-mono font-bold text-[10px] md:col-span-3">{addError}</p>
            )}

            <div className="md:col-span-3 flex justify-end border-t border-border-custom/40 pt-3">
              <button
                type="submit"
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow min-h-[44px]"
              >
                <Icons.Check className="w-4 h-4" />
                <span>Register Catalog Entry</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FILTER TOOLBAR */}
      <div className="bg-surface border border-border-custom rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by SKU, descriptor, or storage shelf..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background-custom border border-border-custom rounded-lg pl-9 pr-4 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 text-xs min-h-[44px]"
            />
            <Icons.Search className="w-4 h-4 text-text-muted absolute left-3 top-3.5" />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-background-custom border border-border-custom rounded-lg px-3 py-2 text-text-primary focus:outline-none text-xs min-h-[44px] sm:w-48"
          >
            <option value="All">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setFilterLowStock(!filterLowStock)}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all min-h-[44px] ${
            filterLowStock 
              ? 'bg-status-critical/10 border-status-critical/30 text-status-critical' 
              : 'bg-background-custom border-border-custom text-text-secondary hover:text-white'
          }`}
        >
          <Icons.AlertTriangle className="w-4 h-4" />
          <span>Active Low-Stock Alerts Only</span>
        </button>
      </div>

      {/* PARTS DATA TABLE */}
      <div className="bg-surface border border-border-custom rounded-xl overflow-hidden shadow">
        <div className="p-3 bg-surface-muted/30 border-b border-border-custom font-mono text-[10px] text-text-muted uppercase tracking-wider flex items-center justify-between">
          <span>Active Warehouse Catalog Ledger</span>
          <span>{filteredParts.length} Units Indexed</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-text-muted font-mono animate-pulse flex flex-col items-center justify-center space-y-3">
            <Icons.Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span>Querying catalog nodes...</span>
          </div>
        ) : filteredParts.length === 0 ? (
          <div className="p-12 text-center text-text-secondary font-mono space-y-2">
            <Icons.Layers className="w-10 h-10 text-text-muted mx-auto" />
            <p>No catalog records matched active search criteria or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-muted/50 border-b border-border-custom text-[10px] text-text-muted uppercase font-mono">
                  <th className="p-3">SKU / Code</th>
                  <th className="p-3">Component Descriptor</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Storage Location</th>
                  <th className="p-3 text-center">Safety Level</th>
                  <th className="p-3 text-right">Physical On Hand</th>
                  <th className="p-3 text-center w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom/50">
                {filteredParts.map((part) => {
                  const isLow = part.on_hand < part.min_stock;
                  const isEditing = editingPartId === part.id;

                  return (
                    <tr key={part.id} className="hover:bg-background-custom/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-white select-all">{part.code}</td>
                      <td className="p-3 text-text-primary font-medium">{part.name}</td>
                      <td className="p-3 text-text-secondary">{part.category}</td>
                      <td className="p-3 text-text-secondary font-mono text-[11px]">{part.location}</td>
                      <td className="p-3 text-center font-mono">
                        <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded ${
                          isLow 
                            ? 'bg-status-critical/10 text-status-critical border border-status-critical/15' 
                            : 'bg-status-ok/10 text-status-ok border border-status-ok/15'
                        }`}>
                          {isLow ? `REORDER (MIN: ${part.min_stock})` : `ADEQUATE (MIN: ${part.min_stock})`}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-white text-sm">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editingOnHand}
                            onChange={(e) => setEditingOnHand(parseInt(e.target.value) || 0)}
                            className="bg-background-custom border border-primary/50 rounded px-2 py-1 text-xs w-20 text-right focus:outline-none focus:border-primary text-white"
                          />
                        ) : (
                          <span className={isLow ? 'text-status-critical' : 'text-text-primary'}>
                            {part.on_hand}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => handleUpdateOnHand(part.id)}
                              className="p-1 text-status-ok hover:bg-status-ok/10 rounded cursor-pointer transition-colors"
                              title="Confirm balance commit"
                            >
                              <Icons.Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingPartId(null)}
                              className="p-1 text-text-muted hover:bg-surface-muted rounded cursor-pointer transition-colors"
                              title="Discard"
                            >
                              <Icons.X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingPartId(part.id);
                              setEditingOnHand(part.on_hand);
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-mono border border-border-custom hover:border-primary/50 text-text-secondary hover:text-white rounded cursor-pointer transition-all"
                          >
                            <Icons.Edit3 className="w-3.5 h-3.5 text-primary" />
                            <span>Edit Stock</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
