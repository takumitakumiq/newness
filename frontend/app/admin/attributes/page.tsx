"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Settings, Save, RefreshCw, Plus, Trash2, X, Check,
  ChevronDown, ChevronUp, GitBranch, AlertCircle, List
} from "lucide-react";

interface FormFieldCondition {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'isTrue' | 'isFalse';
  value?: string | boolean;
}

interface FormField {
  key: string;
  label: string;
  type: 'text' | 'boolean' | 'select' | 'number' | 'email' | 'tel' | 'textarea';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  description?: string;
  showWhen?: FormFieldCondition;
}

interface Attribute {
  id: string;
  target_type: string;
  display_name: string;
  description: string;
  max_total_limit: number;
  form_schema: FormField[];
  is_active: boolean;
  sort_order: number;
}

const FIELD_TYPES = [
  { value: 'text', label: 'テキスト', icon: '📝', desc: '自由入力' },
  { value: 'number', label: '数値', icon: '🔢', desc: '数字のみ' },
  { value: 'email', label: 'メール', icon: '📧', desc: 'メールアドレス' },
  { value: 'tel', label: '電話番号', icon: '📞', desc: '電話番号' },
  { value: 'boolean', label: 'チェック', icon: '☑️', desc: 'はい/いいえ' },
  { value: 'select', label: '選択肢', icon: '📋', desc: '複数から選択' },
  { value: 'textarea', label: '長文', icon: '📄', desc: '複数行入力' },
];

const CONDITION_OPERATORS = [
  { value: 'isTrue', label: 'チェックされている', forType: ['boolean'] },
  { value: 'isFalse', label: 'チェックされていない', forType: ['boolean'] },
  { value: 'equals', label: 'と等しい', forType: ['select', 'text'] },
  { value: 'notEquals', label: 'と等しくない', forType: ['select', 'text'] },
];

export default function AttributesPage() {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedAttr, setExpandedAttr] = useState<string | null>(null);
  const [editingAttr, setEditingAttr] = useState<Attribute | null>(null);
  const [showAddField, setShowAddField] = useState<string | null>(null);
  const [showAddAttribute, setShowAddAttribute] = useState(false);
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newAttributeDesc, setNewAttributeDesc] = useState("");
  const [newAttributeLimit, setNewAttributeLimit] = useState(100);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const getToken = () => localStorage.getItem("access_token");

  const fetchAttributes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/attributes/`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAttributes(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const saveAttribute = async (attr: Attribute) => {
    setSaving(attr.id);
    try {
      const res = await fetch(`${apiUrl}/api/attributes/${attr.id}/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: attr.display_name,
          description: attr.description,
          max_total_limit: attr.max_total_limit,
          form_schema: attr.form_schema,
          is_active: attr.is_active,
        }),
      });
      if (res.ok) {
        await fetchAttributes();
        setEditingAttr(null);
      } else {
        alert("保存に失敗しました");
      }
    } catch (e) { console.error(e); alert("エラーが発生しました"); }
    finally { setSaving(null); }
  };

  useEffect(() => { fetchAttributes(); }, []);

  const createAttribute = async () => {
    if (!newAttributeName.trim()) {
      alert("種別名を入力してください");
      return;
    }
    setSaving("new");
    try {
      const res = await fetch(`${apiUrl}/api/attributes/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: newAttributeName.toLowerCase().replace(/\s/g, '_'),
          display_name: newAttributeName,
          description: newAttributeDesc,
          max_total_limit: newAttributeLimit,
          form_schema: [],
          is_active: true,
          sort_order: attributes.length + 1,
        }),
      });
      if (res.ok) {
        await fetchAttributes();
        setShowAddAttribute(false);
        setNewAttributeName("");
        setNewAttributeDesc("");
        setNewAttributeLimit(100);
      } else {
        const data = await res.json();
        alert("作成に失敗しました: " + JSON.stringify(data));
      }
    } catch (e) { console.error(e); alert("エラーが発生しました"); }
    finally { setSaving(null); }
  };

  const deleteAttribute = async (attrId: string, attrName: string) => {
    if (!confirm(`「${attrName}」を削除しますか？\n\nこの種別に関連するチケットがある場合、削除できない可能性があります。`)) return;
    setDeleting(attrId);
    try {
      const res = await fetch(`${apiUrl}/api/attributes/${attrId}/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok || res.status === 204) {
        await fetchAttributes();
      } else {
        const data = await res.json().catch(() => ({}));
        alert("削除に失敗しました: " + (data.detail || "関連するチケットがある可能性があります"));
      }
    } catch (e) { console.error(e); alert("エラーが発生しました"); }
    finally { setDeleting(null); }
  };

  const addField = (attrId: string, type: string) => {
    const fieldType = FIELD_TYPES.find(t => t.value === type);
    const newField: FormField = {
      key: `${type}_${Date.now()}`,
      label: fieldType?.label || "新しいフィールド",
      type: type as FormField['type'],
      required: false,
      options: type === 'select' ? [{ value: 'option1', label: '選択肢1' }] : undefined,
    };
    setAttributes(attrs => attrs.map(a => 
      a.id === attrId ? { ...a, form_schema: [...a.form_schema, newField] } : a
    ));
    setShowAddField(null);
  };

  const updateField = (attrId: string, index: number, updates: Partial<FormField>) => {
    setAttributes(attrs => attrs.map(a => 
      a.id === attrId ? {
        ...a,
        form_schema: a.form_schema.map((f, i) => i === index ? { ...f, ...updates } : f)
      } : a
    ));
  };

  const removeField = (attrId: string, index: number) => {
    if (!confirm("このフィールドを削除しますか？")) return;
    setAttributes(attrs => attrs.map(a => 
      a.id === attrId ? { ...a, form_schema: a.form_schema.filter((_, i) => i !== index) } : a
    ));
  };

  const moveField = (attrId: string, index: number, direction: 'up' | 'down') => {
    setAttributes(attrs => attrs.map(a => {
      if (a.id !== attrId) return a;
      const newSchema = [...a.form_schema];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= newSchema.length) return a;
      [newSchema[index], newSchema[newIndex]] = [newSchema[newIndex], newSchema[index]];
      return { ...a, form_schema: newSchema };
    }));
  };

  const getAvailableConditionFields = (attr: Attribute, currentIndex: number) => {
    return attr.form_schema.slice(0, currentIndex).filter(f => 
      ['boolean', 'select', 'text'].includes(f.type)
    );
  };

  const getOperatorsForField = (field: FormField | undefined) => {
    if (!field) return CONDITION_OPERATORS;
    return CONDITION_OPERATORS.filter(op => op.forType.includes(field.type));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">チケット種別・フォーム設定</h1>
          <p className="text-sm text-slate-500">各種別ごとに入力フォームをカスタマイズできます</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAddAttribute(true)} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
            <Plus className="h-4 w-4 mr-2" />新規種別
          </Button>
          <Button variant="outline" onClick={fetchAttributes} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />更新
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {attributes.map((attr) => (
            <div key={attr.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              {/* Header */}
              <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedAttr(expandedAttr === attr.id ? null : attr.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${attr.is_active ? "bg-gradient-to-br from-blue-500 to-indigo-600" : "bg-slate-200"}`}>
                    {attr.is_active ? "🎫" : "🔒"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-lg">{attr.display_name}</h3>
                      {!attr.is_active && (
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full">無効</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <List className="h-3.5 w-3.5" />
                        {attr.form_schema.length} フィールド
                      </span>
                      {attr.form_schema.some(f => f.showWhen) && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <GitBranch className="h-3.5 w-3.5" />
                          条件分岐あり
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingAttr(attr); }}>
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); deleteAttribute(attr.id, attr.display_name); }}
                    disabled={deleting === attr.id}
                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                  >
                    {deleting === attr.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                  <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${expandedAttr === attr.id ? "rotate-180" : ""}`} />
                </div>
              </div>

              {/* Expanded Content */}
              {expandedAttr === attr.id && (
                <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
                  {/* Fields */}
                  {attr.form_schema.length === 0 ? (
                    <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-slate-200">
                      <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500">フィールドがありません</p>
                      <p className="text-xs text-slate-400 mt-1">下のボタンからフィールドを追加してください</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {attr.form_schema.map((field, index) => {
                        const fieldType = FIELD_TYPES.find(t => t.value === field.type);
                        const conditionField = field.showWhen ? attr.form_schema.find(f => f.key === field.showWhen?.field) : null;
                        
                        return (
                          <div key={field.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {/* Field Header */}
                            <div className="flex items-center gap-3 p-3 border-b border-slate-100">
                              <div className="flex flex-col gap-0.5">
                                <button 
                                  onClick={() => moveField(attr.id, index, 'up')} 
                                  disabled={index === 0}
                                  className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-20"
                                >
                                  <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                                </button>
                                <button 
                                  onClick={() => moveField(attr.id, index, 'down')} 
                                  disabled={index === attr.form_schema.length - 1}
                                  className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-20"
                                >
                                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                </button>
                              </div>
                              <span className="text-lg">{fieldType?.icon}</span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-900">{field.label}</span>
                                  {field.required && <span className="text-xs text-rose-500 font-medium">必須</span>}
                                  {field.showWhen && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <GitBranch className="h-3 w-3" />条件付き
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400 font-mono">{field.key}</span>
                              </div>
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{fieldType?.label}</span>
                              <button onClick={() => removeField(attr.id, index)} className="p-1.5 hover:bg-rose-50 rounded text-rose-500">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            
                            {/* Field Settings */}
                            <div className="p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">ラベル（表示名）</label>
                                  <Input 
                                    value={field.label} 
                                    onChange={(e) => updateField(attr.id, index, { label: e.target.value })}
                                    className="h-9 text-sm bg-white text-slate-900"
                                    placeholder="お名前"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">キー（内部名）</label>
                                  <Input 
                                    value={field.key} 
                                    onChange={(e) => updateField(attr.id, index, { key: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                                    className="h-9 text-sm font-mono bg-white text-slate-900"
                                    placeholder="name"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">プレースホルダー</label>
                                  <Input 
                                    value={field.placeholder || ""} 
                                    onChange={(e) => updateField(attr.id, index, { placeholder: e.target.value })}
                                    className="h-9 text-sm bg-white text-slate-900"
                                    placeholder="例: 山田太郎"
                                  />
                                </div>
                                <div className="flex items-end">
                                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition-colors flex-1">
                                    <input
                                      type="checkbox"
                                      checked={field.required || false}
                                      onChange={(e) => updateField(attr.id, index, { required: e.target.checked })}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700">必須項目にする</span>
                                  </label>
                                </div>
                              </div>

                              {/* Select Options */}
                              {field.type === 'select' && (
                                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-slate-600">選択肢</label>
                                    <button 
                                      onClick={() => {
                                        const newOpts = [...(field.options || []), { value: `opt_${Date.now()}`, label: "新しい選択肢" }];
                                        updateField(attr.id, index, { options: newOpts });
                                      }}
                                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      <Plus className="h-3 w-3" />追加
                                    </button>
                                  </div>
                                  <div className="space-y-1.5">
                                    {(field.options || []).map((opt, optIndex) => (
                                      <div key={optIndex} className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400 w-4">{optIndex + 1}.</span>
                                        <Input
                                          value={opt.label}
                                          onChange={(e) => {
                                            const newOpts = [...(field.options || [])];
                                            newOpts[optIndex] = { value: e.target.value.toLowerCase().replace(/\s/g, '_'), label: e.target.value };
                                            updateField(attr.id, index, { options: newOpts });
                                          }}
                                          className="h-8 text-sm flex-1 bg-white text-slate-900"
                                          placeholder="選択肢名"
                                        />
                                        <button 
                                          onClick={() => {
                                            const newOpts = (field.options || []).filter((_, i) => i !== optIndex);
                                            updateField(attr.id, index, { options: newOpts });
                                          }}
                                          className="p-1 hover:bg-rose-50 rounded text-rose-400"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Condition Settings */}
                              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 space-y-2 border border-amber-100">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-medium text-amber-800 flex items-center gap-1">
                                    <GitBranch className="h-3.5 w-3.5" />
                                    条件分岐（いつ表示するか）
                                  </label>
                                  {!field.showWhen && getAvailableConditionFields(attr, index).length > 0 && (
                                    <button 
                                      onClick={() => {
                                        const availableFields = getAvailableConditionFields(attr, index);
                                        const firstField = availableFields[0];
                                        updateField(attr.id, index, { 
                                          showWhen: { 
                                            field: firstField.key, 
                                            operator: firstField.type === 'boolean' ? 'isTrue' : 'equals',
                                            value: firstField.type === 'select' ? firstField.options?.[0]?.value : ''
                                          } 
                                        });
                                      }}
                                      className="text-xs text-amber-700 hover:underline flex items-center gap-1"
                                    >
                                      <Plus className="h-3 w-3" />条件を追加
                                    </button>
                                  )}
                                </div>
                                
                                {field.showWhen ? (
                                  <div className="flex flex-wrap items-center gap-2 bg-white rounded-lg p-2 border border-amber-200">
                                    <span className="text-sm text-slate-600">「</span>
                                    <select
                                      value={field.showWhen.field}
                                      onChange={(e) => {
                                        const targetField = attr.form_schema.find(f => f.key === e.target.value);
                                        updateField(attr.id, index, { 
                                          showWhen: { 
                                            ...field.showWhen!, 
                                            field: e.target.value,
                                            operator: targetField?.type === 'boolean' ? 'isTrue' : 'equals',
                                            value: targetField?.type === 'select' ? targetField.options?.[0]?.value : ''
                                          } 
                                        });
                                      }}
                                      className="h-8 rounded border border-amber-300 px-2 text-sm bg-amber-50 text-slate-900"
                                    >
                                      {getAvailableConditionFields(attr, index).map(f => (
                                        <option key={f.key} value={f.key}>{f.label}</option>
                                      ))}
                                    </select>
                                    <span className="text-sm text-slate-600">」が</span>
                                    <select
                                      value={field.showWhen.operator}
                                      onChange={(e) => updateField(attr.id, index, { 
                                        showWhen: { ...field.showWhen!, operator: e.target.value as FormFieldCondition['operator'] } 
                                      })}
                                      className="h-8 rounded border border-amber-300 px-2 text-sm bg-amber-50 text-slate-900"
                                    >
                                      {getOperatorsForField(conditionField ?? undefined).map(op => (
                                        <option key={op.value} value={op.value}>{op.label}</option>
                                      ))}
                                    </select>
                                    {conditionField?.type === 'select' && ['equals', 'notEquals'].includes(field.showWhen.operator) && (
                                      <select
                                        value={String(field.showWhen.value || "")}
                                        onChange={(e) => updateField(attr.id, index, { 
                                          showWhen: { ...field.showWhen!, value: e.target.value } 
                                        })}
                                        className="h-8 rounded border border-amber-300 px-2 text-sm bg-amber-50 text-slate-900"
                                      >
                                        {conditionField.options?.map(opt => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </select>
                                    )}
                                    {conditionField?.type === 'text' && ['equals', 'notEquals'].includes(field.showWhen.operator) && (
                                      <Input
                                        value={String(field.showWhen.value || "")}
                                        onChange={(e) => updateField(attr.id, index, { 
                                          showWhen: { ...field.showWhen!, value: e.target.value } 
                                        })}
                                        placeholder="値"
                                        className="h-8 w-24 text-sm bg-white text-slate-900"
                                      />
                                    )}
                                    <span className="text-sm text-slate-600">とき表示</span>
                                    <button 
                                      onClick={() => updateField(attr.id, index, { showWhen: undefined })}
                                      className="p-1 hover:bg-rose-100 rounded text-rose-500 ml-auto"
                                      title="条件を削除"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : getAvailableConditionFields(attr, index).length === 0 ? (
                                  <p className="text-xs text-amber-600">※ 条件分岐を設定するには、このフィールドより前にチェックボックスまたは選択肢フィールドが必要です</p>
                                ) : (
                                  <p className="text-xs text-amber-600">常に表示（条件なし）</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Field Section */}
                  {showAddField === attr.id ? (
                    <div className="bg-white rounded-xl border-2 border-blue-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-900">フィールドを追加</h4>
                        <button onClick={() => setShowAddField(null)} className="p-1 hover:bg-slate-100 rounded">
                          <X className="h-4 w-4 text-slate-400" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {FIELD_TYPES.map(type => (
                          <button
                            key={type.value}
                            onClick={() => addField(attr.id, type.value)}
                            className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                          >
                            <span className="text-2xl">{type.icon}</span>
                            <span className="text-sm font-medium text-slate-900">{type.label}</span>
                            <span className="text-xs text-slate-500">{type.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddField(attr.id)}
                      className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      フィールドを追加
                    </button>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end pt-2">
                    <Button 
                      onClick={() => saveAttribute(attr)} 
                      disabled={saving === attr.id}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    >
                      {saving === attr.id ? (
                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />保存中...</>
                      ) : (
                        <><Save className="h-4 w-4 mr-2" />変更を保存</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Attribute Modal */}
      {editingAttr && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingAttr(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">種別の基本設定</h3>
              <button onClick={() => setEditingAttr(null)} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">表示名</label>
                <Input 
                  value={editingAttr.display_name}
                  onChange={(e) => setEditingAttr({ ...editingAttr, display_name: e.target.value })}
                  className="bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">説明</label>
                <Input 
                  value={editingAttr.description}
                  onChange={(e) => setEditingAttr({ ...editingAttr, description: e.target.value })}
                  className="bg-white text-slate-900"
                  placeholder="この種別の説明"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">最大発行枚数</label>
                <Input 
                  type="number"
                  value={editingAttr.max_total_limit}
                  onChange={(e) => setEditingAttr({ ...editingAttr, max_total_limit: parseInt(e.target.value) || 0 })}
                  className="bg-white text-slate-900"
                />
              </div>
              <div className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-900">この種別を有効にする</p>
                  <p className="text-xs text-slate-500">無効にすると予約できなくなります</p>
                </div>
                <button
                  onClick={() => setEditingAttr({ ...editingAttr, is_active: !editingAttr.is_active })}
                  className={`relative w-12 h-7 rounded-full transition-colors ${editingAttr.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow ${editingAttr.is_active ? "translate-x-5" : ""}`}></span>
                </button>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingAttr(null)}>キャンセル</Button>
                <Button className="flex-1" onClick={() => {
                  setAttributes(attrs => attrs.map(a => a.id === editingAttr.id ? editingAttr : a));
                  saveAttribute(editingAttr);
                }}>
                  <Check className="h-4 w-4 mr-1" />保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Attribute Modal */}
      {showAddAttribute && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddAttribute(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">新しいチケット種別を追加</h3>
              <button onClick={() => setShowAddAttribute(false)} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">種別名 <span className="text-rose-500">*</span></label>
                <Input 
                  value={newAttributeName}
                  onChange={(e) => setNewAttributeName(e.target.value)}
                  className="bg-white text-slate-900"
                  placeholder="例: VIP、学生、招待客など"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">説明</label>
                <Input 
                  value={newAttributeDesc}
                  onChange={(e) => setNewAttributeDesc(e.target.value)}
                  className="bg-white text-slate-900"
                  placeholder="この種別の説明（任意）"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">最大発行枚数</label>
                <Input 
                  type="number"
                  value={newAttributeLimit}
                  onChange={(e) => setNewAttributeLimit(parseInt(e.target.value) || 0)}
                  className="bg-white text-slate-900"
                />
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  💡 種別を作成後、フォームフィールドを追加できます
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddAttribute(false)}>キャンセル</Button>
                <Button 
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600" 
                  onClick={createAttribute}
                  disabled={saving === "new" || !newAttributeName.trim()}
                >
                  {saving === "new" ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />作成中...</>
                  ) : (
                    <><Plus className="h-4 w-4 mr-1" />作成</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
