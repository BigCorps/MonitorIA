# Meeting / MonitorIA — arquitetura técnica do piloto

## 1. RTMP: sidecar, não fork do Agent

O piloto mantém o Agent 1.0.3 sem alteração funcional. O RTMP fica isolado em
um processo local independente baseado no MediaMTX.

O MediaMTX puxa o stream RTMP/RTMPS do servidor da Meeting e o publica como
RTSP exclusivamente em `127.0.0.1:8554`. O Agent continua enxergando uma fonte
RTSP comum.

Vantagens:

- não cria um fork do Core 1.0.3;
- não interfere em ONVIF ou RTSP atuais;
- rollback é apenas parar/remover o sidecar;
- a URL RTMP fica somente na máquina do cliente;
- não é preciso abrir porta de entrada no firewall no modo pull;
- o mesmo pipeline de movimento, timeline, evidência e fila permanece intacto.

## 2. Pull x push

RTMP pode ser usado tanto para publicação quanto para leitura.

Neste piloto a arquitetura preferida é **pull**:

```text
Meeting server -> URL reproduzível -> sidecar -> RTSP local -> Agent
```

Isso exige que a Meeting forneça um endpoint de reprodução.

Alguns DVRs/câmeras, inclusive modelos que oferecem RTMP, implementam o RTMP
principalmente como **saída/publicação** para um servidor. Portanto não se deve
presumir que uma URL configurada no DVR seja também uma URL de playback.

Se a Meeting só tiver push, a segunda arquitetura possível é:

```text
câmera/servidor -> RTMP push -> sidecar -> RTSP local -> Agent
```

Mas ela exige listener de rede, autenticação, regra de firewall e, idealmente,
restrição por IP. Isso deve ser habilitado apenas depois de conhecermos o
servidor e o endereço de origem reais.

## 3. Segurança do sidecar

- RTSP local escuta apenas `127.0.0.1`.
- HLS, WebRTC, SRT, MoQ, API, metrics e pprof ficam desligados.
- O listener RTMP local fica desligado no modo pull.
- A URL RTMP/RTMPS é protegida por DPAPI LocalMachine.
- O segredo não fica no YAML.
- A pasta de instalação recebe ACL apenas para SYSTEM e Administradores.
- O instalador valida o SHA-256 do ZIP do MediaMTX contra o arquivo oficial
  `checksums.sha256` da release fixada.
- A tarefa de boot não recebe a URL secreta na linha de comando.

## 4. Compatibilidade

Para homologação inicial, H.264 é a matriz preferencial.

O MediaMTX atual suporta RTMP/RTMPS e também Enhanced RTMP, mas codecs modernos
podem exigir opções específicas no leitor. Como o objetivo do piloto é isolar
risco e comprovar o transporte, H.264 deve ser o primeiro formato testado.

O áudio não é necessário para o pipeline MonitorIA atual.

## 5. Critérios de aceite RTMP

1. bridge inicia após boot;
2. URL RTMP não aparece em arquivo de configuração em texto puro;
3. `127.0.0.1:8554` responde;
4. Agent valida `rtsp://127.0.0.1:8554/meeting`;
5. 30 minutos contínuos sem interrupção;
6. desligar/religar a origem produz reconexão;
7. evento de movimento gera start/peak/end;
8. plano Detalhada gera clipe;
9. uma câmera RTSP/ONVIF existente continua normal;
10. reiniciar Windows recupera bridge + Agent sem intervenção.

## 6. Classificação visual criança/adulto

A classificação vive no mesmo Structured Output do acontecimento, por pessoa:

```text
apparentAgeGroup = child | adult | unknown
apparentAgeGroupConfidence = 0..1
```

O recurso só é habilitado quando o perfil ativo contém:

```text
PROINF_CHILD_ADULT_CLASSIFICATION
```

Esse marcador é filtrado da lista de objetivos enviada ao modelo; ele serve
apenas como feature flag interno.

Quando desabilitado, o servidor força:

```text
apparentAgeGroup = unknown
apparentAgeGroupConfidence = 0
```

Quando habilitado, a instrução permite somente uma classe visual ampla e
conservadora. Um provável `child` com confiança >= 0,60 recebe:

```text
tag: probable_child
requiresReview: true
reviewReason: child_age_group_requires_human_review
```

A aplicação também reforça essa revisão depois do retorno estruturado, em vez
de depender apenas da instrução ao modelo.

## 7. O que o piloto infantil não faz

Não é um classificador jurídico de idade e não é um sistema de identidade.

Ele não deve concluir:

- idade numérica;
- maioridade/menoridade legal;
- nome/identidade;
- parentesco;
- responsável legal;
- abandono;
- exploração;
- abuso;
- criminalidade;
- vulnerabilidade social.

Essas conclusões exigem contexto externo e revisão humana.

## 8. Amostra mínima de validação

Avaliar manualmente cenas consentidas/de teste com:

- adulto sozinho;
- criança sozinha;
- criança + adulto;
- pessoa muito distante;
- oclusão parcial;
- baixa iluminação;
- câmera em ângulo alto;
- pessoa sentada/agachada;
- cena sem pessoas.

O principal indicador inicial é a qualidade do uso de `unknown` em casos
ambíguos, e não apenas uma taxa bruta de acerto.
