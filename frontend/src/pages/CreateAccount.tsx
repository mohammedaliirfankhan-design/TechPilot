import { useState } from "react";
import type { FormEvent } from "react";

import { registerUser } from "../api";
import AuthLayout, { PasswordInput } from "../components/AuthLayout";

type CreateAccountProps = {
  onRegisterSuccess: (token: string) => void;
  onLogin: () => void;
  onBack?: () => void;
};

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

function CreateAccount({ onRegisterSuccess, onLogin, onBack }: CreateAccountProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lengthOk = password.length >= MIN_LENGTH && password.length <= MAX_LENGTH;
  const matchOk = confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (!password) {
      setError("Enter a password.");
      return;
    }

    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters for your password.`);
      return;
    }

    if (password.length > MAX_LENGTH) {
      setError(`Use no more than ${MAX_LENGTH} characters for your password.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await registerUser(normalizedEmail, password);

      // App.tsx stores the token and loads the user.
      onRegisterSuccess(response.access_token);
    } catch (registerError) {
      setError(
        registerError instanceof Error
          ? registerError.message
          : "Unable to create your account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Set up an account, then enroll your first device with a one-time code."
      onBack={onBack}
    >
      <form className="tpu-form" onSubmit={handleSubmit} noValidate>
        <div className="tpu-field">
          <label htmlFor="register-email">Work email</label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            disabled={isSubmitting}
            autoFocus
          />
        </div>

        <div className="tpu-field">
          <label htmlFor="register-password">Password</label>
          <PasswordInput
            id="register-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            disabled={isSubmitting}
            describedBy="register-password-rules"
            visible={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
          />
        </div>

        <div className="tpu-field">
          <label htmlFor="register-confirm">Confirm password</label>
          <PasswordInput
            id="register-confirm"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            disabled={isSubmitting}
            describedBy="register-password-rules"
            visible={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
          />
        </div>

        <ul id="register-password-rules" className="tpu-rules">
          <li className={lengthOk ? "is-ok" : ""}>
            {MIN_LENGTH} to {MAX_LENGTH} characters
          </li>
          <li className={matchOk ? "is-ok" : ""}>Both passwords match</li>
        </ul>

        {error && (
          <p className="tpu-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="tpu-submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="tpu-switch">
        Already have an account?{" "}
        <button type="button" onClick={onLogin} disabled={isSubmitting}>
          Sign in
        </button>
      </p>
    </AuthLayout>
  );
}

export default CreateAccount;
