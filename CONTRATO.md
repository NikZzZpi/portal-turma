# Contrato técnico — Firebase Spark

Este pacote usa a arquitetura gratuita descrita em **[SPARK-CONTRATO.md](SPARK-CONTRATO.md)**. Esse arquivo é a referência de implementação para dados, operações, permissões, consultas e testes. O procedimento de instalação está em **[LEIA-ME.md](LEIA-ME.md)**.

## Arquitetura

- Site estático em `docs/`, servido pelo GitHub Pages.
- HTML, CSS e JavaScript com módulos ES.
- Firebase Authentication para identificar a conta e verificar seu e-mail.
- SDK Web modular do Cloud Firestore para ler e gravar os dados diretamente.
- `firestore.rules` como controle de acesso obrigatório aplicado pelo Firebase.
- Plano Firebase **Spark**, sem Cloud Functions, Cloud Storage, servidor próprio ou serviços que exigem faturamento.
- Uma turma fixa sob `classes/turma-licenciatura`.

## Responsável e autorização

O responsável principal é identificado pelo campo `ownerUid` do documento `classes/turma-licenciatura/config/access`, criado manualmente no Firebase Console. Clientes Web não podem modificar esse documento. Não há `OWNER_EMAIL`, configuração de proprietário no HTML ou transferência de propriedade pelo aplicativo.

O primeiro ingresso da conta correspondente cria seu registro de membro. Os demais integrantes ingressam por convites vinculados ao e-mail verificado. O UID dos membros é o UID autenticado. Alunos podem consultar os conteúdos publicados, enviar solicitações e alterar seus próprios dados pessoais; administradores podem editar os conteúdos compartilhados; somente o responsável administra convites e papéis.

## Dados e operações

A interface preserva `call(action, payload)` como contrato interno, implementado pelo adaptador cliente do Firestore. Esse nome não representa uma chamada a Cloud Functions.

Mutação administrativa compartilhada usa transação, registro de operação para idempotência e registro de auditoria. Conteúdos têm versão e metadados; o arquivamento substitui a exclusão física. O caixa mantém lançamentos imutáveis e estornos pareados; os totais são agregações do Firestore, independentes da paginação da interface.

As consultas de alunos incluem as condições exigidas pelas regras. Registros privados não devem ser baixados para depois serem escondidos pela interface. Favoritos, checklist e preferências de outros integrantes permanecem privados inclusive no backup do responsável.

O limite de dez solicitações de aluno é calculado por dia UTC com validação pelas regras. Links externos continuam sujeitos às permissões do serviço original. Alertas são exibidos ao usar o portal; não há tarefas agendadas nem sincronização automática com plataformas da universidade.

## Cotas e verificação

O carregamento usa páginas de até cem registros e reaproveita consultas recentes em memória por sessão. Não há atualização contínua por listeners nem persistência offline permanente. Consultas, validações das regras, agregações e exportações consomem a cota Spark.

Testes com SDK simulado e simulação mínima de DOM verificam lógica e formatos de operações. A avaliação das regras pelo emulador e a conferência de login, permissões e interface no ambiente real são etapas distintas; não se deve afirmar que foram aprovadas quando não foram executadas.

Mudanças na implementação devem atualizar em conjunto o adaptador Firestore, as regras, os testes e o guia. Projetos antigos baseados em Functions/Blaze precisam de uma migração planejada; as regras de ambas as arquiteturas não são intercambiáveis.
