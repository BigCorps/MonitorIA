import Link from "next/link";
import { InstallerPlatformActions } from "@/src/components/installer-platform-actions";
import styles from "./instalar.module.css";

export const metadata = {
  title: "Instalar MonitorIA",
  description: "Baixe o MonitorIA Agent para o computador que ficará conectado às câmeras.",
};

export default function InstallPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link href="/" className={styles.brand}>
          <img src="/favicon.svg" alt="" width={30} height={30} />
          <span>Monitor<em>IA</em>.cam</span>
        </Link>

        <span className={styles.kicker}>INSTALAÇÃO DO AGENT</span>
        <h1>Instale no computador da rede das câmeras</h1>
        <p>
          Este computador fará a ponte entre suas câmeras e o MonitorIA. Depois
          de instalar, volte ao dashboard no celular ou computador onde iniciou
          o cadastro e gere o código de pareamento.
        </p>

        <div className={styles.rules}>
          <div><span>✓</span> O computador deve estar na mesma rede local das câmeras, DVR ou NVR.</div>
          <div><span>✓</span> Ele precisa permanecer ligado enquanto o MonitorIA estiver monitorando.</div>
          <div><span>✓</span> Windows 10/11 64 bits e Linux x64/ARM64 são compatíveis.</div>
        </div>

        <InstallerPlatformActions compact />

        <Link className={styles.back} href="/login">
          Já instalou? Voltar ao MonitorIA
        </Link>
      </section>
    </main>
  );
}
