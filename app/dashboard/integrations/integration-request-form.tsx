"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  integrationAccessStatuses,
  integrationBusinessTypes,
  integrationGroups,
  integrationUseCases,
} from "@/src/lib/integration-catalog";
import {
  submitIntegrationRequest,
  type IntegrationRequestActionState,
} from "./integration-request-actions";
import integrationStyles from "./integration-request.module.css";

const initialIntegrationRequestState: IntegrationRequestActionState = {
  status: "idle",
  message: "",
};

export function IntegrationRequestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    submitIntegrationRequest,
    initialIntegrationRequestState,
  );

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <section className={integrationStyles.requestSection} id="solicitar-integracao">
      <div className={integrationStyles.sectionHeading}>
        <div>
          <span>SOLICITAR INTEGRAÇÃO</span>
          <h2>Conte qual sistema sua operação já utiliza</h2>
          <p>
            Você não precisa entender de API. Selecione os sistemas e descreva o
            que quer cruzar com as câmeras; a BigCorps avalia o acesso técnico.
          </p>
        </div>
        <div className={integrationStyles.pilotBadge}>AVALIAÇÃO INDIVIDUAL</div>
      </div>

      <div className={integrationStyles.commercialNotice}>
        <strong>Como funciona a avaliação</strong>
        <p>
          A presença de um nome abaixo não significa integração já homologada.
          Primeiro verificamos se o fornecedor disponibiliza API ou outro acesso
          compatível. Dependendo da complexidade, pode existir um valor adicional
          de implantação ou desenvolvimento. Qualquer valor é informado antes do
          início do trabalho. Eventuais taxas cobradas pelo próprio fornecedor são
          independentes do MonitorIA.
        </p>
      </div>

      <form ref={formRef} action={formAction} className={integrationStyles.form}>
        <div className={integrationStyles.systemGroups}>
          {integrationGroups.map((group) => (
            <fieldset className={integrationStyles.systemGroup} key={group.id}>
              <legend>{group.label}</legend>
              <p>{group.description}</p>
              <div className={integrationStyles.optionGrid}>
                {group.options.map((option) => (
                  <label className={integrationStyles.optionCard} key={option.key}>
                    <input type="checkbox" name="systems" value={option.key} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className={integrationStyles.formGrid}>
          <label className={integrationStyles.field}>
            <span>Se marcou “Outro”, qual sistema?</span>
            <input
              name="other_system"
              maxLength={180}
              placeholder="Ex.: sistema próprio, outro PDV, outra plataforma"
            />
          </label>

          <label className={integrationStyles.field}>
            <span>Tipo de operação</span>
            <select name="business_type" defaultValue="restaurant">
              {integrationBusinessTypes.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className={integrationStyles.field}>
            <span>Locais no piloto</span>
            <input name="locations_count" type="number" min="1" max="999" defaultValue="1" />
          </label>

          <label className={integrationStyles.field}>
            <span>Câmeras no piloto</span>
            <input name="cameras_count" type="number" min="1" max="999" defaultValue="1" />
          </label>

          <label className={integrationStyles.field}>
            <span>Versão / modelo do sistema, se souber</span>
            <input
              name="version_notes"
              maxLength={500}
              placeholder="Ex.: GrandChef Online, versão do PDV, plano contratado..."
            />
          </label>

          <label className={integrationStyles.field}>
            <span>Você sabe se o sistema oferece integração?</span>
            <select name="integration_access" defaultValue="unknown">
              {integrationAccessStatuses.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className={integrationStyles.field}>
            <span>WhatsApp / telefone para retorno</span>
            <input name="contact_phone" maxLength={80} placeholder="Opcional" />
          </label>

          <label className={integrationStyles.field}>
            <span>Contato do suporte / fornecedor</span>
            <input
              name="supplier_contact"
              maxLength={300}
              placeholder="E-mail, telefone ou link de suporte, se tiver"
            />
          </label>
        </div>

        <fieldset className={integrationStyles.useCaseFieldset}>
          <legend>O que você quer cruzar com as câmeras?</legend>
          <div className={integrationStyles.useCaseGrid}>
            {integrationUseCases.map((item) => (
              <label className={integrationStyles.useCaseCard} key={item.key}>
                <input type="checkbox" name="use_cases" value={item.key} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className={integrationStyles.field}>
          <span>Explique rapidamente o cenário</span>
          <textarea
            name="details"
            maxLength={2000}
            rows={5}
            placeholder="Ex.: quero comparar produtos preparados e entregues com as vendas registradas e receber um relatório diário das divergências."
          />
        </label>

        <div className={integrationStyles.submitRow}>
          <p>
            A solicitação é uma avaliação técnica e comercial. Ela não ativa
            nenhuma cobrança automaticamente.
          </p>
          <button type="submit" disabled={pending}>
            {pending ? "Enviando..." : "Solicitar avaliação"}
          </button>
        </div>

        {state.status !== "idle" ? (
          <div
            className={
              state.status === "success"
                ? integrationStyles.successMessage
                : integrationStyles.errorMessage
            }
            role="status"
            aria-live="polite"
          >
            <strong>{state.status === "success" ? "Solicitação enviada" : "Não foi possível enviar"}</strong>
            <p>{state.message}</p>
            {state.requestId ? <small>Protocolo: {state.requestId}</small> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
