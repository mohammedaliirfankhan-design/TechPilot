import {
  FormEvent,
  useState,
} from "react";

import {
  registerUser,
} from "../api";

type CreateAccountProps = {
  onRegisterSuccess: (
    token: string,
  ) => void;

  onLogin: () => void;
};

function CreateAccount({
  onRegisterSuccess,
  onLogin,
}: CreateAccountProps) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [error, setError] =
    useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setError("");

    const normalizedEmail =
      email.trim();

    if (!normalizedEmail) {
      setError(
        "Please enter your email address.",
      );
      return;
    }

    if (!password) {
      setError(
        "Please enter a password.",
      );
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters.",
      );
      return;
    }

    if (password.length > 128) {
      setError(
        "Password must not exceed 128 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "Passwords do not match.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response =
        await registerUser(
          normalizedEmail,
          password,
        );

      localStorage.setItem(
        "techpilot_access_token",
        response.access_token,
      );

      onRegisterSuccess(
        response.access_token,
      );
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
    <div className="auth-page">
      <div
        className="auth-background-grid"
        aria-hidden="true"
      />

      <div
        className="auth-background-glow auth-background-glow-one"
        aria-hidden="true"
      />

      <div
        className="auth-background-glow auth-background-glow-two"
        aria-hidden="true"
      />

      <main className="auth-container">
        <section className="auth-card">
          {/* BRAND */}

          <div className="auth-brand">
            <div
              className="auth-brand-mark"
              aria-hidden="true"
            >
              <span>TP</span>
            </div>

            <div>
              <strong>
                TECHPILOT
              </strong>

              <span>
                REMOTE SUPPORT
              </span>
            </div>
          </div>

          {/* HEADING */}

          <div className="auth-heading">
            <div className="auth-eyebrow">
              <span />
              NEW ACCOUNT
            </div>

            <h1>
              Create your account
            </h1>

            <p>
              Set up your TechPilot
              account to manage
              endpoints and provide
              secure remote support.
            </p>
          </div>

          {/* FORM */}

          <form
            className="auth-form"
            onSubmit={handleSubmit}
          >
            <div className="auth-field">
              <label htmlFor="register-email">
                Email address
              </label>

              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value,
                  )
                }
                placeholder="you@company.com"
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="register-password">
                Password
              </label>

              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                placeholder="At least 8 characters"
                autoComplete="new-password"
                disabled={isSubmitting}
              />

              <span className="auth-field-hint">
                Use 8–128 characters.
              </span>
            </div>

            <div className="auth-field">
              <label htmlFor="register-confirm-password">
                Confirm password
              </label>

              <input
                id="register-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(
                    event.target.value,
                  )
                }
                placeholder="Enter your password again"
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div
                className="auth-error"
                role="alert"
              >
                <span aria-hidden="true">
                  !
                </span>

                <p>
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Creating account..."
                : "Create account"}
            </button>
          </form>

          {/* LOGIN */}

          <div className="auth-switch">
            <span>
              Already have an account?
            </span>

            <button
              type="button"
              onClick={onLogin}
              disabled={isSubmitting}
            >
              Sign in
            </button>
          </div>

          {/* SECURITY FOOTER */}

          <div className="auth-security">
            <span
              className="auth-security-icon"
              aria-hidden="true"
            >
              ✓
            </span>

            <span>
              Secure authenticated
              connection
            </span>
          </div>
        </section>

        <footer className="auth-footer">
          <span>
            TECHPILOT
          </span>

          <span>
            Secure IT Remote Support
          </span>

          <span>
            v1.0.0
          </span>
        </footer>
      </main>
    </div>
  );
}

export default CreateAccount;