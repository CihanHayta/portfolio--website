"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { login } from "./actions";
import styles from "../admin.module.css";

export default function LoginForm({ disabled }) {
  const [state, formAction, pending] = useActionState(login, { error: "", email: "" });
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className={styles.loginForm}>
      {state.error ? (
        <p className={styles.alertError} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          E-posta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          defaultValue={state.email}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Parola
        </label>
        <div className={styles.inputWithButton}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className={styles.input}
          />
          <button
            type="button"
            className={styles.inputButton}
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      <button type="submit" className={styles.btnPrimary} disabled={pending || disabled}>
        {pending ? (
          <LoaderCircle size={17} className={styles.spin} aria-hidden="true" />
        ) : (
          <LogIn size={17} aria-hidden="true" />
        )}
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
