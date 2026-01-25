import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Edit, Save, GripVertical } from "lucide-react";
import { useConfirm } from "../../contexts/confirm";
import { t } from "../../i18n/i18n";
import CustomSelect from "../../components/ui/CustomSelect";
import NumberInput from "../../components/ui/NumberInput";
import "../../styles/Dashboard.css"; // Reuse dashboard styles for cards

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
  const [draggingId, setDraggingId] = useState(null);

  const confirm = useConfirm();

  async function fetchRules() {
    try {
      const r = await invoke("get_rules");
      setRules(r);
    } catch (e) {
      console.error("Failed to fetch rules:", e);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await invoke("get_rules");
        if (mounted) setRules(r);
      } catch (e) {
        console.error("Failed to fetch rules:", e);
      }
    })();
    return () => {
      mounted = false;
    };
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
    if (await confirm(t("rules.delete_confirm"), { kind: "warning" })) {
      try {
        await invoke("delete_rule", { id });
        // Optimistic update
        setRules((current) => current.filter((r) => r.id !== id));
        if (formState.id === id) resetForm();
      } catch (e) {
        console.error("Failed to delete rule:", e);
        fetchRules(); // Revert on failure
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
        actionValue: String(formState.action_value), // Ensure string for DB
      };

      if (formState.id) {
        await invoke("update_rule", {
          ...payload,
          id: formState.id,
          priority: Number(formState.priority),
        });
      } else {
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

  // DnD Handlers - Using refs for Windows WebView2 compatibility
  const lastReorder = useRef(0);
  // Use ref to store dragging ID - more reliable than state on Windows WebView2
  const draggingIdRef = useRef(null);

  const handleDragStart = (e, id) => {
    // Store in both state (for UI) and ref (for reliable access during drag)
    setDraggingId(id);
    draggingIdRef.current = id;

    // Set data transfer - required for drag to work
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.setData("application/x-rule-id", String(id));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Setting dropEffect is critical for Windows to show correct cursor
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (e, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    // Use ref for reliable access on Windows
    const currentDraggingId = draggingIdRef.current;
    if (!currentDraggingId) return;

    // Throttle reorder operations using event timestamp (avoids impure Date.now call during render)
    const now = e.timeStamp;
    if (now - lastReorder.current < 50) return;

    const dragIndex = rules.findIndex((r) => r.id === currentDraggingId);
    if (dragIndex === -1 || dragIndex === targetIndex) return;

    lastReorder.current = now;

    const newItems = [...rules];
    const item = newItems[dragIndex];
    newItems.splice(dragIndex, 1);
    newItems.splice(targetIndex, 0, item);

    // Update priorities locally
    const total = newItems.length;
    const updatedList = newItems.map((rule, idx) => ({
      ...rule,
      priority: total - idx, // Re-assign priorities based on new visual order
    }));

    setRules(updatedList);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnd = async () => {
    setDraggingId(null);
    draggingIdRef.current = null;
    // Persist new order
    try {
      await invoke("update_rules_order", { ruleIds: rules.map((r) => r.id) });
    } catch (err) {
      console.error("Failed to reorder rules:", err);
      fetchRules();
    }
  };

  const availableFields = [
    { value: "payee", label: t("rules.field.payee"), type: "text" },
    { value: "category", label: t("rules.field.category"), type: "text" },
    { value: "notes", label: t("rules.field.notes"), type: "text" },
    { value: "amount", label: t("rules.field.amount"), type: "number" },
    { value: "date", label: t("rules.field.date"), type: "text" },
    { value: "ticker", label: t("rules.field.ticker"), type: "text" },
    { value: "shares", label: t("rules.field.shares"), type: "number" },
    { value: "price", label: t("rules.field.price"), type: "number" },
    { value: "fee", label: t("rules.field.fee"), type: "number" },
  ];

  const currentActionField =
    availableFields.find((f) => f.value === formState.action_field) ||
    availableFields[0];

  return (
    <div className="page-container rules-container animate-in fade-in duration-500">
      <div className="hb-header-container mb-large">
        <div>
          <h1 className="hb-header-title">{t("rules.title")}</h1>
          <p className="hb-header-subtitle">{t("rules.subtitle")}</p>
        </div>
      </div>

      {/* Inline Form */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {isEditing ? "Edit Rule" : t("rules.add")}
          </h2>
          {isEditing && (
            <button
              onClick={resetForm}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col md:flex-row items-end gap-4"
        >
          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
            {/* IF */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1">
                {t("rules.if")}
              </label>
              <CustomSelect
                value={formState.match_field}
                onChange={(val) =>
                  setFormState({ ...formState, match_field: val })
                }
                options={availableFields}
              />
            </div>

            {/* EQUALS */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1">
                {t("rules.equals")}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Starbucks"
                className="form-input"
                value={formState.match_pattern}
                onChange={(e) =>
                  setFormState({ ...formState, match_pattern: e.target.value })
                }
              />
            </div>

            {/* THEN SET */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1">
                {t("rules.then_set")}
              </label>
              <CustomSelect
                value={formState.action_field}
                onChange={(val) =>
                  setFormState({ ...formState, action_field: val })
                }
                options={availableFields}
              />
            </div>

            {/* TO */}
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1">
                {t("rules.to")}
              </label>
              {currentActionField.type === "number" ? (
                <NumberInput
                  value={formState.action_value}
                  onChange={(val) =>
                    setFormState({ ...formState, action_value: val })
                  }
                  className="form-input"
                  placeholder="0.00"
                />
              ) : (
                <input
                  type="text"
                  required
                  placeholder="e.g. Coffee"
                  className="form-input"
                  value={formState.action_value}
                  onChange={(e) =>
                    setFormState({ ...formState, action_value: e.target.value })
                  }
                />
              )}
            </div>
          </div>

          <button type="submit" className="btn-primary h-10">
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
            <tbody
              className="divide-y divide-slate-200 dark:divide-slate-700"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {rules.map((rule, index) => {
                const isDragging = draggingId === rule.id;
                return (
                  <tr
                    key={rule.id}
                    className={`transition-colors group ${isDragging ? "opacity-30 bg-slate-100 dark:bg-slate-700" : "hover:bg-slate-50 dark:hover:bg-slate-700/30"}`}
                    draggable={!isEditing}
                    onDragStart={(e) => handleDragStart(e, rule.id)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    data-index={index}
                  >
                    <td className="px-4 py-4 text-slate-400 dark:text-slate-600 cursor-move">
                      <GripVertical
                        size={16}
                        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
                      />
                    </td>
                    <td className="px-6 py-4 capitalize text-slate-800 dark:text-slate-200">
                      {t(`rules.field.${rule.match_field}`) || rule.match_field}
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-medium">
                      &quot;{rule.match_pattern}&quot;
                    </td>
                    <td className="px-6 py-4 capitalize text-slate-800 dark:text-slate-200">
                      {t(`rules.field.${rule.action_field}`) ||
                        rule.action_field}
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-medium">
                      &quot;{rule.action_value}&quot;
                    </td>
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
                );
              })}
              {rules.length === 0 && (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-12 text-center text-slate-400"
                  >
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
