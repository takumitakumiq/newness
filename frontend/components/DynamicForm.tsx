"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createGuestInfoSchema } from "@/lib/schemas";
import type { FormField, FormFieldCondition } from "@/lib/types";
import { useEffect, useMemo, useCallback } from "react";

interface DynamicFormProps {
  fields?: FormField[];
  schema?: FormField[];
  onSubmit?: (data: Record<string, any>) => void;
  defaultValues?: Record<string, any>;
  values?: Record<string, any>;
  onChange?: (data: Record<string, any>) => void;
}

// 条件を評価する関数（エクスポートして他のコンポーネントでも使用可能に）
export function evaluateCondition(condition: FormFieldCondition | undefined, values: Record<string, any>): boolean {
  if (!condition) return true;
  
  const fieldValue = values[condition.field];
  
  switch (condition.operator) {
    case 'equals':
      return String(fieldValue) === String(condition.value);
    case 'notEquals':
      return String(fieldValue) !== String(condition.value) && fieldValue !== undefined && fieldValue !== '';
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(String(condition.value));
    case 'isTrue':
      return fieldValue === true;
    case 'isFalse':
      return fieldValue === false || fieldValue === undefined || fieldValue === '' || fieldValue === null;
    default:
      return true;
  }
}

export function DynamicForm({ 
  fields, 
  schema,
  onSubmit, 
  defaultValues = {}, 
  values,
  onChange 
}: DynamicFormProps) {
  const formFields = fields || schema || [];
  const initialValues = values || defaultValues;
  
  // 条件付きフィールドを除外したスキーマでバリデーション
  const zodSchema = createGuestInfoSchema(formFields);
  
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: initialValues,
    mode: "onChange",
  });

  const watchedValues = watch();
  
  // 表示するフィールドをフィルタリング
  const visibleFields = useMemo(() => {
    return formFields.filter(field => evaluateCondition(field.showWhen, watchedValues));
  }, [formFields, JSON.stringify(watchedValues)]);
  
  // 親コンポーネントに変更を通知
  const notifyChange = useCallback(() => {
    if (onChange) {
      onChange(watchedValues);
    }
  }, [onChange, watchedValues]);

  useEffect(() => {
    notifyChange();
  }, [JSON.stringify(watchedValues)]);

  // 初期値を設定
  useEffect(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      Object.entries(initialValues).forEach(([key, val]) => {
        setValue(key, val);
      });
    }
  }, []);

  if (formFields.length === 0) {
    return null;
  }

  const handleFormSubmit = onSubmit ? handleSubmit(onSubmit) : (e: React.FormEvent) => e.preventDefault();

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <AnimatePresence mode="popLayout">
        {visibleFields.map((field) => (
          <motion.div
            key={field.key}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2 }}
            layout
          >
            <div className="space-y-2">
              <Label 
                htmlFor={field.key} 
                className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-medium"
              >
                {field.label}
                {field.required && <span className="text-rose-500">*</span>}
              </Label>
              
              <Controller
                name={field.key}
                control={control}
                render={({ field: formField }) => (
                  <>
                    {field.type === "boolean" ? (
                      <label 
                        htmlFor={field.key}
                        className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Checkbox
                          id={field.key}
                          checked={formField.value === true}
                          onCheckedChange={(checked) => formField.onChange(checked === true)}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {field.description || field.label}
                        </span>
                      </label>
                    ) : field.type === "select" && field.options ? (
                      <select
                        id={field.key}
                        value={formField.value || ""}
                        onChange={formField.onChange}
                        className="flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="" className="text-slate-500">選択してください</option>
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        id={field.key}
                        placeholder={field.placeholder}
                        value={formField.value || ""}
                        onChange={formField.onChange}
                        className="flex min-h-[80px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <Input
                        id={field.key}
                        type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
                        placeholder={field.placeholder}
                        value={formField.value || ""}
                        onChange={formField.onChange}
                        className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                      />
                    )}
                  </>
                )}
              />
              
              {field.description && field.type !== "boolean" && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{field.description}</p>
              )}
              
              {errors[field.key] && (
                <p className="text-xs text-rose-500">
                  {errors[field.key]?.message as string}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </form>
  );
}
