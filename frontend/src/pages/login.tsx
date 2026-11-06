import { useState } from "react";
import type { FormEvent } from "react";

import { loginUser } from "../api";
import AuthLayout, { PasswordInput } from "../components/AuthLayout";

type LoginProps = {
  onLoginSuccess: (token: string) => void;
  onCreateAccount: () => void;
  onBack?: () => void;
};

function Login({ onLoginSuccess, onCreateAccount, onBack }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await loginUser(normalizedEmail, password);

      // App.tsx stores the token and loads the user.
      onLoginSuccess(response.access_token);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to your TechAIPILOT workspace."
      onBack={onBack}
    >
      <form className="tpu-form" onSubmit={handleSubmit} noValidate>
        <div className="tpu-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            disabled={isSubmitting}
            autoFocus
          />
        </div>

        <div className="tpu-field">
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={isSubmitting}
            visible={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
          />
        </div>

        {error && (
          <p className="tpu-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="tpu-submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="tpu-switch">
        New to TechAIPILOT?{" "}
        <button type="button" onClick={onCreateAccount} disabled={isSubmitting}>
          Create an account
        </button>
      </p>
    </AuthLayout>
  );
}

export default Login;
