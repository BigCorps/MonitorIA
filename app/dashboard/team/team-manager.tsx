"use client";

import { useActionState, useState } from "react";
import type { PendingTeamInvitation, TeamMember, TeamRole } from "@/src/lib/team-data";
import {
  inviteTeamMemberAction,
  removeTeamMemberAction,
  revokeTeamInvitationAction,
  updateTeamMemberRoleAction,
  type TeamActionState,
} from "./actions";
import styles from "./team.module.css";

const initialState: TeamActionState = { status: "idle" };

const labels: Record<TeamRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
  viewer: "Visualizador",
};

const descriptions: Record<TeamRole, string> = {
  owner: "Controle total da empresa, equipe e cobrança.",
  admin: "Configura locais, Agents, câmeras e perfis. Ideal para a equipe técnica.",
  operator: "Acompanha a operação e consulta os dados, sem administrar equipe ou cobrança.",
  viewer: "Acesso de consulta, sem alterações de configuração.",
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export function TeamManager(props: {
  members: TeamMember[];
  invitations: PendingTeamInvitation[];
  currentUserId: string;
  currentRole: TeamRole;
  invitationsTableReady: boolean;
}) {
  const [state, action, pending] = useActionState(inviteTeamMemberAction, initialState);
  const [copied, setCopied] = useState(false);
  const canManage = props.currentRole === "owner" || props.currentRole === "admin";

  async function copyInvite() {
    if (!state.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.stack}>
      <section className={styles.permissions}>
        {(["owner", "admin", "operator", "viewer"] as TeamRole[]).map((role) => (
          <article key={role}>
            <strong>{labels[role]}</strong>
            <p>{descriptions[role]}</p>
          </article>
        ))}
      </section>

      {canManage ? (
        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <span>CONVIDAR</span>
              <h2>Adicionar pessoa à equipe</h2>
            </div>
            <small>O convite vale por 7 dias.</small>
          </div>

          {!props.invitationsTableReady ? (
            <div className={styles.warning}>
              A migration de convites da equipe ainda não foi aplicada no Supabase.
            </div>
          ) : (
            <form action={action} className={styles.inviteForm}>
              <label>
                <span>E-mail</span>
                <input name="email" type="email" autoComplete="email" placeholder="tecnico@empresa.com.br" required />
              </label>
              <label>
                <span>Nível de acesso</span>
                <select name="role" defaultValue="admin">
                  {props.currentRole === "owner" ? <option value="admin">Administrador</option> : null}
                  <option value="operator">Operador</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </label>
              <button type="submit" disabled={pending || !props.invitationsTableReady}>
                {pending ? "Enviando..." : "Enviar convite"}
              </button>
            </form>
          )}

          {state.status !== "idle" ? (
            <div className={state.status === "success" ? styles.success : styles.error}>
              <strong>{state.message}</strong>
              {state.inviteUrl ? (
                <div className={styles.inviteLink}>
                  <input value={state.inviteUrl} readOnly aria-label="Link do convite" />
                  <button type="button" onClick={() => void copyInvite()}>
                    {copied ? "Copiado" : "Copiar link"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.card}>
        <div className={styles.cardHeading}>
          <div>
            <span>EQUIPE</span>
            <h2>{props.members.length} pessoa(s) com acesso</h2>
          </div>
          <small>Todos acessam a mesma empresa e seus locais.</small>
        </div>

        <div className={styles.memberList}>
          {props.members.map((member) => {
            const isSelf = member.userId === props.currentUserId;
            const protectedMember =
              member.role === "owner" ||
              (props.currentRole === "admin" && member.role === "admin");

            return (
              <article className={styles.member} key={member.userId}>
                <div className={styles.identity}>
                  <strong>{member.fullName || member.email || "Usuário"}</strong>
                  <span>{member.email}</span>
                  <small>Desde {shortDate(member.createdAt)}</small>
                </div>

                <div className={styles.memberControls}>
                  {canManage && !protectedMember && !isSelf ? (
                    <form action={updateTeamMemberRoleAction}>
                      <input type="hidden" name="user_id" value={member.userId} />
                      <select name="role" defaultValue={member.role} aria-label={`Acesso de ${member.email}`}>
                        {props.currentRole === "owner" ? <option value="admin">Administrador</option> : null}
                        <option value="operator">Operador</option>
                        <option value="viewer">Visualizador</option>
                      </select>
                      <button type="submit">Salvar</button>
                    </form>
                  ) : (
                    <span className={styles.roleBadge}>{labels[member.role]}</span>
                  )}

                  {canManage && !protectedMember && !isSelf ? (
                    <form action={removeTeamMemberAction}>
                      <input type="hidden" name="user_id" value={member.userId} />
                      <button type="submit" className={styles.danger}>Remover</button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {props.invitations.length ? (
        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <span>PENDENTES</span>
              <h2>Convites aguardando aceite</h2>
            </div>
          </div>
          <div className={styles.memberList}>
            {props.invitations.map((invite) => (
              <article className={styles.member} key={invite.id}>
                <div className={styles.identity}>
                  <strong>{invite.email}</strong>
                  <span>{labels[invite.role]}</span>
                  <small>Expira em {shortDate(invite.expiresAt)}</small>
                </div>
                {canManage ? (
                  <form action={revokeTeamInvitationAction}>
                    <input type="hidden" name="invitation_id" value={invite.id} />
                    <button type="submit" className={styles.danger}>Cancelar convite</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
