import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Fuel } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

const registerSchema = z.object({
  username: z.string().min(3).max(40),
  email: z.string().email(),
  password: z.string().min(8),
});

type LoginData = z.infer<typeof loginSchema>;
type RegisterData = z.infer<typeof registerSchema>;

interface AuthResponse {
  token: string;
  user: { id: string; username: string; email: string };
}

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const loginForm = useForm<LoginData>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });
  const registerForm = useForm<RegisterData>({ resolver: zodResolver(registerSchema), defaultValues: { username: "", email: "", password: "" } });

  const loginMutation = useMutation({
    mutationFn: (data: LoginData) => apiRequest<AuthResponse>("POST", "/api/auth/login", data),
    onSuccess: ({ token, user }) => {
      setAuth(token, user);
      toast({ title: `Benvenuto, ${user.username}!` });
      navigate("/");
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => apiRequest<AuthResponse>("POST", "/api/auth/register", data),
    onSuccess: ({ token, user }) => {
      setAuth(token, user);
      toast({ title: `Account creato! Benvenuto, ${user.username}!` });
      navigate("/");
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <Fuel className="text-primary" size={24} />
            </div>
          </div>
          <CardTitle className="text-xl">Fuel GPS</CardTitle>
          <p className="text-sm text-muted-foreground">Accedi per segnalare i prezzi del carburante</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="login" className="flex-1" data-testid="tab-login">Accedi</TabsTrigger>
              <TabsTrigger value="register" className="flex-1" data-testid="tab-register">Registrati</TabsTrigger>
            </TabsList>

            {/* LOGIN */}
            <TabsContent value="login">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit((d) => loginMutation.mutate(d))} className="space-y-4">
                  <FormField control={loginForm.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl><Input {...field} data-testid="input-login-username" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={loginForm.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl><Input type="password" {...field} data-testid="input-login-password" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login-submit">
                    {loginMutation.isPending ? "Accesso..." : "Accedi"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            {/* REGISTER */}
            <TabsContent value="register">
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit((d) => registerMutation.mutate(d))} className="space-y-4">
                  <FormField control={registerForm.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl><Input {...field} data-testid="input-reg-username" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={registerForm.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} data-testid="input-reg-email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={registerForm.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl><Input type="password" {...field} data-testid="input-reg-password" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register-submit">
                    {registerMutation.isPending ? "Registrazione..." : "Crea Account"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
