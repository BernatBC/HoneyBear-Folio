import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Edit, Save, GripVertical, X } from "lucide-react";
import { useConfirm } from "../../contexts/confirm";
import { t } from "../../i18n/i18n";
import CustomSelect from "../../components/ui/CustomSelect";
import NumberInput from "../../components/ui/NumberInput";
import "../../styles/Dashboard.css";

const DEFAULT_CONDITION = { field: "payee", operator: "equals", value: "", negated: false };
const DEFAULT_ACTION = { field: "category", value: "" };

export default function RulesList() {
  const [rules, setRules] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState({
    id: null,
    priority: 0,
    logic: "and",
    conditions: [{ ...DEFAULT_CONDITION }],
    actions: [{ ...DEFAULT_ACTION }],
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
      logic: "and",
      conditions: [{ ...DEFAULT_CONDITION }],
      actions: [{ ...DEFAULT_ACTION }],
    });
    setIsEditing(false);
  }

  function handleEdit(rule) {
    // Convert legacy rule format to new format if needed
    const conditions = rule.conditions?.length > 0 
      ? rule.conditions 
      : [{ field: rule.match_field, operator: "equals", value: rule.match_pattern, negated: false }];
    
    const actions = rule.actions?.length > 0 
      ? rule.actions 
      : [{ field: rule.action_field, value: rule.action_value }];

    setFormState({
      id: rule.id,
      priority: rule.priority,
      logic: rule.logic || "and",
      conditions,
      actions,
    });
    setIsEditing(true);
  }

  async function handleDelete(id) {
    if (await confirm(t("rules.delete_confirm"), { kind: "warning" })) {
      try {
        await invoke("delete_rule", { id });
        setRules((current) => current.filter((r) => r.id !== id));
        if (formState.id === id) resetForm();
      } catch (e) {
        console.error("Failed to delete rule:", e);
        fetchRules();
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      // For backward compatibility, use first condition/action for legacy fields
      const firstCondition = formState.conditions[0] || DEFAULT_CONDITION;
      const firstAction = formState.actions[0] || DEFAULT_ACTION;
      
      const payload = {
        matchField: firstCondition.field,
        matchPattern: firstCondition.value,
        actionField: firstAction.field,
        actionValue: String(firstAction.value),
        logic: formState.logic,
        conditions: formState.conditions,
        actions: formState.actions.map(a => ({ ...a, value: String(a.value) })),
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

  // Condition management
  function addCondition() {
    setFormState((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { ...DEFAULT_CONDITION }],
    }));
  }

  function updateCondition(index, updates) {
    setFormState((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)),
    }));
  }

  function removeCondition(index) {
    if (formState.conditions.length <= 1) return;
    setFormState((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  }

  // Action management
  function addAction() {
    setFormState((prev) => ({
      ...prev,
      actions: [...prev.actions, { ...DEFAULT_ACTION }],
    }));
  }

  function updateAction(index, updates) {
    setFormState((prev) => ({
      ...prev,
      actions: prev.actions.map((a, i) => (i === index ? { ...a, ...updates } : a)),
    }));
  }

  function removeAction(index) {
    if (formState.actions.length <= 1) return;
    setFormState((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  }

  // DnD Handlers
  const lastReorder = useRef(0);
  const draggingIdRef = useRef(null);

  const handleDragStart = (e, id) => {
    setDraggingId(id);
    draggingIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.setData("application/x-rule-id", String(id));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (e, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const currentDraggingId = draggingIdRef.current;
    if (!currentDraggingId) return;

    const now = e.timeStamp;
    if (now - lastReorder.current < 50) return;

    const dragIndex = rules.findIndex((r) => r.id === currentDraggingId);
    if (dragIndex === -1 || dragIndex === targetIndex) return;

    lastReorder.current = now;

    const newItems = [...rules];
    const item = newItems[dragIndex];
    newItems.splice(dragIndex, 1);
    newItems.splice(targetIndex, 0, item);

    const total = newItems.length;
    const updatedList = newItems.map((rule, idx) => ({
      ...rule,
      priority: total - idx,
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

  const textOperators = [
    { value: "equals", label: t("rules.operator.equals") },
    { value: "not_equals", label: t("rules.operator.not_equals") },
    { value: "contains", label: t("rules.operator.contains") },
    { value: "not_contains", label: t("rules.operator.not_contains") },
    { value: "starts_with", label: t("rules.operator.starts_with") },
    { value: "ends_with", label: t("rules.operator.ends_with") },
    { value: "is_empty", label: t("rules.operator.is_empty") },
    { value: "is_not_empty", label: t("rules.operator.is_not_empty") },
  ];

  const numberOperators = [
    { value: "equals", label: t("rules.operator.equals") },
    { value: "not_equals", label: t("rules.operator.not_equals") },
    { value: "greater_than", label: t("rules.operator.greater_than") },
    { value: "less_than", label: t("rules.operator.less_than") },
    { value: "is_empty", label: t("rules.operator.is_empty") },
    { value: "is_not_empty", label: t("rules.operator.is_not_empty") },
  ];

  const logicOptions = [
    { value: "and", label: t("rules.logic.and") },
    { value: "or", label: t("rules.logic.or") },
  ];

  function getOperatorsForField(fieldValue) {
    const field = availableFields.find((f) => f.value === fieldValue);
    return field?.type === "number" ? numberOperators : textOperators;
  }

  function getFieldType(fieldValue) {
    const field = availableFields.find((f) => f.value === fieldValue);
    return field?.type || "text";
  }

  function isValuelessOperator(operator) {
    return operator === "is_empty" || operator === "is_not_empty";
  }

  // Format condition for display
  function formatCondition(condition) {
    const fieldLabel = t(`rules.field.${condition.field}`) || condition.field;
    const operatorLabel = t(`rules.operator.${condition.operator}`) || condition.operator;
    if (isValuelessOperator(condition.operator)) {
      return `${fieldLabel} ${operatorLabel}`;
    }
    return `${fieldLabel} ${operatorLabel} "${condition.value}"`;
  }

  // Format action for display
  function formatAction(action) {
    const fieldLabel = t(`rules.field.${action.field}`) || action.field;
    return `${fieldLabel} = "${action.value}"`;
  }

  return (
    <div className="page-container rules-container animate-in fade-in duration-500">
      <div className="hb-header-container mb-large">
        <div>
          <h1 className="hb-header-title">{t("rules.title")}</h1>
          <p className="hb-header-subtitle">{t("rules.subtitle")}</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {isEditing ? t("rules.edit") : t("rules.add")}
          </h2>
          {isEditing && (
            <button
              onClick={resetForm}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              {t("rules.cancel_edit")}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Conditions Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                {t("rules.conditions")}
              </h3>
              {formState.conditions.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{t("rules.logic")}:</span>
                  <CustomSelect
                    value={formState.logic}
                    onChange={(val) => setFormState((prev) => ({ ...prev, logic: val }))}
                    options={logicOptions}
                    className="w-24"
                  />
                  <span className="text-xs text-slate-500">
                    ({formState.logic === "and" ? t("rules.all_conditions") : t("rules.any_condition")})
                  </span>
                </div>
              )}
            </div>

            {formState.conditions.map((condition, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
              >
                <span className="text-xs font-semibold text-slate-500 uppercase w-8">{t("rules.if")}</span>
                
                <CustomSelect
                  value={condition.field}
                  onChange={(val) => updateCondition(index, { field: val, operator: "equals", value: "" })}
                  options={availableFields}
                  className="w-32"
                />

                <CustomSelect
                  value={condition.operator}
                  onChange={(val) => updateCondition(index, { operator: val })}
                  options={getOperatorsForField(condition.field)}
                  className="w-40"
                />

                {!isValuelessOperator(condition.operator) && (
                  getFieldType(condition.field) === "number" ? (
                    <NumberInput
                      value={condition.value}
                      onChange={(val) => updateCondition(index, { value: val })}
                      className="form-input w-32"
                      placeholder="0.00"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="Value"
                      className="form-input w-40"
                      value={condition.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                    />
                  )
                )}

                {formState.conditions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title={t("rules.remove_condition")}
                  >
                    <X size={16} />
                  </button>
                )}

                {index < formState.conditions.length - 1 && (
                  <span className="ml-auto text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase">
                    {formState.logic === "and" ? t("rules.logic.and") : t("rules.logic.or")}
                  </span>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addCondition}
              className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              <Plus size={16} />
              {t("rules.add_condition")}
            </button>
          </div>

          {/* Actions Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              {t("rules.actions")}
            </h3>

            {formState.actions.map((action, index) => {
              const fieldType = getFieldType(action.field);
              return (
                <div
                  key={index}
                  className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                >
                  <span className="text-xs font-semibold text-slate-500 uppercase w-8">{t("rules.then_set")}</span>

                  <CustomSelect
                    value={action.field}
                    onChange={(val) => updateAction(index, { field: val, value: "" })}
                    options={availableFields}
                    className="w-32"
                  />

                  <span className="text-xs font-semibold text-slate-500 uppercase">{t("rules.to")}</span>

                  {fieldType === "number" ? (
                    <NumberInput
                      value={action.value}
                      onChange={(val) => updateAction(index, { value: val })}
                      className="form-input w-40"
                      placeholder="0.00"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="Value"
                      className="form-input w-40"
                      value={action.value}
                      onChange={(e) => updateAction(index, { value: e.target.value })}
                    />
                  )}

                  {formState.actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAction(index)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title={t("rules.remove_action")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addAction}
              className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              <Plus size={16} />
              {t("rules.add_action")}
            </button>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <button type="submit" className="btn-primary">
              {isEditing ? <Save size={18} /> : <Plus size={18} />}
              {isEditing ? t("rules.update") : t("rules.add")}
            </button>
          </div>
        </form>
      </div>

      {/* Rules Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-medium">
              <tr>
                <th className="w-10 px-4 py-4"></th>
                <th className="px-6 py-4">{t("rules.conditions")}</th>
                <th className="px-6 py-4">{t("rules.actions")}</th>
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
                // Handle both legacy and new format
                const conditions = rule.conditions?.length > 0 
                  ? rule.conditions 
                  : [{ field: rule.match_field, operator: "equals", value: rule.match_pattern }];
                const actions = rule.actions?.length > 0 
                  ? rule.actions 
                  : [{ field: rule.action_field, value: rule.action_value }];
                const logic = rule.logic || "and";

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
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200">
                      <div className="flex flex-wrap gap-1">
                        {conditions.map((cond, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                              {formatCondition(cond)}
                            </span>
                            {i < conditions.length - 1 && (
                              <span className="text-xs font-semibold text-slate-500">
                                {logic === "and" ? t("rules.logic.and") : t("rules.logic.or")}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200">
                      <div className="flex flex-wrap gap-1">
                        {actions.map((action, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs"
                          >
                            {formatAction(action)}
                          </span>
                        ))}
                      </div>
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
                    colSpan="4"
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    {t("rules.empty")}
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
