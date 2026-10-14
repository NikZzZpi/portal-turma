# Referência técnica — Firebase Spark

O portal usa uma turma fixa, no caminho `classes/turma-licenciatura`. O navegador acessa Authentication e Firestore pelo SDK Web. A autorização efetiva é aplicada por `firestore.rules`; validações em JavaScript ajudam o usuário a preencher os formulários, mas não concedem acesso.

## Interface do serviço

`FirebaseService.call(action, payload)` delega a `FirestoreStore`. O serviço oferece `bootstrap`, `list`, `save`, `archive`, `restore`, `settings`, `invite`, `revokeInvite`, `member`, `request`, `review`, `ledger`, `reverse`, `personal`, `cloneSemester` e `backup`.

O adaptador `FirestoreStore({db, auth, sdk})` recebe o SDK por injeção para permitir testes de lógica sem rede. Os tipos e campos editáveis estão em `docs/js/validation.js`; os formulários estão em `docs/js/schema.js`.

`bootstrap` retorna `me`, `settings`, `data`, `personal`, `totals`, `goalTotals`, `more`, `loaded` e `noticeReads`. `data` contém uma lista para cada entidade, inclusive quando aquela lista ainda não foi consultada. `loaded` identifica as coleções carregadas para a tela atual.

## Identidade e permissões

- `config/access`: contém `ownerUid`, criado pelo titular no Firebase Console. Clientes podem ler esse documento quando autenticados e verificados, mas não podem alterá-lo.
- `members/{uid}`: contém nome, e-mail normalizado, papel, situação de acesso e metadados. O usuário lê o próprio cadastro; administradores leem os participantes. Alunos não consultam os cadastros de terceiros.
- O responsável principal é único e corresponde ao UID configurado. O aplicativo não permite rebaixar ou suspender essa conta nem promover outro membro a responsável. Transferências exigem manutenção no Console, incluindo os cadastros envolvidos.
- `invites/{email}`: o ID é o e-mail em letras minúsculas. Somente o responsável cria, revoga e lista convites. Uma pessoa autenticada e verificada pode consultar o convite correspondente ao próprio e-mail.
- O aceite cria `members/{auth.uid}` e altera o convite pendente para aceito na mesma transação. As regras conferem e-mail, nome, papel e UID. Criar uma conta no Authentication não concede acesso à turma.
- Toda permissão exige membro ativo e correspondência entre o e-mail verificado do token e o cadastro. Os papéis `admin` e `owner` podem editar conteúdo; apenas o responsável administra membros e convites.

## Registros e operações

Os conteúdos compartilhados usam `id`, `version`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy` e `lastOperation`. Datas de auditoria são timestamps do servidor; o adaptador as converte para ISO ao enviar os registros à interface. Datas acadêmicas continuam como strings `YYYY-MM-DD`, com horários locais separados.

Atualizações preservam a autoria e a data originais, incrementam a versão e conferem `expectedVersion`. O aplicativo arquiva conteúdos; não oferece exclusão física de registros acadêmicos.

Mutações compartilhadas usam uma transação com `operations/{uid_operationId}` e `audit/{uid_operationId}`. O conteúdo aponta para essa mesma chave em `lastOperation`. As regras exigem operação e auditoria correspondentes na gravação. O registro de operação guarda uma assinatura dos parâmetros e o resultado para evitar duplicação em tentativas repetidas.

A auditoria registra autor, ação, entidade, registro, resumo e timestamp. Ela é imutável pelo aplicativo e não contém uma cópia completa de cada versão do conteúdo. O primeiro ingresso, os dados pessoais e as confirmações de leitura têm regras específicas.

## Coleções acadêmicas

As entidades editáveis são `semesters`, `subjects`, `teachers`, `schedules`, `notices`, `events`, `materials`, `groups` e `goals`. A coleção `news` registra mudanças de prazo feitas pelo aplicativo.

Alunos podem consultar semestres anteriores, inclusive arquivados. Para os demais conteúdos, as consultas expressam os estados autorizados: professores, matérias, horários, avisos, materiais e notícias publicados; eventos publicados ou cancelados; grupos e metas publicados ou encerrados. Rascunhos e conteúdos arquivados permanecem restritos à administração.

As consultas filtram o semestre quando aplicável. A aplicação não baixa conteúdo privado para escondê-lo posteriormente na tela: os filtros necessários fazem parte da consulta ao Firestore.

O assistente de semestre copia até 30 matérias e 100 horários, preservando referências aos professores e criando novos IDs. Ele consulta os candidatos, relê os documentos na transação e grava a cópia junto com a operação e sua auditoria. Não ativa o novo semestre nem copia avisos, eventos, materiais, solicitações ou caixa. Referências e formatos completos são conferidos no adaptador; as regras protegem autorização, metadados e campos principais.

## Solicitações e organização pessoal

`requests` guarda pedidos privados, acessíveis ao autor e à administração. Complementos são novos pedidos ligados pelo campo `parentId`. O aluno não modifica o pedido original após enviá-lo.

A aprovação de aviso, evento, material ou grupo cria a publicação e encerra o pedido na mesma transação. A publicação recebe `sourceRequestId`, e o pedido recebe `publishedId` e `publishedEntity`. Solicitações financeiras, de suporte e de correção são respondidas sem criar uma publicação. Pedidos finalizados não são reabertos pelo aplicativo.

`requestLimits/{uid}` impõe até dez solicitações por dia UTC. O contador identifica o último pedido, incrementa uma vez e é validado em conjunto com a criação do pedido. O cliente fornece o dia esperado, mas as regras o comparam com a data do servidor.

`personal/{uid}` guarda favoritos, checklist, confirmações e preferências da própria pessoa. Administradores e responsável não podem ler esses documentos de terceiros.

`noticeReads/{uid_noticeId}` contém somente a confirmação de leitura: membro, nome, aviso, versão e timestamp. O próprio usuário grava uma confirmação para um aviso importante publicado e na versão atual. Administradores consultam essas confirmações sem acessar favoritos ou checklists alheios.

## Caixa e privacidade financeira

`ledger` guarda movimentos públicos da turma, com valores inteiros em centavos. Cada movimento inclui `amountCents`, `deltaCents`, `incomeDeltaCents` e `expenseDeltaCents`.

- Entrada original: saldo e entradas recebem o valor; saídas recebem zero.
- Saída original: saldo recebe o valor negativo; saídas recebem o valor positivo; entradas recebem zero.
- Estorno: os três deltas são opostos aos do original. O ID é `ORIGINALID_reverse`, e o original recebe `reversedBy` na mesma transação. As regras impedem alterar o valor original, criar um segundo estorno ou estornar um estorno.

`ledgerPrivate/{ledgerId}` separa o contribuinte e o link do comprovante. Somente administradores e o contribuinte vinculado podem lê-lo. A permissão do arquivo no serviço externo continua sendo responsabilidade da turma.

Saldo, entradas, saídas e metas usam agregações do Firestore. O total de uma meta considera todos os seus movimentos, independentemente da página de lançamentos aberta na interface. Não existe documento de saldo editável pelo cliente.

## Carregamento e cotas

As páginas têm até cem registros. O serviço carrega as coleções usadas pela tela atual e reutiliza consultas recentes em memória por sessenta segundos. Gravações e logout invalidam o cache; o botão Atualizar força nova consulta. Não há persistência Firestore em disco, polling ou atualização automática ao voltar à aba.

Na página inicial, os próximos eventos são consultados por data, a partir de hoje em Brasília. A paginação desses eventos usa um cursor com data e ID. As demais listas usam cursores por ID. A interface informa quando há páginas adicionais e permite carregá-las manualmente. Busca e exportações acadêmicas consideram os registros carregados e os filtros selecionados.

Os índices correspondentes estão em `firestore.indexes.json` e são descritos no guia. O serviço não utiliza Cloud Functions, Cloud Storage, SMS, backups gerenciados ou outros recursos que exigem faturamento. Authentication e Firestore continuam sujeitos às cotas do plano Spark.

## Exportação administrativa

Somente o responsável exporta o JSON administrativo, limitado a 8 MB. A exportação inclui os conteúdos e dados administrativos autorizados, inclusive solicitações, comprovantes e confirmações. Exclui `personal`, `operations`, `requestLimits`, contas do Authentication e arquivos externos. Não há importação automática. Como a exportação lê várias páginas, a equipe deve evitar alterações enquanto ela ocorre.

## Verificação

Os testes unitários, o SDK falso e o DOM mínimo verificam lógica, parâmetros, serialização, paginação e fluxos. Eles não aplicam as regras reais do Firestore.

A suíte `tests/firestore.rules.test.mjs` deve ser executada separadamente com `npm run test:rules`, usando o emulador. Nesta entrega, essa suíte não foi executada. A publicação das regras, os índices, o login e as permissões também devem ser conferidos no projeto configurado antes de liberar acesso à turma.
