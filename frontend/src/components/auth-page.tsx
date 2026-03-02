import { LoginForm } from "./authentication/login-form";
import { useState } from "react";
import { Toaster } from "sonner";

const logoStyle: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 700,
};

function Logo() {
  return (
    <span className="text-3xl tracking-tight select-none" style={logoStyle}>
      Bio<span className="text-muted-foreground">Eval</span>
    </span>
  );
}

export enum AuthType {
  SignUp,
  SignIn,
}

function AuthPage() {
  const [authType, setAuthType] = useState(AuthType.SignIn);

  const switchAuthType = () => {
    setAuthType(authType === AuthType.SignIn ? AuthType.SignUp : AuthType.SignIn);
  };

  return (
    <>
      <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">

        {/* Logo */}
        <div className="mb-10">
          <Logo />
        </div>

        {/* Form area — no card, just floating content */}
        <div className="w-full max-w-[340px] space-y-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {authType === AuthType.SignIn ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {authType === AuthType.SignIn
                ? "Enter your credentials to continue"
                : "Fill in the details below to get started"}
            </p>
          </div>

          <LoginForm authType={authType} />

          <p className="text-center text-sm text-muted-foreground">
            {authType === AuthType.SignIn ? (
              <>
                Don't have an account?{" "}
                <span
                  className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={switchAuthType}
                >
                  Sign up
                </span>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <span
                  className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={switchAuthType}
                >
                  Sign in
                </span>
              </>
            )}
          </p>
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-xs text-muted-foreground/50 select-none">
          © {new Date().getFullYear()} BioEval
        </p>
      </div>
      <Toaster />
    </>
  );
}

export { AuthPage };
