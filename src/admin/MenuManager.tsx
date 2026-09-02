import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Upload, Eye, EyeOff, X, Tag, Check } from 'lucide-react';
import type { MenuItem } from '@/types';
import { useCategories, useMenu, useSettings } from '@/lib/useLocalData';
import { formatMoney } from '@/lib/billing';
import { Modal, ConfirmDialog } from '@/components/ui';

const blankItem = (): Omit<MenuItem, 'id'> => ({
  name: '',
  description: '',
  price: 0,
  category: '',
  image: '',
  available: true,
});

export default function MenuManager() {
  const { menu, setMenu } = useMenu();
  const { settings } = useSettings();
  const { categories, setCategories } = useCategories();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | 'All'>('All');
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<MenuItem, 'id'>>(blankItem());
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState('');

  const filtered = useMemo(() => {
    return menu.filter((m) => {
      const matchCat = filterCat === 'All' || m.category === filterCat;
      const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [menu, search, filterCat]);

  const openCreate = () => {
    setDraft(blankItem());
    setCreating(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setDraft({ name: item.name, description: item.description, price: item.price, category: item.category, image: item.image, available: item.available });
  };

  const saveEdit = () => {
    if (!editing) return;
    setMenu(menu.map((m) => (m.id === editing.id ? { ...editing, ...draft } : m)));
    setEditing(null);
  };

  const saveCreate = () => {
    const newItem: MenuItem = { ...draft, id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    setMenu([newItem, ...menu]);
    setCreating(false);
  };

  const toggleAvailable = (id: string) => {
    setMenu(menu.map((m) => (m.id === id ? { ...m, available: !m.available } : m)));
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    setMenu(menu.filter((m) => m.id !== deleteId));
    setDeleteId(null);
  };

  const onImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((d) => ({ ...d, image: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const isFormValid = draft.name.trim() && draft.price >= 0 && draft.category.trim() !== '';

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name || categories.includes(name)) return;
    setCategories([...categories, name]);
    setNewCatName('');
  };

  const renameCategory = (oldName: string) => {
    const name = editingCatValue.trim();
    if (!name || (name !== oldName && categories.includes(name))) { setEditingCat(null); return; }
    setCategories(categories.map((c) => (c === oldName ? name : c)));
    setMenu(menu.map((m) => (m.category === oldName ? { ...m, category: name } : m)));
    setEditingCat(null);
  };

  const deleteCategory = (name: string) => {
    setCategories(categories.filter((c) => c !== name));
    if (filterCat === name) setFilterCat('All');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-ink-900">Menu Manager</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCatManager((v) => !v)}
            className="px-4 py-2.5 rounded-xl bg-white border border-ink-200 text-ink-700 text-sm font-semibold flex items-center gap-2 hover:bg-ink-50 transition"
          >
            <Tag size={18} />
            Categories
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl bg-ink-900 text-white text-sm font-semibold flex items-center gap-2 hover:bg-ink-800 transition"
          >
            <Plus size={18} />
            Add Item
          </button>
        </div>
      </div>

      {showCatManager && (
        <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              placeholder="New category name..."
              className="flex-1 px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
            />
            <button
              onClick={addCategory}
              disabled={!newCatName.trim() || categories.includes(newCatName.trim())}
              className="px-4 py-2 rounded-lg bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 transition disabled:opacity-40 flex items-center gap-1.5"
            >
              <Plus size={16} /> Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <div key={cat} className="group flex items-center gap-1.5 pl-3 pr-1 py-1.5 rounded-xl bg-ink-100 border border-ink-200">
                {editingCat === cat ? (
                  <input
                    autoFocus
                    value={editingCatValue}
                    onChange={(e) => setEditingCatValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameCategory(cat);
                      if (e.key === 'Escape') setEditingCat(null);
                    }}
                    onBlur={() => renameCategory(cat)}
                    className="w-24 px-1.5 py-0.5 rounded-md border border-ink-300 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
                  />
                ) : (
                  <span className="text-sm font-medium text-ink-700">{cat}</span>
                )}
                {editingCat === cat ? (
                  <button onClick={() => renameCategory(cat)} className="p-1 rounded-md text-basil-600 hover:bg-basil-50 transition">
                    <Check size={14} />
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setEditingCat(cat); setEditingCatValue(cat); }} className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-200 transition opacity-0 group-hover:opacity-100">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteCategory(cat)} className="p-1 rounded-md text-ink-400 hover:text-paprika-600 hover:bg-paprika-50 transition opacity-0 group-hover:opacity-100">
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {(['All', ...categories] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${filterCat === cat ? 'bg-ink-900 text-white' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-ink-200 shadow-sm overflow-hidden group">
            <div className="relative h-36 bg-ink-100">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-300 text-xs">No image</div>
              )}
              {!item.available && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="px-3 py-1 rounded-full bg-white text-ink-900 text-xs font-bold">Unavailable</span>
                </div>
              )}
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 text-ink-700 text-xs font-medium">
                {item.category}
              </span>
            </div>
            <div className="p-3">
              <h3 className="font-bold text-ink-900 text-sm leading-tight">{item.name}</h3>
              <p className="text-xs text-ink-500 mt-1 line-clamp-2">{item.description}</p>
              <p className="font-bold text-ink-900 mt-2">{formatMoney(item.price, settings.currency)}</p>
              <div className="flex gap-1.5 mt-3">
                <button
                  onClick={() => openEdit(item)}
                  className="flex-1 py-2 rounded-lg bg-ink-100 text-ink-700 text-xs font-semibold hover:bg-ink-200 transition flex items-center justify-center gap-1"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => toggleAvailable(item.id)}
                  className="px-2.5 py-2 rounded-lg bg-ink-100 text-ink-700 hover:bg-ink-200 transition"
                  title={item.available ? 'Set unavailable' : 'Set available'}
                >
                  {item.available ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  onClick={() => setDeleteId(item.id)}
                  className="px-2.5 py-2 rounded-lg bg-paprika-50 text-paprika-600 hover:bg-paprika-100 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create modal */}
      <Modal
        open={editing != null || creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        title={editing ? 'Edit Item' : 'Add New Item'}
      >
        <ItemForm
          draft={draft}
          setDraft={setDraft}
          currency={settings.currency}
          categories={categories}
          onImageUpload={onImageUpload}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={editing ? saveEdit : saveCreate}
          valid={!!isFormValid}
        />
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        title="Delete this item?"
        message="This will permanently remove the item from your menu."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function ItemForm({
  draft,
  setDraft,
  currency,
  categories,
  onImageUpload,
  onCancel,
  onSave,
  valid,
}: {
  draft: Omit<MenuItem, 'id'>;
  setDraft: (d: Omit<MenuItem, 'id'>) => void;
  currency: string;
  categories: string[];
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  onSave: () => void;
  valid: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Image */}
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-2">Item Image</label>
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-ink-100 shrink-0 border border-ink-200">
            {draft.image ? (
              <img src={draft.image} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-ink-300 text-xs">No image</div>
            )}
          </div>
          <label className="flex-1 cursor-pointer">
            <span className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-ink-300 text-sm font-medium text-ink-600 hover:border-ink-400 hover:bg-ink-50 transition">
              <Upload size={16} />
              Upload Image
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
          </label>
          {draft.image && (
            <button
              onClick={() => setDraft({ ...draft, image: '' })}
              className="p-2 rounded-lg bg-ink-100 text-ink-500 hover:bg-paprika-100 hover:text-paprika-600 transition"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <input
          type="text"
          value={draft.image.startsWith('data:') ? '' : draft.image}
          onChange={(e) => setDraft({ ...draft, image: e.target.value })}
          placeholder="...or paste image URL"
          className="w-full mt-2 px-3 py-2 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">Name</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. Margherita Pizza"
          className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">Description</label>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Short description..."
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Price ({currency})</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.price || ''}
            onChange={(e) => setDraft({ ...draft, price: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Category</label>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900 bg-white"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.available}
          onChange={(e) => setDraft({ ...draft, available: e.target.checked })}
          className="w-4 h-4 accent-ink-900"
        />
        <span className="text-sm text-ink-700">Available for ordering</span>
      </label>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-ink-200 text-ink-700 font-medium text-sm hover:bg-ink-50 transition"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!valid}
          className="flex-1 py-2.5 rounded-lg bg-ink-900 text-white font-semibold text-sm hover:bg-ink-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}
