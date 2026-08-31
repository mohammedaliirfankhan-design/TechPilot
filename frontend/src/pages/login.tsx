import {
  FormEvent,
  useState,
} from "react";

import {
  loginUser,
} from "../api";

type LoginProps = {
  onLoginSuccess: (
    token: string,
  ) => void;

  onCreateAccount: () => void;
};

function Login({
  onLoginSuccess,
  onCreateAccount,
}: LoginProps) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
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
        "Please enter your password.",
      );

      return;
    }

    setIsSubmitting(true);

    try {
      const response =
        await loginUser(
          normalizedEmail,
          password,
        );

      localStorage.setItem(
        "techpilot_access_token",
        response.access_token,
      );

      onLoginSuccess(
        response.access_token,
      );
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
              SECURE ACCESS
            </div>

            <h1>
              Welcome back
            </h1>

            <p>
              Sign in to manage your
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
              <label htmlFor="login-email">
                Email address
              </label>

              <input
                id="login-email"
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
              <div className="auth-field-header">
                <label htmlFor="login-password">
                  Password
                </label>
              </div>

              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value,
                  )
                }
                placeholder="Enter your password"
                autoComplete="current-password"
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
                ? "Signing in..."
                : "Sign in"}
            </button>
          </form>

          {/* CREATE ACCOUNT */}

          <div className="auth-switch">
            <span>
              Don't have an account?
            </span>

            <button
              type="button"
              onClick={
                onCreateAccount
              }
              disabled={isSubmitting}
            >
              Create account
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

export default Login;