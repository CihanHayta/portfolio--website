"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { login } from "./actions";
import styles from "../admin.module.css";

const MESSAGES = {
  email: "E-posta adresini yaz.",
  emailFormat: "Geçerli bir e-posta adresi yaz (ör. ad@alanadi.com).",
  password: "Şifreni yaz.",
};

// Boş ya da biçimsiz alanlar sunucuya gitmeden, ilgili alanın altında
// Türkçe olarak gösterilir; kimlik doğrulama yalnızca sunucuda yapılır.
function validate(form) {
  const email = form.elements.email;
  const errors = {};
  if (!email.value.trim()) errors.email = MESSAGES.email;
  else if (email.validity.typeMismatch) errors.email = MESSAGES.emailFormat;
  if (!form.elements.password.value) errors.password = MESSAGES.password;
  return errors;
}

export default function LoginForm({ disabled, next }) {
  const [state, formAction, pending] = useActionState(login, { error: "", email: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const passwordRef = useRef(null);

  // Hatalı denemeden sonra şifre alanı temizlenir; imleç yeniden oraya gelir.
  useEffect(() => {
    if (state.error) passwordRef.current?.focus();
  }, [state]);

  const onSubmit = (event) => {
    const errors = validate(event.currentTarget);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      event.preventDefault();
      event.currentTarget.elements[errors.email ? "email" : "password"].focus();
    }
  };

  const clearError = (name) => setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className={styles.loginForm} aria-busy={pending}>
      <input type="hidden" name="next" value={next} />

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
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          defaultValue={state.email}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          onInput={() => clearError("email")}
          className={styles.input}
        />
        {fieldErrors.email ? (
          <p id="email-error" className={styles.fieldError}>
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Şifre
        </label>
        <div className={styles.inputWithButton}>
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            required
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            onInput={() => clearError("password")}
            className={styles.input}
          />
          <button
            type="button"
            className={styles.inputButton}
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            aria-pressed={showPassword}
            aria-controls="password"
          >
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
        {fieldErrors.password ? (
          <p id="password-error" className={styles.fieldError}>
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button type="submit" className={styles.btnPrimary} disabled={pending || disabled}>
        {pending ? (
          <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
        ) : (
          <LogIn size={18} aria-hidden="true" />
        )}
        {pending ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>
      <p className={styles.srOnly} aria-live="polite">
        {pending ? "Giriş yapılıyor, lütfen bekle." : ""}
      </p>
    </form>
  );
}
