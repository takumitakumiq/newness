"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createGuestInfoSchema } from "@/lib/schemas";
import type { FormField } from "@/lib/types";
import { useEffect } from "react";

interface DynamicFormProps {
  fields?: FormField[];
  schema?: FormField[];  // Alternative prop name for fields
  onSubmit?: (data: Record<string, any>) => void;
  defaultValues?: Record<string, any>;
  values?: Record<string, any>;  // Alternative prop name for defaultValues
  onChange?: (data: Record<string, any>) => void;
}

export function DynamicForm({ 
  fields, 
  schema,
  onSubmit, 
  defaultValues = {}, 
  values,
  onChange 
}: DynamicFormProps) {
  // Support both 'fields' and 'schema' props
  const formFields = fields || schema || [];
  // Support both 'defaultValues' and 'values' props
  const initialValues = values || defaultValues;
  
  const zodSchema = createGuestInfoSchema(formFields);
  
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: initialValues,
    mode: "onChange",
  });

  // Watch for changes and notify parent
  const watchedValues = watch();
  
  // Call onChange when values change
  useEffect(() => {
    if (onChange && Object.keys(watchedValues).length > 0) {
      onChange(watchedValues);
    }
  }, [JSON.stringify(watchedValues)]);

  if (formFields.length === 0) {
    return null;
  }

  const handleFormSubmit = onSubmit ? handleSubmit(onSubmit) : (e: React.FormEvent) => e.preventDefault();

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <AnimatePresence mode="popLayout">
        {formFields.map((field, index) => (
          <motion.div
            key={field.key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
          >
            <div className="space-y-2">
              <Label htmlFor={field.key} className="flex items-center gap-1">
                {field.label}
                {field.required && <span className="text-destructive">*</span>}
              </Label>
              
              <Controller
                name={field.key}
                control={control}
                render={({ field: formField }) => (
                  <>
                    {field.type === "boolean" ? (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={field.key}
                          checked={formField.value}
                          onCheckedChange={formField.onChange}
                        />
                        <Label htmlFor={field.key} className="font-normal cursor-pointer">
                          {field.description || field.label}
                        </Label>
                      </div>
                    ) : field.type === "select" && field.options ? (
                      <select
                        id={field.key}
                        {...formField}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="">選択してください</option>
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={field.key}
                        type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
                        placeholder={field.placeholder}
                        {...formField}
                      />
                    )}
                  </>
                )}
              />
              
              {field.description && field.type !== "boolean" && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
              
              {errors[field.key] && (
                <p className="text-xs text-destructive">
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
