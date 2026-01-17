import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Edit, Save, X, BookOpenCheck, GripVertical } from "lucide-react";
import { useConfirm } from "../contexts/confirm";
import { t } from "../i18n/i18n";
import CustomSelect from "./CustomSelect";
import "../styles/Dashboard.css"; // Reuse dashboard styles for cards

export default function RulesList() {
  const [rules, setRules] = useState([]);
  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState({
    id: null,
    priority: 0,
    match_field: "payee",
    match_pattern: "",
    action_field: "category",
    action_value: "",
  });

  const confirm = useConfirm();
  const draggingItem = useRef(null);
  const dragOverItem = useRef(null);

  async function fetchRules() {
    try {
      const r = await invoke("get_rules");
      setRules(r);
    } catch (e) {
      console.error("Failed to fetch rules:", e);
    }
  }

  useEffect(() => {
    fetchRules();
  }, []);

  function resetForm() {
    setFormState({
       id: null,
       priority: 0,
       match_field: "payee",
       match_pattern: "",
       action_field: "category",
       action_value: "",
    });
    setIsEditing(false);
  }

  function handleEdit(rule) {
    setFormState({ ...rule });
    setIsEditing(true);
  }

  async function handleDelete(id) {
    if (await confirm({ title: t("rules.delete_confirm"), isDestructive: true })) {
      try {
        await invoke("delete_rule", { id });
        fetchRules();
        if (formState.id === id) resetForm();
      } catch (e) {
        console.error("Failed to delete rule:", e);
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = {
        matchField: formState.match_field,
        matchPattern: formState.match_pattern,
        actionField: formState.action_field,
        actionValue: formState.action_value,
      };

      if (formState.id) {
        await invoke("update_rule", {
          ...payload,
          id: formState.id,
          priority: Number(formState.priority),
        });
      } else {
        // New rules go to top-ish (depending on backend sort).
        // We set priority to max+1 so it appears at top if sort is DESC.
        const maxPriority =
          rules.length > 0 ? Math.max(...rules.map((r) => r.priority)) : 0;
        await invoke("create_rule", {
          ...payload,
          priority: maxPriority + 1,
        });
      }
      resetForm();
      fetchRules();
    } catch (e) {
      console.error("Failed to save rule:", e);
    }
  }

  // DnD Handlers
  const handleDragStart = (e, position) => {
    draggingItem.current = position;
    e.target.classList.add('opacity-50');
  };

  const handleDragEnter = (e, position) => {
    dragOverItem.current = position;
  };

  const handleDragEnd = async (e) => {
    e.target.classList.remove('opacity-50');
    const dragIndex = draggingItem.current;
    const dropIndex = dragOverItem.current;

    if (dragIndex === null || dropIndex === null || dragIndex === dropIndex) {
        draggingItem.current = null;
        dragOverItem.current = null;
        return;
    }

    const copyList = [...rules];
    const dragItemContent = copyList[dragIndex];
    copyList.splice(dragIndex, 1);
    copyList.splice(dropIndex, 0, dragItemContent);

    // Update priorities locally to reflect new order immediately
    // ensuring consistent behavior if user edits right after drag
    const total = copyList.length;
    const updatedList = copyList.map((rule, idx) => ({
        ...rule,
        priority: total - idx
    }));

    draggingItem.current = null;
    dragOverItem.current = null;
    setRules(updatedList);

    // Persist new order
    try {
        await invoke("update_rules_order", { ruleIds: updatedList.map(r => r.id) });
    } catch(err) {
        console.error("Failed to reorder rules:", err);
        fetchRules(); // Revert on fail
    }
  };


  const availableFields = [
    { value: "payee", label: t("rules.field.payee") },
    { value: "category", label: t("rules.field.category") },
    { value: "notes", label: t("rules.field.notes") },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BookOpenCheck className="w-8 h-8 text-brand-600 dark:text-brand-400" />
            {t("rules.title")}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t("rules.subtitle")}
          </p>
        </div>
      </div>

      {/* Inline Form */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {isEditing ? "Edit Rule" : t("rules.add")}
             </h2>
             {isEditing && (
                 <button onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                     Cancel Edit
                 </button>
             )}
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row items-end gap-4">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
                {/* IF */}
                <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-500 uppercase mb-1">{t("rules.if")}</label>
                    <CustomSelect
                        value={formState.match_field}
                        onChange={(val) => setFormState({ ...formState, match_field: val })}
                        options={availableFields}
                    />
                </div>

                {/* EQUALS */}
                <div className="flex flex-col">
                     <label className="text-xs font-semibold text-slate-500 uppercase mb-1">{t("rules.equals")}</label>
                     <input
                      type="text"
                      required
                      placeholder="e.g. Starbucks"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none dark:text-white"
                      value={formState.match_pattern}
                      onChange={(e) => setFormState({ ...formState, match_pattern: e.target.value })}
                    />
                </div>

                {/* THEN SET */}
                <div className="flex flex-col">
                     <label className="text-xs font-semibold text-slate-500 uppercase mb-1">{t("rules.then_set")}</label>
                      <CustomSelect
                        value={formState.action_field}
                        onChange={(val) => setFormState({ ...formState, action_field: val })}
                        options={availableFields}
                    />
                </div>

                 {/* TO */}
                <div className="flex flex-col">
                     <label className="text-xs font-semibold text-slate-500 uppercase mb-1">{t("rules.to")}</label>
                     <input
                      type="text"
                      required
                      placeholder="e.g. Coffee"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none dark:text-white"
                      value={formState.action_value}
                      onChange={(e) => setFormState({ ...formState, action_value: e.target.value })}
                    />
                </div>
            </div>

            <button
                type="submit"
                className="h-10 px-6 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 whitespace-nowrap shadow-sm hover:shadow"
            >
                {isEditing ? <Save size={18} /> : <Plus size={18} />}
                {isEditing ? "Update" : "Add"}
            </button>
          </form>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-medium">
              <tr>
                <th className="w-10 px-4 py-4"></th>
                <th className="px-6 py-4">{t("rules.if")}</th>
                <th className="px-6 py-4">{t("rules.equals")}</th>
                <th className="px-6 py-4">{t("rules.then_set")}</th>
                <th className="px-6 py-4">{t("rules.to")}</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {rules.map((rule, index) => (
                <tr 
                    key={rule.id} 
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-move"
                    draggable={!isEditing}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                >
                  <td className="px-4 py-4 text-slate-400 dark:text-slate-600">
                      <GripVertical size={16} className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing" />
                  </td>
                  <td className="px-6 py-4 capitalize text-slate-800 dark:text-slate-200">{t(`rules.field.${rule.match_field}`) || rule.match_field}</td>
                  <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-medium">"{rule.match_pattern}"</td>
                  <td className="px-6 py-4 capitalize text-slate-800 dark:text-slate-200">{t(`rules.field.${rule.action_field}`) || rule.action_field}</td>
                  <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-medium">"{rule.action_value}"</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button
                        onClick={() => handleEdit(rule)}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-colors"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                 <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                    No rules defined yet. Use the form above to create one.
                  </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
