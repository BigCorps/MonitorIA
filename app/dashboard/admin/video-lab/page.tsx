import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminShell } from "../admin-shell";
import { VideoLabClient } from "./video-lab-client";
import styles from "./video-lab.module.css";

export const metadata = { title: "Vídeo Lab · Admin MonitorIA" };
export const dynamic = "force-dynamic";

export default async function AdminVideoLabPage() {
  const user = await requireInternalOperator();

  return (
    <AdminShell
      admin={{ email: user.email }}
      active="video-lab"
      eyebrow="LABORATÓRIO · VÍDEO LOCAL"
      title="Analisar gravação sem enviar o vídeo"
      description="Teste interno para validar uma futura fonte por upload. O navegador procura mudanças no arquivo local e envia somente quadros selecionados para a IA do MonitorIA."
    >
      <section className={styles.notice}>
        <strong>POC interna · não grava o vídeo original</strong>
        <p>
          O arquivo permanece neste dispositivo. Nesta fase não criamos câmera,
          evento, storage ou cobrança: usamos apenas quadros temporários para medir
          detecção local, qualidade da análise, latência e custo da IA.
        </p>
      </section>

      <VideoLabClient />
    </AdminShell>
  );
}
