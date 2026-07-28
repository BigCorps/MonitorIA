# MonitorIA v0.6.0

## Perfil inteligente da câmera

- analisa manualmente o primeiro frame com GPT-5 mini;
- usa a Responses API com entrada de imagem e Structured Outputs;
- trata textos presentes na imagem como conteúdo não confiável;
- proíbe reconhecimento facial e inferências sensíveis;
- cria descrição do ambiente, objetivos, instruções de ignorar e notas de privacidade;
- sugere zonas normalizadas sobre o frame;
- salva cada análise como uma nova versão inativa;
- exige aprovação de proprietário ou administrador;
- ao aprovar, desativa a versão anterior e atualiza a câmera;
- registra tokens, custo estimado, modelo, latência e response ID;
- preserva o frame de referência por pelo menos sete dias;
- mostra o frame, as zonas e o perfil no painel.

## Banco

A migration `camera_profile_intelligence` foi aplicada e testada no Supabase.
O teste criou e ativou um perfil dentro de uma transação, seguido de rollback.
