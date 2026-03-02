import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthType } from "../auth-page";
import { useNavigate } from "@tanstack/react-router";

// TODO: password length constraints are validated on both sign-in and sign-up; ideally only enforce on sign-up
const formSchema = z.object({
  email: z
    .string()
    .nonempty({ message: "This field is required." })
    .email({ message: "Invalid email." }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters." })
    .max(64, { message: "Password cannot exceed 64 characters." }),
});

function LoginForm({ authType }: { authType: AuthType }) {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);

    if (authType === AuthType.SignIn) {
      await authClient.signIn.email(
        {
          email: values.email,
          password: values.password,
          callbackURL: "/dashboard/project",
          rememberMe: false,
        },
        {
          onError: (ctx) => {
            toast.error(ctx.error.message || "Sign in failed. Please try again.");
            setIsLoading(false);
          },
        },
      );
    } else {
      await authClient.signUp.email(
        {
          name: values.email, // TODO: collect display name separately; using email as placeholder
          email: values.email,
          password: values.password,
        },
        {
          onSuccess: (_) => {
            navigate({ to: "/dashboard/project" });
          },
          onError: (ctx) => {
            toast.error(ctx.error.message || "Sign up failed. Please try again.");
            setIsLoading(false);
          },
        },
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          disabled={isLoading}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="john.smith@mylab.com" {...field}></Input>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          disabled={isLoading}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  {...field}
                ></Input>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <LoaderCircle className="animate-spin" />}
          {authType === AuthType.SignIn ? "Sign In" : "Sign Up"}
        </Button>
      </form>
    </Form>
  );
}

export { LoginForm };
