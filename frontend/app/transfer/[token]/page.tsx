"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function TransferAcceptPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/");
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="glass max-w-md w-full">
        <CardHeader className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
          <CardTitle className="text-xl">チケット譲渡は利用できません</CardTitle>
          <CardDescription>
            本システムではチケット譲渡機能を無効化しています。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button onClick={() => router.push("/")}>トップページへ戻る</Button>
        </CardContent>
      </Card>
    </div>
  );
}
