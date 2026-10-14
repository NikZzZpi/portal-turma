# Portal da Turma — versão gratuita com Firebase Spark

O portal usa **HTML, CSS e JavaScript**, com o site no **GitHub Pages** e os dados no **Firebase Spark**. Esta versão utiliza somente Firebase Authentication e Cloud Firestore, dentro das cotas gratuitas. **Não precisa de cartão, servidor próprio, Cloud Functions, Cloud Storage ou plano Blaze.**

A configuração inicial é feita pelo navegador: criar o projeto Firebase, publicar as regras, preencher `docs/js/config.js`, publicar a pasta `docs` no GitHub Pages e indicar no banco quem será o responsável principal. Depois disso, os conteúdos são administrados pelo próprio portal.

JavaScript é necessário para login, calendário, formulários e conexão com o banco. O Firebase aplica as permissões a cada acesso. Os arquivos públicos no GitHub contêm o código do aplicativo; os dados da turma ficam no banco protegido.

**Se você já publicou a versão anterior que usava Cloud Functions e Blaze, leia primeiro a seção 12.**

## 1. O que está incluído

| Área | Funcionalidades |
| --- | --- |
| Entrada | Login Google ou e-mail/senha, verificação de e-mail, recuperação de senha e entrada exclusiva para integrantes autorizados |
| Mural | Avisos fixados, destaques, rascunhos, validade, vínculo com eventos e confirmação de leitura dos avisos importantes |
| Calendário | Visualizações mensal, semanal e em lista; provas, trabalhos, apresentações, reuniões e atividades; datas, horários, locais, links e exportação `.ics` |
| Acompanhamento | Alertas internos de prazos próximos, registro de mudanças de data, eventos previstos/confirmados/concluídos e indicação de conflitos |
| Matérias | Mural por disciplina com materiais, anotações, exercícios, referências, grupos de estudo, avisos e prazos |
| Professores | Contatos, horários de atendimento, plataforma principal, até dez links adicionais com finalidade e data de conferência |
| Aulas e semestres | Quadro de horários, salas, consulta de semestres e assistente para copiar matérias e horários para um novo período |
| Participação | Solicitações, acompanhamento das respostas, complementos e aprovação de contribuições pela administração |
| Organização pessoal | Favoritos, checklist das atividades, tema claro/escuro, tela inicial e matéria preferida |
| Caixa | Entradas, saídas, categorias, metas, saldo, comprovantes por links privados, estornos e exportação CSV |
| Gestão | Convites, revogação, suspensão de acesso, papéis de aluno/administrador, arquivamento, histórico e cópia dos dados autorizados |

Materiais são compartilhados por links do Moodle, Classroom, Drive ou outro serviço usado pela turma. O portal não armazena os arquivos nem altera suas permissões de compartilhamento.

Os alertas aparecem dentro do site. Notificações push, mensagens automáticas, integração automática com plataformas de professores, aplicativo offline e pagamentos não estão implementados nesta versão.

## 2. Permissões

| Ação | Aluno | Administrador | Responsável principal |
| --- | --- | --- | --- |
| Consultar conteúdos publicados | Sim | Sim | Sim |
| Alterar favoritos, checklist e preferências | Apenas os próprios | Apenas os próprios | Apenas os próprios |
| Enviar e acompanhar solicitações | Apenas as próprias | Sim | Sim |
| Publicar e editar conteúdos compartilhados | Não | Sim | Sim |
| Analisar solicitações e consultar confirmações de leitura | Não | Sim | Sim |
| Registrar e estornar movimentos do caixa | Não | Sim | Sim |
| Convidar e suspender integrantes; definir aluno ou administrador | Não | Não | Sim |
| Exportar os dados administrativos autorizados | Não | Não | Sim |

Há **um responsável principal**, definido pelo UID da conta no Firebase Console. O aplicativo não permite que essa conta seja rebaixada ou suspensa. A recuperação ou troca do responsável é uma manutenção feita por quem tem acesso ao projeto no Console.

Os demais alunos enviam contribuições pela área de solicitações. Somente os administradores e o responsável publicam ou editam informações compartilhadas. O checklist e os favoritos pertencem à própria pessoa e não mudam o conteúdo da turma.

Solicitações ficam restritas ao autor e à administração. Comprovantes financeiros ficam restritos à administração e ao contribuinte vinculado. Favoritos, checklist e preferências de outros integrantes não ficam disponíveis nem ao responsável, inclusive na exportação administrativa.

## 3. Cotas gratuitas e uso da turma

Mantenha o projeto no plano **Spark**, sem vincular uma conta de faturamento. Vincular faturamento pode promover o projeto para Blaze. O portal foi adaptado para funcionar sem serviços que exigem esse plano.

Os limites oficiais consultados em outubro de 2026 incluem:

| Recurso do Cloud Firestore Standard | Cota gratuita |
| --- | --- |
| Dados armazenados | 1 GiB |
| Leituras de documentos | 50.000 por dia |
| Gravações de documentos | 20.000 por dia |
| Exclusões de documentos | 20.000 por dia |
| Transferência de saída | 10 GiB por mês |
| Bancos com cota gratuita | Um por projeto |

As cotas diárias do Firestore são renovadas por volta da meia-noite no fuso do Pacífico. As consultas usadas pelas regras de segurança e pelas somas financeiras também entram no uso do banco. Se uma cota for atingida, operações podem ficar indisponíveis até a renovação correspondente. **Gratuito não significa uso ilimitado ou disponibilidade garantida.**

Os métodos de autenticação utilizados têm cotas próprias, como mil e-mails de verificação por dia e 150 e-mails de recuperação de senha por dia no Spark. Não é necessário ativar login por telefone/SMS nem recursos avançados do Identity Platform para esta turma.

O número de 44 integrantes, sozinho, não determina o consumo. Quantidade de registros, acessos, atualizações e exportações também influenciam. Acompanhe **Firestore Database → Usage** no Console. A interface usa páginas de até cem registros, reaproveita consultas recentes durante a sessão e não mantém atualização automática contínua.

O GitHub Pages é gratuito com **repositório público** no GitHub Free. O domínio `SEU-USUARIO.github.io` está incluído; domínio próprio é opcional. Os limites publicados incluem 1 GB para o site e limite flexível de 100 GB de transferência por mês.

## 4. Pastas do pacote

Extraia o ZIP e mantenha a organização fornecida:

```text
portal-turma/
  docs/
    index.html
    assets/
    js/
      config.js
      ...demais arquivos JavaScript
  firestore.rules
  firestore.indexes.json
  firebase.json
  package.json
  preview.mjs
  tests/
  LEIA-ME.md
  CONTRATO.md
  SPARK-CONTRATO.md
```

`docs/` é a pasta publicada no GitHub Pages. `firestore.rules` protege os dados, e `firestore.indexes.json` descreve os índices usados pelas consultas.

Você pode enviar a estrutura pronta para o GitHub, sem criar manualmente cada pasta. Se preferir copiar e colar o código, conserve os nomes, as extensões e os caminhos. Não existe etapa de compilação do HTML nem publicação de funções nesta versão.

## 5. Criar e configurar o Firebase

### 5.1 Projeto e autenticação

1. Acesse [Firebase Console](https://console.firebase.google.com/) e crie um projeto novo, por exemplo `portal-turma-spark`.
2. Anote o **ID do projeto**, que pode ser diferente do nome de exibição.
3. Confirme que o plano é **Spark**. A configuração descrita aqui não exige vincular cartão ou conta de faturamento.
4. Abra **Authentication → Sign-in method** e habilite **Google**. Preencha o e-mail de suporte solicitado.
5. Habilite também **E-mail/senha** se quiser oferecer essa alternativa de entrada. O aplicativo exige endereço verificado.

A conta usada para administrar o Firebase Console e a conta usada para entrar no portal podem ser a mesma, mas são permissões distintas. Ter acesso ao Console não transforma automaticamente uma conta em responsável dentro do site.

### 5.2 Banco e regras

1. Em **Firestore Database**, crie o banco na edição **Standard**, usando o banco padrão `(default)` e o **modo de produção**.
2. Escolha a região **São Paulo — `southamerica-east1`**, quando disponível. A localização é definida na criação do banco.
3. Abra a aba **Rules/Regras**.
4. Abra o arquivo `firestore.rules` do pacote no seu editor de texto e copie **todo** o conteúdo.
5. Substitua o conteúdo da aba Regras e clique em **Publish/Publicar**.
6. Prepare também os índices de `firestore.indexes.json`, conforme a seção 11, antes da conferência final com contas de aluno.

As regras verificam conta autenticada, e-mail confirmado, autorização da turma, papel de acesso e consistência das alterações. Elas são parte obrigatória da instalação. Não use regras públicas de teste como `allow read, write: if true`.

### 5.3 Configuração do aplicativo Web

1. Nas configurações do projeto, adicione um aplicativo Web pelo símbolo `</>`.
2. Dê um nome ao aplicativo. O site será hospedado no GitHub Pages.
3. Copie os valores do objeto `firebaseConfig` exibido pelo Console.
4. Abra `docs/js/config.js` e preencha os campos correspondentes, preservando os nomes e a estrutura do arquivo.

Exemplo dos campos que você receberá:

```js
apiKey: "valor fornecido pelo Firebase",
authDomain: "seu-projeto.firebaseapp.com",
projectId: "ID-exato-do-projeto",
messagingSenderId: "valor fornecido pelo Firebase",
appId: "valor fornecido pelo Firebase"
```

Use exatamente os valores do seu projeto nos cinco campos do arquivo. O Console pode apresentar outros campos, como `storageBucket`, mas esta versão não utiliza o Cloud Storage.

A configuração Web é pública e será enviada ao GitHub. Ela identifica o projeto; a segurança depende da autenticação e das regras. Não inclua no código senha, chave privada ou arquivo de conta de serviço. O UID do responsável será colocado no banco conforme a seção 7, e não no HTML.

## 6. Publicar no GitHub Pages

1. Entre no GitHub e crie um repositório **público**, por exemplo `portal-turma`.
2. Envie os arquivos mantendo `docs` diretamente na raiz do repositório: o caminho precisa ficar `docs/index.html`.
3. Confirme que o código está na branch `main`.
4. Abra **Settings → Pages**.
5. Em **Build and deployment**, selecione **Deploy from a branch**.
6. Escolha **`main`** e a pasta **`/docs`**; salve.
7. Aguarde a publicação. O endereço aparecerá na página, normalmente `https://SEU-USUARIO.github.io/portal-turma/`.

O código e o endereço da página serão públicos. O acesso aos dados reais da turma continuará condicionado ao login e às regras do Firebase. Por isso, dados reais, listas de alunos, comprovantes e cópias do banco não devem ser colocados nos arquivos públicos do repositório.

### Autorizar o domínio

No Firebase, abra **Authentication → Settings → Authorized domains** e adicione:

```text
SEU-USUARIO.github.io
```

Informe somente o domínio, sem `https://` e sem o nome do repositório. Se usar domínio próprio, autorize também esse domínio.

## 7. Definir o primeiro responsável

Esta etapa é feita uma vez pelo titular do projeto no Firebase Console.

1. Abra o site publicado e use **Continuar com Google** com sua conta. Isso cria a identidade em Authentication; a entrada na turma ainda poderá ser recusada porque o responsável não foi configurado.
2. Como alternativa, use **Criar minha conta**, depois confirme o e-mail recebido. Se a conta foi criada manualmente em **Authentication → Users**, entre pelo site e conclua a verificação do endereço.
3. No Firebase Console, abra **Authentication → Users/Usuários**.
4. Localize essa conta e copie o **UID**. Ele é um identificador da conta, não é o e-mail nem o ID do projeto.
5. Em **Firestore Database → Data/Dados**, crie o caminho abaixo usando exatamente estes nomes.

| Nível | Tipo | Nome/valor |
| --- | --- | --- |
| 1 | Coleção | `classes` |
| 2 | Documento | `turma-licenciatura` |
| 3 | Subcoleção dentro desse documento | `config` |
| 4 | Documento dentro de `config` | `access` |
| Campo do documento `access` | `string` | Nome: `ownerUid`; valor: o UID copiado |

O caminho final é:

```text
classes/turma-licenciatura/config/access
```

O documento `access` deve conter este campo de texto:

```json
{
  "ownerUid": "COLE_AQUI_O_UID_REAL_DA_SUA_CONTA"
}
```

No Console, selecione **string** como tipo do campo. Use o UID exato, sem espaços extras. Se o Console pedir um campo para salvar o documento pai `turma-licenciatura`, você pode acrescentar um campo descritivo `nome` do tipo string, com o nome da turma; esse campo não concede permissões.

Volte ao site e clique em **Já confirmei / tentar novamente** ou saia e entre novamente. Com o e-mail verificado e o UID correto, o portal criará seu cadastro de membro como **Responsável principal**.

O documento `config/access` só pode ser alterado administrativamente pelo Console. O aplicativo não permite que um aluno se promova a responsável, mesmo que ele altere o JavaScript no próprio navegador.

### Recuperação ou troca de responsável

Mantenha acesso à conta que administra o projeto Firebase. Para trocar o responsável, é necessário revisar no Console o `ownerUid` e os registros de membros correspondentes; não basta promover alguém pelo site. Faça essa manutenção com uma cópia dos dados e apoio técnico se houver dúvidas. As opções comuns de gestão do portal são **Aluno** e **Administrador**.

## 8. Preparar a turma para uso

No primeiro acesso como responsável:

1. Abra **Gestão da turma → Configurações** e informe o nome da turma, curso, universidade e texto de ajuda.
2. Cadastre o semestre e marque-o como ativo.
3. Cadastre professores, matérias e horários.
4. Publique os primeiros avisos e eventos com seus links de origem.
5. Em **Convidar integrante**, autorize os e-mails dos colegas com o perfil **Aluno**.
6. Autorize a pequena equipe que atualizará o portal com o perfil **Administrador**.
7. Compartilhe o endereço do site com a turma.

O convite autoriza um e-mail; ele não envia uma mensagem automaticamente. Cada colega deve entrar com o mesmo endereço autorizado, verificado. Criar uma conta ou conhecer o endereço do site não libera acesso por si só.

Os convites pendentes podem ser revogados. Para um integrante que já entrou, use a gestão de membros para suspender seu acesso ou alterar o papel entre aluno e administrador.

### Conferência antes de convidar todos

Use uma conta de aluno e outra de administrador para confirmar:

- Uma conta não autorizada é impedida de ler os dados da turma.
- O aluno consulta conteúdos publicados e envia solicitações; não vê rascunhos nem pedidos de outras pessoas.
- A aprovação de um material publica o conteúdo no mural correto.
- Uma alteração de prazo aparece no calendário e no histórico de mudanças.
- Favoritos, checklist e preferências são próprios de cada conta.
- Entrada, saída e estorno atualizam saldo e meta corretamente.
- A suspensão de um membro impede novos acessos aos dados.

Essas verificações dependem do seu projeto configurado e das regras publicadas. Os testes de lógica incluídos no pacote não comprovam, sozinhos, o funcionamento em produção.

## 9. Usar o portal no dia a dia

**Calendário e avisos.** Administradores publicam informações e suas fontes. Rascunhos permitem preparar conteúdo antes da divulgação. O andamento coletivo do evento pode ser previsto, confirmado ou concluído. O checklist do aluno é separado desse andamento e não representa entrega de trabalho ao professor.

**Datas.** Deixe o horário vazio quando não tiver sido informado. Ao mudar um prazo, registre a justificativa. As visualizações Mês, Semana e Lista mostram os registros carregados. O arquivo `.ics` é uma cópia dos eventos exportados; alterações futuras exigem nova exportação, não há assinatura automática.

**Professores e plataformas.** Cadastre o link principal e, quando necessário, até dez links adicionais. Use uma linha para cada um: `Nome e finalidade | https://endereco`. Preencha a data em que conferiu as fontes.

**Materiais e grupos.** Abra a matéria para consultar seus materiais, anotações, encontros, avisos e prazos. Alunos enviam novas contribuições por solicitação. Antes de divulgar um link, confira se os colegas podem abrir o arquivo no serviço de origem.

**Solicitações.** Os tipos são aviso, evento ou prazo, material, grupo, correção ou remoção, comprovante ou caixa e ajuda ou erro. A administração pode assumir análise, pedir complemento, aprovar, recusar ou cancelar. Complementos são novos pedidos vinculados ao anterior. Avisos, eventos, materiais e grupos aprovados geram publicação; correções, ajuda e caixa são concluídos com resposta. Para alunos, o limite é **dez solicitações por dia UTC**, renovado às 00h UTC, equivalente a 21h do dia anterior em Brasília.

**Caixa.** Registre somente movimentações conferidas. Uma solicitação de caixa aprovada não cria automaticamente um lançamento: o administrador registra a entrada ou saída. Corrija erros por estorno; os valores originais são preservados. O portal organiza informações, sem cobrar, transferir dinheiro ou validar pagamentos bancários.

**Metas e saldo.** São calculados pelas somas do Firestore com todos os lançamentos correspondentes, incluindo estornos, independentemente das linhas exibidas. O filtro mensal afeta a lista e o CSV. Carregue as movimentações desejadas antes de exportar a planilha.

**Comprovantes.** O portal restringe o link e a identificação do contribuinte. Configure também a privacidade do arquivo no Drive ou serviço externo: proteger o link no portal não torna privado um arquivo que já é público.

**Leitura e preferências.** Avisos importantes permitem confirmar leitura. Em **Meus favoritos → Minha organização**, escolha a tela inicial e a matéria preferida. O botão no topo alterna o tema claro ou escuro.

**Próximo semestre.** Selecione o período de origem e abra **Gestão da turma → Assistente de novo semestre**. Selecione até trinta matérias e, opcionalmente, até cem horários. O assistente cria novos registros para revisão; eventos, avisos, materiais e movimentos do caixa não são copiados. Revise e use **Tornar ativo** quando estiver pronto.

**Carregamento e atualização.** As listas são paginadas em até cem registros. Use **Carregar mais** para ampliar a consulta. A tela inicial faz uma consulta dos eventos a partir de hoje para apresentar os próximos prazos, também com limite de cem registros por página. Busca, listas e exportações consideram os registros carregados e os filtros aplicados; confira o aviso de páginas adicionais, inclusive em solicitações e favoritos, antes de considerar a consulta completa. O total de cada meta consultada usa todos os seus lançamentos, independentemente dessa paginação.

As consultas da navegação podem reaproveitar dados em memória por até sessenta segundos. Gravações atualizam os dados relacionados, e o botão **Atualizar** força uma nova consulta. O site não faz consultas periódicas em segundo plano nem recarrega dados automaticamente ao voltar para a aba. Não há sincronização contínua em tempo real ou armazenamento offline permanente.

## 10. Demonstração, manutenção e cópias

### Demonstração

O botão **Abrir demonstração** usa dados fictícios no seu navegador, com seleção dos perfis de aluno, administrador e responsável. Esse modo é separado do Firebase real: alterações nele não publicam informações para os colegas.

Para testar no seu computador, abra a pasta do projeto no terminal e execute, se tiver Node.js instalado:

```sh
npm run preview
```

Abra o endereço indicado pelo terminal. Para testar autenticação real em `localhost`, adicione esse domínio à lista autorizada do Firebase. Publicar pelo GitHub Pages dispensa a instalação local do Node.js.

Não abra `index.html` com duplo clique: os módulos JavaScript precisam ser servidos por HTTP ou HTTPS.

### Atualizações

Atualizações de HTML, CSS e JavaScript são publicadas enviando os arquivos da pasta `docs` para o GitHub. Alterações nas regras precisam ser copiadas novamente para **Firestore → Rules** e publicadas. Sempre acompanhe a versão correspondente do código e das regras.

### Cópia dos dados

O responsável pode exportar JSON com os dados do portal aos quais sua função tem acesso, incluindo solicitações, informações administrativas e dados privados do caixa. A exportação não inclui favoritos, checklist e preferências dos integrantes, contas/senhas do Authentication, registros internos de controle de operações ou arquivos externos.

Guarde essa cópia em local privado, fora do repositório público. Faça a exportação durante uma breve pausa nas edições. Ela consome leituras do Firestore e possui limite de 8 MB para o arquivo. Se atingir o limite, a operação informa o problema; será necessária uma estratégia técnica de exportação em partes respeitando as cotas.

Não há restauração automática pela interface. Recursos de backup gerenciado, recuperação histórica e restauração paga do Google Cloud não fazem parte desta versão Spark. A importação de uma cópia exige validação técnica da estrutura e das permissões.

## 11. Índices e ferramentas opcionais

A instalação principal usa somente o Console e o GitHub. As consultas desta versão utilizam os treze índices compostos descritos em `firestore.indexes.json` e na tabela abaixo.

Para criá-los manualmente, abra **Firestore → Indexes/Índices → Add index/Adicionar índice**. Para cada linha da tabela:

1. Preencha **ID da coleção** com o nome indicado, como `subjects`; não use o caminho completo da turma.
2. Acrescente os campos exatamente na ordem indicada.
3. Escolha **Ascending/Crescente** para todos os campos.
4. Em escopo da consulta, escolha **Collection/Coleção**.
5. Salve e repita para a próxima linha.

| Nº | ID da coleção | Primeiro campo | Segundo campo | Terceiro campo |
| --- | --- | --- | --- | --- |
| 1 | `subjects` | `semesterId` | `status` | — |
| 2 | `schedules` | `semesterId` | `status` | — |
| 3 | `notices` | `semesterId` | `status` | — |
| 4 | `events` | `semesterId` | `status` | — |
| 5 | `materials` | `semesterId` | `status` | — |
| 6 | `groups` | `semesterId` | `status` | — |
| 7 | `news` | `semesterId` | `status` | — |
| 8 | `requests` | `semesterId` | `authorId` | — |
| 9 | `schedules` | `subjectId` | `status` | — |
| 10 | `events` | `status` | `date` | — |
| 11 | `events` | `semesterId` | `status` | `date` |
| 12 | `ledger` | `deltaCents` | `incomeDeltaCents` | `expenseDeltaCents` |
| 13 | `ledger` | `goalId` | `deltaCents` | — |

O traço indica que não há terceiro campo para adicionar. Os vários índices de uma mesma coleção atendem a consultas diferentes; mantenha todos os indicados. Aguarde o estado **Enabled/Ativado** ou equivalente antes da conferência com contas de aluno. Se o Firebase ainda informar que falta um índice, confira a descrição ou o link fornecido pelo erro e compare com o arquivo do pacote.

Como alternativa, com Node.js e a ferramenta oficial Firebase CLI instalados, publique regras e índices pela pasta principal do projeto:

```sh
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore
```

Escolha o mesmo ID de projeto Spark informado em `docs/js/config.js`. Quando for pedido um apelido, use `default`. O comando publica somente regras e índices do Firestore. Não há deploy de funções, parâmetro `OWNER_EMAIL` ou arquivo `.env` necessário para esta versão.

Para manutenção técnica, os comandos do pacote são:

```sh
npm test
npm run check
```

Para executar os testes das regras separadamente, instale o Firebase CLI e uma versão de Java compatível com o emulador Firestore. A primeira execução precisa de acesso à internet para obter o emulador. Pela pasta principal do projeto, execute:

```sh
npm run test:rules
```

Esse comando inicia o emulador usando o projeto fictício `demo-portal-spark`; não usa o banco real da turma. Encerre qualquer outro programa que já esteja usando a porta 8085 antes do teste.

**Estado da verificação nesta entrega:** quarenta testes de lógica passaram, assim como a verificação dos fluxos em uma simulação mínima de página. Os cenários de teste das regras foram preparados, mas **não foram executados**, pois o emulador necessário não estava disponível no ambiente. Não houve teste em navegador real nem integração com um projeto Firebase real.

A simulação de página não verifica aparência, interação real do navegador ou aplicação das regras pelo Firebase. Execute os testes das regras e confira o login, as permissões e os fluxos no projeto configurado antes do uso pela turma.

## 12. Se você já usou a versão anterior com Blaze

Se você apenas baixou os arquivos anteriores e não criou projeto ou publicou nada, siga a instalação Spark deste guia.

Se já existe um projeto com dados reais e Cloud Functions, o caminho mais simples para experimentar a versão gratuita é **criar outro projeto Firebase Spark**, preservando o anterior enquanto prepara e confere o novo.

1. No portal anterior, exporte uma cópia dos dados e guarde também o código e a configuração utilizados.
2. Mantenha o projeto anterior acessível enquanto confere a integridade dessa cópia.
3. Crie o novo projeto Spark seguindo este guia, com novas regras e sua própria configuração Web.
4. Configure novamente o responsável. **Os UIDs das contas podem ser diferentes no projeto novo**; copie o UID do novo Authentication.
5. Cadastre os dados no novo portal ou faça uma migração técnica controlada. O pacote não possui importador automático compatível com a versão anterior.
6. Confira login, permissões, calendário, materiais e caixa com contas de teste antes de orientar a turma a usar o novo ambiente.
7. Depois da validação e da preservação dos dados, revise separadamente os serviços e o faturamento do projeto antigo.

Criar o projeto Spark não cancela nem altera cobranças ou serviços de um projeto Blaze anterior. Excluir o projeto antigo ou reduzir seu plano pode interromper serviços e acesso; essas ações não são parte da preparação da nova instalação e devem ocorrer somente após a conferência dos dados e do que ainda está em uso.

Não copie as regras antigas que bloqueavam todo acesso direto ao banco para o projeto novo: elas eram feitas para uma arquitetura diferente. Use juntos o código Spark e as regras Spark do mesmo pacote.

## 13. Solução de problemas

| Sintoma | O que conferir |
| --- | --- |
| Página 404 | Branch `main`, origem `/docs` e caminho `docs/index.html` na raiz correta |
| Login acusa domínio não autorizado | `SEU-USUARIO.github.io` em Authentication → Authorized domains |
| Conta existe, mas não entra | E-mail verificado, convite para o mesmo endereço e membro ativo |
| Primeiro responsável não entra | UID do Authentication do projeto correto e documento `classes/turma-licenciatura/config/access` com `ownerUid` do tipo string |
| Acesso ao banco recusado | Regras Spark publicadas, configuração Web do mesmo projeto e sessão válida |
| Falta índice | Campos de `firestore.indexes.json` e estado pronto do índice no Console |
| Limite ou cota atingida | Uso do Firestore e espera pela renovação correspondente; evite repetição contínua |
| Informações incompletas | Filtros, semestre selecionado e botão Carregar mais |
| Material pede permissão | Compartilhamento no serviço original do arquivo |
| Alteração informa conflito | Outro administrador alterou o registro; atualize, revise e tente salvar novamente |
| Página ainda antiga | Publicação do GitHub Pages concluída e recarregamento do navegador |

## Referências oficiais

- [Planos Spark e Blaze](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Cotas do Cloud Firestore](https://firebase.google.com/docs/firestore/quotas)
- [Limites do Authentication](https://firebase.google.com/docs/auth/limits)
- [Publicar as regras pelo Console ou CLI](https://firebase.google.com/docs/rules/manage-deploy)
- [Como as regras validam acessos e consultas](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Adicionar Firebase a um aplicativo Web](https://firebase.google.com/docs/web/setup)
- [Configurar GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Limites do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
