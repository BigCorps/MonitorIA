"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./security-settings.module.css";

type PreferredMethod =
  | "password"
  | "magic_link"
  | "google"
  | "passkey";

type OrganizationMfaPolicy =
  | "optional"
  | "admins"
  | "all";

type AuthSettings = {
  allowPassword: boolean;
  allowMagicLink: boolean;
  allowGoogle: boolean;
  allowPasskey: boolean;
  preferredMethod: PreferredMethod;
  requireMfa: boolean;
  effectiveMfaRequired: boolean;
  passwordConfigured: boolean;
  googleLinked: boolean;
  passkeyCount: number;
  totpFactorCount: number;
  currentAal: string;
  currentOrganizationId: string | null;
  currentRole: string | null;
  organizationMfaPolicy: OrganizationMfaPolicy;
  canManageOrganizationPolicy: boolean;
};

type Draft = Pick
  AuthSettings,
  | "allowPassword"
  | "allowMagicLink"
  | "allowGoogle"
  | "allowPasskey"
  | "preferredMethod"
  | "requireMfa"
>;

type MethodContext = {
  passwordConfigured: boolean;
  googleLinked: boolean;
  passkeyCount: number;
};

type PasskeyRecord = {
  id: string;
  friendly_name?: string;
  friendlyName?: string;
  created_at?: string;
  createdAt?: string;
  last_used_at?: string | null;
  lastUsedAt?: string | null;
};

type TotpFactor = {
  id: string;
  status: string;
  friendly_name?: string;
  created_at?: string;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

type Props = {
  userEmail: string;
};

const PREFERRED_FALLBACK_ORDER: PreferredMethod[] = [
  "magic_link",
  "password",
  "google",
  "passkey",
];

function recordValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bool(value: unknown) {
  return value === true;
}

function text(
  value: unknown,
  fallback = "",
) {
  return typeof value === "string"
    ? value
    : fallback;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSettings(
  value: unknown,
): AuthSettings {
  const data = recordValue(value);
  const preferred = text(
    data.preferred_method,
    "magic_link",
  ) as PreferredMethod;
  const orgPolicy = text(
    data.organization_mfa_policy,
    "optional",
  ) as OrganizationMfaPolicy;

  return {
    allowPassword: bool(data.allow_password),
    allowMagicLink: bool(data.allow_magic_link),
    allowGoogle: bool(data.allow_google),
    allowPasskey: bool(data.allow_passkey),
    preferredMethod: [
      "password",
      "magic_link",
      "google",
      "passkey",
    ].includes(preferred)
      ? preferred
      : "magic_link",
    requireMfa: bool(data.require_mfa),
    effectiveMfaRequired: bool(
      data.effective_mfa_required,
    ),
    passwordConfigured: bool(
      data.password_configured,
    ),
    googleLinked: bool(data.google_linked),
    passkeyCount: integer(data.passkey_count),
    totpFactorCount: integer(
      data.totp_factor_count,
    ),
    currentAal: text(data.current_aal, "aal1"),
    currentOrganizationId:
      typeof data.current_organization_id ===
      "string"
        ? data.current_organization_id
        : null,
    currentRole:
      typeof data.current_role === "string"
        ? data.current_role
        : null,
    organizationMfaPolicy: [
      "optional",
      "admins",
      "all",
    ].includes(orgPolicy)
      ? orgPolicy
      : "optional",
    canManageOrganizationPolicy: bool(
      data.can_manage_organization_policy,
    ),
  };
}

function draftFromSettings(
  settings: AuthSettings,
): Draft {
  return {
    allowPassword: settings.allowPassword,
    allowMagicLink: settings.allowMagicLink,
    allowGoogle: settings.allowGoogle,
    allowPasskey: settings.allowPasskey,
    preferredMethod: settings.preferredMethod,
    requireMfa: settings.requireMfa,
  };
}

function methodAvailability(
  values: Draft,
  context: MethodContext,
): Record<PreferredMethod, boolean> {
  return {
    password:
      values.allowPassword &&
      context.passwordConfigured,
    magic_link: values.allowMagicLink,
    google:
      values.allowGoogle && context.googleLinked,
    passkey:
      values.allowPasskey &&
      context.passkeyCount > 0,
  };
}

function reconcilePreferred(
  values: Draft,
  context: MethodContext,
): Draft {
  const availability = methodAvailability(
    values,
    context,
  );

  if (availability[values.preferredMethod]) {
    return values;
  }

  const fallback = PREFERRED_FALLBACK_ORDER.find(
    (method) => availability[method],
  );

  return fallback
    ? { ...values, preferredMethod: fallback }
    : values;
}

function humanError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String(error ?? "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes(
      "at_least_one_auth_method_required",
    )
  ) {
    return "Mantenha pelo menos uma forma de acesso habilitada.";
  }

  if (
    normalized.includes(
      "preferred_method_must_be_enabled",
    )
  ) {
    return "O método preferido também precisa estar habilitado.";
  }

  if (
    normalized.includes("password_not_configured")
  ) {
    return "Crie uma senha antes de habilitar o acesso por senha.";
  }

  if (normalized.includes("google_not_linked")) {
    return "Vincule sua conta Google antes de torná-la o método principal ou único.";
  }

  if (
    normalized.includes("passkey_not_configured")
  ) {
    return "Cadastre uma passkey antes de escolhê-la como método preferido.";
  }

  if (
    normalized.includes(
      "passkey_only_requires_two_credentials",
    )
  ) {
    return "Para usar somente biometria, cadastre pelo menos duas passkeys em dispositivos diferentes.";
  }

  if (
    normalized.includes("notallowederror") ||
    normalized.includes("cancel")
  ) {
    return "A operação foi cancelada no dispositivo.";
  }

  return (
    message ||
    "Não foi possível atualizar a segurança da conta."
  );
}

function dateLabel(value?: string | null) {
  if (!value) return "Nunca utilizada";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function qrSource(value: string) {
  if (
    value.startsWith("data:image/") ||
    value.startsWith("http")
  ) {
    return value;
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    value,
  )}`;
}

function enabledCount(draft: Draft) {
  return [
    draft.allowPassword,
    draft.allowMagicLink,
    draft.allowGoogle,
    draft.allowPasskey,
  ].filter(Boolean).length;
}

export function SecuritySettings({
  userEmail,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] =
    useState<AuthSettings | null>(null);
  const [draft, setDraft] =
    useState<Draft | null>(null);
  const [passkeys, setPasskeys] = useState
    PasskeyRecord[]
  >([]);
  const [factors, setFactors] = useState
    TotpFactor[]
  >([]);
  const [enrollment, setEnrollment] =
    useState<Enrollment | null>(null);
  const [enrollmentCode, setEnrollmentCode] =
    useState("");
  const [organizationPolicy, setOrganizationPolicy] =
    useState<OrganizationMfaPolicy>("optional");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(
    null,
  );
  const [notice, setNotice] =
    useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [
        settingsResult,
        passkeyResult,
        factorResult,
        aalResult,
      ] = await Promise.all([
        supabase.rpc(
          "get_current_user_auth_settings",
        ),
        supabase.auth.passkey.list(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (settingsResult.error) {
        throw settingsResult.error;
      }

      if (
        passkeyResult.error &&
        !/passkey_disabled/i.test(
          passkeyResult.error.message,
        )
      ) {
        throw passkeyResult.error;
      }

      if (factorResult.error) {
        throw factorResult.error;
      }

      if (aalResult.error) {
        throw aalResult.error;
      }

      const normalized = normalizeSettings(
        settingsResult.data,
      );

      normalized.currentAal =
        aalResult.data.currentLevel ??
        normalized.currentAal;

      const verifiedFactors = (
        factorResult.data.totp ?? []
      ).filter(
        (factor) => factor.status === "verified",
      ) as TotpFactor[];

      const listedPasskeys = Array.isArray(
        passkeyResult.data,
      )
        ? (passkeyResult.data as PasskeyRecord[])
        : [];

      normalized.passkeyCount =
        listedPasskeys.length;
      normalized.totpFactorCount =
        verifiedFactors.length;

      setSettings(normalized);
      setDraft(draftFromSettings(normalized));
      setOrganizationPolicy(
        normalized.organizationMfaPolicy,
      );
      setPasskeys(listedPasskeys);
      setFactors(verifiedFactors);
    } catch (loadError) {
      setError(humanError(loadError));
    } finally {
      setLoading(false);
    }
  }

  function contextFrom(
    source: AuthSettings,
    passkeyCount = passkeys.length,
  ): MethodContext {
    return {
      passwordConfigured:
        source.passwordConfigured,
      googleLinked: source.googleLinked,
      passkeyCount,
    };
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => {
      if (!current || !settings) return current;

      return reconcilePreferred(
        { ...current, ...patch },
        contextFrom(settings),
      );
    });
  }

  async function persistPreferences(
    values: Draft,
    options: {
      refreshSession?: boolean;
      successMessage?: string;
    } = {},
  ) {
    const { data, error: updateError } =
      await supabase.rpc(
        "update_current_user_auth_preferences",
        {
          p_allow_password: values.allowPassword,
          p_allow_magic_link:
            values.allowMagicLink,
          p_allow_google: values.allowGoogle,
          p_allow_passkey: values.allowPasskey,
          p_preferred_method:
            values.preferredMethod,
          p_require_mfa: values.requireMfa,
        },
      );

    if (updateError) throw updateError;

    const normalized = normalizeSettings(data);
    setSettings(normalized);
    setDraft(draftFromSettings(normalized));

    if (options.successMessage) {
      setNotice(options.successMessage);
    }

    if (options.refreshSession) {
      const { error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError) {
        await supabase.auth.signOut({
          scope: "local",
        });

        window.location.assign(
          `/login?message=${encodeURIComponent(
            "Configurações salvas. Entre novamente usando um método autorizado.",
          )}`,
        );
        return normalized;
      }

      if (
        normalized.effectiveMfaRequired &&
        normalized.currentAal !== "aal2"
      ) {
        router.push(
          `/auth/mfa?next=${encodeURIComponent(
            "/dashboard/profile",
          )}`,
        );
      } else {
        router.refresh();
      }
    }

    return normalized;
  }

  async function savePreferences() {
    if (!draft) return;

    setBusy("preferences");
    setError(null);
    setNotice(null);

    try {
      if (enabledCount(draft) < 1) {
        throw new Error(
          "at_least_one_auth_method_required",
        );
      }

      await persistPreferences(draft, {
        refreshSession: true,
        successMessage:
          "Formas de acesso atualizadas.",
      });
    } catch (saveError) {
      setError(humanError(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function linkGoogle() {
    if (!settings) return;

    setBusy("google");
    setError(null);
    setNotice(null);

    try {
      const enabledDraft: Draft = {
        ...draftFromSettings(settings),
        allowGoogle: true,
      };

      await persistPreferences(enabledDraft);

      const profilePath =
        "/dashboard/profile?message=" +
        encodeURIComponent(
          "Conta Google vinculada com sucesso.",
        );
      const redirectTo =
        `${window.location.origin}/auth/callback?next=` +
        encodeURIComponent(profilePath);

      const { error: linkError } =
        await supabase.auth.linkIdentity({
          provider: "google",
          options: {
            redirectTo,
          },
        });

      if (linkError) throw linkError;
    } catch (linkError) {
      setError(humanError(linkError));
      setBusy(null);
    }
  }

  async function registerPasskey() {
    if (!settings) return;

    setBusy("register-passkey");
    setError(null);
    setNotice(null);

    try {
      const { error: registerError } =
        await supabase.auth.registerPasskey();

      if (registerError) throw registerError;

      await persistPreferences({
        ...draftFromSettings(settings),
        allowPasskey: true,
      });

      setNotice(
        "Passkey cadastrada e acesso por biometria habilitado.",
      );
      await loadAll();
    } catch (registerError) {
      setError(humanError(registerError));
    } finally {
      setBusy(null);
    }
  }

  async function renamePasskey(
    passkey: PasskeyRecord,
  ) {
    const currentName =
      passkey.friendly_name ??
      passkey.friendlyName ??
      "Minha passkey";
    const friendlyName = window.prompt(
      "Nome para identificar esta passkey:",
      currentName,
    );

    if (!friendlyName?.trim()) return;

    setBusy(`rename-${passkey.id}`);
    setError(null);

    try {
      const { error: updateError } =
        await supabase.auth.passkey.update({
          passkeyId: passkey.id,
          friendlyName: friendlyName
            .trim()
            .slice(0, 120),
        });

      if (updateError) throw updateError;
      await loadAll();
    } catch (updateError) {
      setError(humanError(updateError));
    } finally {
      setBusy(null);
    }
  }

  async function deletePasskey(
    passkey: PasskeyRecord,
  ) {
    if (!settings) return;

    const savedDraft = draftFromSettings(settings);

    if (
      savedDraft.allowPasskey &&
      enabledCount(savedDraft) === 1 &&
      passkeys.length <= 2
    ) {
      setError(
        "Cadastre outra forma de acesso antes de remover esta passkey.",
      );
      return;
    }

    if (
      !window.confirm(
        "Remover esta passkey do acesso à conta?",
      )
    ) {
      return;
    }

    setBusy(`delete-${passkey.id}`);
    setError(null);
    setNotice(null);

    try {
      const isLast = passkeys.length === 1;

      if (isLast && savedDraft.allowPasskey) {
        await persistPreferences(
          reconcilePreferred(
            {
              ...savedDraft,
              allowPasskey: false,
            },
            contextFrom(settings, 0),
          ),
        );
      }

      const { error: deleteError } =
        await supabase.auth.passkey.delete({
          passkeyId: passkey.id,
        });

      if (deleteError) throw deleteError;

      setNotice("Passkey removida.");
      await loadAll();
    } catch (deleteError) {
      setError(humanError(deleteError));
    } finally {
      setBusy(null);
    }
  }

  async function startTotpEnrollment() {
    setBusy("start-totp");
    setError(null);
    setNotice(null);

    try {
      const { data: factorList, error: listError } =
        await supabase.auth.mfa.listFactors();

      if (listError) throw listError;

      const pendingFactors = (
        factorList.all ?? []
      ).filter(
        (factor) =>
          factor.factor_type === "totp" &&
          factor.status !== "verified",
      );

      for (const pending of pendingFactors) {
        await supabase.auth.mfa.unenroll({
          factorId: pending.id,
        });
      }

      const verifiedTotp = (
        factorList.all ?? []
      ).filter(
        (factor) =>
          factor.factor_type === "totp" &&
          factor.status === "verified",
      );

      const { data, error: enrollError } =
        await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `MonitorIA Authenticator ${
            verifiedTotp.length + 1
          }`,
        });

      if (enrollError) throw enrollError;

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setEnrollmentCode("");
    } catch (enrollError) {
      setError(humanError(enrollError));
    } finally {
      setBusy(null);
    }
  }

  async function verifyTotpEnrollment() {
    if (
      !enrollment ||
      enrollmentCode.length < 6
    ) {
      setError(
        "Informe o código de seis dígitos do autenticador.",
      );
      return;
    }

    setBusy("verify-totp");
    setError(null);
    setNotice(null);

    try {
      const { error: verifyError } =
        await supabase.auth.mfa.challengeAndVerify({
          factorId: enrollment.factorId,
          code: enrollmentCode,
        });

      if (verifyError) throw verifyError;

      setEnrollment(null);
      setEnrollmentCode("");
      setNotice(
        "Autenticação em duas etapas configurada.",
      );
      await loadAll();
      router.refresh();
    } catch (verifyError) {
      setError(humanError(verifyError));
    } finally {
      setBusy(null);
    }
  }

  async function removeTotp(factor: TotpFactor) {
    if (
      settings?.effectiveMfaRequired &&
      factors.length <= 1
    ) {
      setError(
        "Esta conta exige 2FA. Altere a política ou cadastre outro autenticador antes de remover o último fator.",
      );
      return;
    }

    if (
      !window.confirm(
        "Remover este autenticador da conta?",
      )
    ) {
      return;
    }

    setBusy(`totp-${factor.id}`);
    setError(null);
    setNotice(null);

    try {
      const { error: removeError } =
        await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });

      if (removeError) throw removeError;

      setNotice("Autenticador removido.");
      await loadAll();
    } catch (removeError) {
      setError(humanError(removeError));
    } finally {
      setBusy(null);
    }
  }

  async function saveOrganizationPolicy() {
    if (
      !settings?.currentOrganizationId ||
      !settings.canManageOrganizationPolicy
    ) {
      return;
    }

    setBusy("organization-policy");
    setError(null);
    setNotice(null);

    try {
      const { data, error: policyError } =
        await supabase.rpc(
          "update_current_organization_mfa_policy",
          {
            p_organization_id:
              settings.currentOrganizationId,
            p_mfa_policy: organizationPolicy,
          },
        );

      if (policyError) throw policyError;

      const normalized = normalizeSettings(data);
      setSettings(normalized);
      setDraft(draftFromSettings(normalized));
      setNotice(
        "Política de autenticação da empresa atualizada.",
      );

      const { error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError) throw refreshError;

      if (
        normalized.effectiveMfaRequired &&
        normalized.currentAal !== "aal2"
      ) {
        router.push(
          `/auth/mfa?next=${encodeURIComponent(
            "/dashboard/profile",
          )}`,
        );
      } else {
        router.refresh();
      }
    } catch (policyError) {
      setError(humanError(policyError));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        Carregando configurações de segurança...
      </div>
    );
  }

  if (!settings || !draft) {
    return (
      <div className={styles.error}>
        {error ??
          "As configurações de segurança ainda não foram aplicadas no Supabase."}
      </div>
    );
  }

  const availability = methodAvailability(
    draft,
    contextFrom(settings),
  );

  const preferredOptions: Array<{
    value: PreferredMethod;
    label: string;
    enabled: boolean;
  }> = [
    {
      value: "password",
      label: "Senha",
      enabled: availability.password,
    },
    {
      value: "magic_link",
      label: "Link mágico",
      enabled: availability.magic_link,
    },
    {
      value: "google",
      label: "Google",
      enabled: availability.google,
    },
    {
      value: "passkey",
      label: "Biometria / passkey",
      enabled: availability.passkey,
    },
  ];

  const availableOptions =
    preferredOptions.filter(
      (option) => option.enabled,
    );

  return (
    <div className={styles.root}>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className={styles.success}>
          {notice}
        </div>
      ) : null}

      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <span>MÉTODOS DE ACESSO</span>
            <h3>Como você pode entrar</h3>
          </div>
          <small>
            A regra é aplicada no Auth Hook, não apenas
            na interface.
          </small>
        </div>

        <div className={styles.methodGrid}>
          <label
            className={`${styles.method} ${
              !settings.passwordConfigured
                ? styles.unavailable
                : ""
            }`}
          >
            <input
              type="checkbox"
              checked={draft.allowPassword}
              disabled={!settings.passwordConfigured}
              onChange={(event) =>
                updateDraft({
                  allowPassword:
                    event.target.checked,
                })
              }
            />
            <span>
              <strong>Senha</strong>
              <small>
                {settings.passwordConfigured
                  ? "Senha cadastrada."
                  : "Crie uma senha no formulário acima."}
              </small>
            </span>
          </label>

          <label className={styles.method}>
            <input
              type="checkbox"
              checked={draft.allowMagicLink}
              onChange={(event) =>
                updateDraft({
                  allowMagicLink:
                    event.target.checked,
                })
              }
            />
            <span>
              <strong>Link mágico</strong>
              <small>
                Recebido em {userEmail}.
              </small>
            </span>
          </label>

          <label
            className={`${styles.method} ${
              !settings.googleLinked
                ? styles.unavailable
                : ""
            }`}
          >
            <input
              type="checkbox"
              checked={draft.allowGoogle}
              disabled={!settings.googleLinked}
              onChange={(event) =>
                updateDraft({
                  allowGoogle:
                    event.target.checked,
                })
              }
            />
            <span>
              <strong>Google</strong>
              <small>
                {settings.googleLinked
                  ? "Conta Google vinculada."
                  : "Vincule sua conta abaixo."}
              </small>
            </span>
          </label>

          <label
            className={`${styles.method} ${
              passkeys.length === 0
                ? styles.unavailable
                : ""
            }`}
          >
            <input
              type="checkbox"
              checked={draft.allowPasskey}
              disabled={passkeys.length === 0}
              onChange={(event) =>
                updateDraft({
                  allowPasskey:
                    event.target.checked,
                })
              }
            />
            <span>
              <strong>Biometria / passkey</strong>
              <small>
                {passkeys.length
                  ? `${passkeys.length} credencial(is) cadastrada(s).`
                  : "Cadastre uma passkey abaixo."}
              </small>
            </span>
          </label>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span>Método preferido</span>
            <select
              value={draft.preferredMethod}
              disabled={
                availableOptions.length === 0
              }
              onChange={(event) =>
                updateDraft({
                  preferredMethod: event.target
                    .value as PreferredMethod,
                })
              }
            >
              {availableOptions.length ? (
                availableOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))
              ) : (
                <option
                  value={draft.preferredMethod}
                >
                  Nenhum método disponível
                </option>
              )}
            </select>
          </label>

          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={draft.requireMfa}
              onChange={(event) =>
                updateDraft({
                  requireMfa:
                    event.target.checked,
                })
              }
            />
            <span>
              <strong>Exigir 2FA na minha conta</strong>
              <small>
                Solicita o código TOTP depois do primeiro
                método de acesso.
              </small>
            </span>
          </label>
        </div>

        <button
          type="button"
          className={styles.primary}
          onClick={savePreferences}
          disabled={busy !== null}
        >
          {busy === "preferences"
            ? "Salvando..."
            : "Salvar métodos de acesso"}
        </button>
      </section>

      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <span>GOOGLE</span>
            <h3>Conta vinculada</h3>
          </div>
        </div>

        <div className={styles.inlinePanel}>
          <div>
            <strong>
              {settings.googleLinked
                ? "Google conectado"
                : "Google ainda não vinculado"}
            </strong>
            <p>
              {settings.googleLinked
                ? "Você pode autorizar ou bloquear o login Google nas preferências acima."
                : "A vinculação é feita pelo OAuth oficial do Supabase e Google."}
            </p>
          </div>

          {!settings.googleLinked ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={linkGoogle}
              disabled={busy !== null}
            >
              {busy === "google"
                ? "Abrindo Google..."
                : "Vincular Google"}
            </button>
          ) : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <span>PASSKEYS</span>
            <h3>Biometria e dispositivos</h3>
          </div>
          <small>
            Para usar somente passkey, mantenha duas
            credenciais em dispositivos diferentes.
          </small>
        </div>

        <div className={styles.list}>
          {passkeys.length ? (
            passkeys.map((passkey) => {
              const name =
                passkey.friendly_name ??
                passkey.friendlyName ??
                "Passkey";
              const created =
                passkey.created_at ??
                passkey.createdAt;
              const lastUsed =
                passkey.last_used_at ??
                passkey.lastUsedAt;

              return (
                <div
                  key={passkey.id}
                  className={styles.listItem}
                >
                  <div>
                    <strong>{name}</strong>
                    <p>
                      Criada: {dateLabel(created)}
                      <br />
                      Último uso:{" "}
                      {dateLabel(lastUsed)}
                    </p>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={() =>
                        renamePasskey(passkey)
                      }
                      disabled={busy !== null}
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() =>
                        deletePasskey(passkey)
                      }
                      disabled={busy !== null}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.empty}>
              Nenhuma passkey cadastrada.
            </div>
          )}
        </div>

        <button
          type="button"
          className={styles.secondary}
          onClick={registerPasskey}
          disabled={busy !== null}
        >
          {busy === "register-passkey"
            ? "Aguardando o dispositivo..."
            : "Cadastrar nova passkey"}
        </button>
      </section>

      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <span>AUTENTICAÇÃO EM DUAS ETAPAS</span>
            <h3>Aplicativos autenticadores</h3>
          </div>
          <small>
            Sessão atual:{" "}
            {settings.currentAal === "aal2"
              ? "AAL2"
              : "AAL1"}
          </small>
        </div>

        {enrollment ? (
          <div className={styles.enrollment}>
            <img
              src={qrSource(enrollment.qrCode)}
              alt="QR Code do autenticador"
            />
            <div>
              <strong>
                Escaneie no aplicativo autenticador
              </strong>
              <p>
                Chave manual:
                <code>{enrollment.secret}</code>
              </p>
              <div className={styles.verifyRow}>
                <input
                  value={enrollmentCode}
                  onChange={(event) =>
                    setEnrollmentCode(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6),
                    )
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
                <button
                  type="button"
                  className={styles.primary}
                  onClick={verifyTotpEnrollment}
                  disabled={busy !== null}
                >
                  {busy === "verify-totp"
                    ? "Verificando..."
                    : "Ativar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.list}>
          {factors.length ? (
            factors.map((factor, index) => (
              <div
                key={factor.id}
                className={styles.listItem}
              >
                <div>
                  <strong>
                    {factor.friendly_name ||
                      `Autenticador ${index + 1}`}
                  </strong>
                  <p>
                    Ativo desde{" "}
                    {dateLabel(factor.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => removeTotp(factor)}
                  disabled={busy !== null}
                >
                  Remover
                </button>
              </div>
            ))
          ) : (
            <div className={styles.empty}>
              Nenhum autenticador TOTP cadastrado.
            </div>
          )}
        </div>

        {!enrollment ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={startTotpEnrollment}
            disabled={busy !== null}
          >
            {busy === "start-totp"
              ? "Preparando..."
              : "Adicionar autenticador"}
          </button>
        ) : null}
      </section>

      {settings.canManageOrganizationPolicy &&
      settings.currentOrganizationId ? (
        <section className={styles.section}>
          <div className={styles.heading}>
            <div>
              <span>POLÍTICA DA EMPRESA</span>
              <h3>Obrigatoriedade de 2FA</h3>
            </div>
            <small>
              Aplicada a todos os acessos da organização.
            </small>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>Exigir autenticação em duas etapas</span>
              <select
                value={organizationPolicy}
                onChange={(event) =>
                  setOrganizationPolicy(
                    event.target
                      .value as OrganizationMfaPolicy,
                  )
                }
              >
                <option value="optional">
                  Cada usuário decide
                </option>
                <option value="admins">
                  Proprietários e administradores
                </option>
                <option value="all">
                  Todos os usuários
                </option>
              </select>
            </label>

            <button
              type="button"
              className={styles.primary}
              onClick={saveOrganizationPolicy}
              disabled={busy !== null}
            >
              {busy === "organization-policy"
                ? "Salvando..."
                : "Salvar política"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}