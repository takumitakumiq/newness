"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CreditCard, Loader2, CheckCircle, Ticket, Tag, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicForm } from "@/components/DynamicForm";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { checkout, validatePromoCode } from "@/lib/api";
import { userInfoSchema, type UserInfo } from "@/lib/schemas";
import { formatDate, formatTime } from "@/lib/utils";
import type { CheckoutRequest, CheckoutResponse, PromoCodeValidation } from "@/lib/types";

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isAuthenticated, checkAuth } = useAuthStore();
  const [isMounted, setIsMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoValidation, setPromoValidation] = useState<PromoCodeValidation | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  
  const { items, setUserInfo, clearCart, totalCount, updateGuestInfo } = useCartStore();
  const count = totalCount();

  useEffect(() => {
    setIsMounted(true);
    checkAuth();
  }, [checkAuth]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      router.push("/");
    }
  }, [isMounted, isAuthenticated, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserInfo>({
    resolver: zodResolver(userInfoSchema),
    defaultValues: {
      user_name: user ? `${user.last_name} ${user.first_name}`.trim() : "",
      user_email: user?.email || "",
    },
  });

  // Handle promo code validation
  const handlePromoValidation = async () => {
    if (!promoCode.trim()) {
      setPromoError("プロモーションコードを入力してください");
      return;
    }

    setIsValidatingPromo(true);
    setPromoError(null);
    setPromoValidation(null);

    try {
      const validation = await validatePromoCode(promoCode.trim());
      setPromoValidation(validation);
      if (!validation.valid) {
        setPromoError(validation.message);
      }
    } catch (err: any) {
      setPromoError(err.message || "プロモーションコードの検証に失敗しました");
      setPromoValidation({ valid: false, message: err.message });
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const onSubmit = async (data: UserInfo) => {
    if (items.length === 0) {
      setError("カートが空です");
      return;
    }

    // Check if all items have guest_info filled
    const incompleteItems = items.filter(item => {
      const requiredFields = item.attribute.form_schema.filter(f => f.required);
      return requiredFields.some(f => !item.guest_info[f.key]);
    });

    if (incompleteItems.length > 0) {
      setError("すべてのチケットの入場者情報を入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Save user info
      setUserInfo("", data.user_name, data.user_email);

      // Build checkout request
      const request: CheckoutRequest = {
        user_name: data.user_name,
        user_email: data.user_email,
        tickets: items.map((item) => ({
          slot_id: item.slot.id,
          attribute_id: item.attribute.id,
          guest_info: item.guest_info,
        })),
        promo_code: promoValidation?.valid ? promoCode.trim() : undefined,
      };

      const response = await checkout(request);
      setResult(response);
      clearCart();
    } catch (err: any) {
      setError(err.message || err.errors?.toString() || "購入処理に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <Card className="glass border-festival-neon/30">
            <CardContent className="pt-8 pb-6 text-center space-y-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center"
              >
                <CheckCircle className="h-10 w-10 text-green-400" />
              </motion.div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">予約完了！</h2>
                <p className="text-muted-foreground">
                  {result.total_tickets}枚のチケットが予約されました
                </p>
                {result.discount_amount && result.discount_amount > 0 && (
                  <p className="text-green-400 font-medium">
                    {result.discount_amount}円の割引が適用されました
                  </p>
                )}
              </div>

              <div className="p-4 rounded-lg bg-muted/50 text-left">
                <p className="text-sm text-muted-foreground">予約番号</p>
                <p className="font-mono font-bold text-lg">{result.reservation_id}</p>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  variant="neon"
                  onClick={() => router.push("/mypage")}
                  className="w-full"
                >
                  <Ticket className="mr-2 h-4 w-4" />
                  チケットを確認する
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => router.push("/")}
                >
                  トップに戻る
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!isMounted) {
    return null; // or a loading spinner
  }

  // Empty cart redirect
  if (count === 0 && !isSubmitting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full glass">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <p className="text-muted-foreground">カートが空です</p>
            <Button onClick={() => router.push("/")}>
              チケットを選ぶ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">購入手続き</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-8">
        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 rounded-lg bg-destructive/20 border border-destructive/50 text-destructive"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cart Summary with Guest Info */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">選択中のチケット</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="p-4 rounded-lg bg-muted/50 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.attribute.display_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(item.slot.event_date)} {formatTime(item.slot.start_time)}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">チケット {index + 1}</span>
                </div>
                
                {/* Guest Info Form for this ticket */}
                {item.attribute.form_schema.length > 0 && (
                  <div className="pt-3 border-t border-border/50 space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">入場者情報</p>
                    <DynamicForm
                      schema={item.attribute.form_schema}
                      values={item.guest_info}
                      onChange={(values) => updateGuestInfo(item.id, values)}
                    />
                  </div>
                )}
              </div>
            ))}
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between font-semibold">
                <span>合計</span>
                <span>{count}枚</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Info Form */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">予約者情報</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user_name">お名前</Label>
                <Input
                  id="user_name"
                  placeholder="例: 山田太郎"
                  {...register("user_name")}
                />
                {errors.user_name && (
                  <p className="text-xs text-destructive">{errors.user_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="user_email">メールアドレス</Label>
                <Input
                  id="user_email"
                  type="email"
                  placeholder="例: taro@example.com"
                  {...register("user_email")}
                />
                {errors.user_email && (
                  <p className="text-xs text-destructive">{errors.user_email.message}</p>
                )}
              </div>

              {/* Promo Code Section */}
              <div className="space-y-3 pt-2">
                <Label htmlFor="promo_code" className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  プロモーションコード（任意）
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="promo_code"
                    placeholder="コードを入力"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value);
                      setPromoValidation(null);
                      setPromoError(null);
                    }}
                    onBlur={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                    }}
                    disabled={isValidatingPromo}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePromoValidation}
                    disabled={isValidatingPromo || !promoCode.trim()}
                  >
                    {isValidatingPromo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "適用"
                    )}
                  </Button>
                </div>
                
                <AnimatePresence>
                  {promoValidation && promoValidation.valid && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400"
                    >
                      <Check className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 text-sm">
                        <p className="font-medium">{promoValidation.message}</p>
                        <p className="text-xs mt-1">
                          {promoValidation.discount_amount}円の割引が適用されます
                        </p>
                      </div>
                    </motion.div>
                  )}
                  
                  {promoError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive"
                    >
                      <X className="h-4 w-4 flex-shrink-0" />
                      <p className="text-sm">{promoError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Button
                type="submit"
                variant="neon"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    予約を確定する
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
