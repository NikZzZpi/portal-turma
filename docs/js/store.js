import * as v from './validation.js';

const ROOT='classes/turma-licenciatura';
const PAGE=100,CACHE_MS=60000;
const ENTITIES=['semesters','subjects','teachers','schedules','notices','events','materials','groups','requests','ledger','goals','news','members','invites','audit'];
const SCOPED=new Set(['subjects','schedules','notices','events','materials','groups','requests','news']);
const PUBLIC_STATES={teachers:['published'],subjects:['published'],schedules:['published'],notices:['published'],materials:['published'],events:['published','cancelled'],groups:['published','closed'],goals:['published','closed'],news:['published']};
const EDITABLE=Object.keys(v.schemas);
const FINAL=new Set(['approved','rejected','cancelled']);
const DEFAULT_SETTINGS={title:'Portal da Turma',course:'Licenciatura',university:'',activeSemesterId:'',helpText:'Consulte as fontes originais e envie sugestões pela área de solicitações.'};
const DEFAULT_PERSONAL={favorites:[],tasks:{},read:{},preferences:{theme:'light',initialView:'home',subjectId:''}};
const VIEWS={home:['events','notices','news'],calendar:['events'],subjects:['materials','groups','events','notices'],schedules:['schedules'],teachers:[],finance:['ledger','goals','members'],requests:['requests','members','events'],admin:['requests','members','invites','audit'],favorites:['notices','events','materials','groups'],notices:['notices','events'],help:[]};
const isAdmin=actor=>['owner','admin'].includes(actor.role);
const assertAdmin=actor=>{if(!isAdmin(actor))v.fail('Somente administradores podem realizar esta ação.','permission-denied');};
const assertOwner=actor=>{if(actor.role!=='owner')v.fail('Somente o responsável principal pode realizar esta ação.','permission-denied');};
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`:JSON.stringify(value);
export function toPlain(value){if(value?.toDate instanceof Function)return value.toDate().toISOString();if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(toPlain);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,val])=>[k,toPlain(val)]));return value;}
function expected(record,version){v.integer(version,'Versão esperada',1);if(record.version!==version)v.fail('Este registro mudou. Atualize a página e revise sua alteração.','aborted');}
const schemaFields=(name,record)=>Object.fromEntries(v.schemas[name].filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));

// Authentication and validation improve the interface. Firestore Rules are the authority
// for every real read/write; changing this public JavaScript cannot grant a role.
export class FirestoreStore {
 constructor({db,auth,sdk}){this.db=db;this.auth=auth;this.s=sdk;this.cache=new Map();}
 clear(){this.cache.clear();}
 ref(entity,id){return this.s.doc(this.db,ROOT,entity,id);}
 coll(entity){return this.s.collection(this.db,ROOT,entity);}
 newId(entity){return this.s.doc(this.coll(entity)).id;}
 async get(reference){return (this.s.getDocFromServer||this.s.getDoc)(reference);}
 async docs(query){return (this.s.getDocsFromServer||this.s.getDocs)(query);}
 timestamp(){return this.s.serverTimestamp();}
 stamp(data,actor,id,old,operation){return {...data,id,version:old?old.version+1:1,createdAt:old?old.createdAt:this.timestamp(),createdBy:old?old.createdBy:actor.id,updatedAt:this.timestamp(),updatedBy:actor.id,...(operation?{lastOperation:operation}:{})};}
 async cached(key,loader,force=false){const saved=this.cache.get(key);if(!force&&saved&&Date.now()-saved.at<CACHE_MS)return structuredClone(saved.value);const value=await loader();this.cache.set(key,{at:Date.now(),value:toPlain(value)});return structuredClone(toPlain(value));}
 async actor(){
  const user=this.auth.currentUser;
  if(!user)v.fail('Entre com sua conta para acessar a turma.','unauthenticated');
  if(!user.emailVerified||!user.email)v.fail('Confirme seu e-mail e entre novamente.','permission-denied');
  const uid=v.id(user.uid),email=v.email(user.email);
  if(email.includes('/'))v.fail('Este endereço de e-mail não é compatível com os convites.');
  let snap=await this.get(this.ref('members',uid));
  if(!snap.exists()){
   const access=await this.get(this.ref('config','access'));
   if(!access.exists())v.fail('O responsável precisa criar config/access no Firestore conforme o guia.','failed-precondition');
   const owner=access.data().ownerUid===uid;
   await this.s.runTransaction(this.db,async tx=>{
    const member=await tx.get(this.ref('members',uid));if(member.exists())return;
    let invitation=null;
    if(!owner){const invite=await tx.get(this.ref('invites',email));if(!invite.exists()||invite.data().status!=='pending')v.fail('Este portal é exclusivo da turma. Peça um convite ao responsável.','permission-denied');invitation=invite.data();}
    const actor={id:uid};
    const data=this.stamp({name:v.text(invitation?.name||user.displayName||email.split('@')[0],'Nome',120,true),email,role:owner?'owner':invitation.role,active:true},actor,uid);
    tx.set(this.ref('members',uid),data);
    if(invitation)tx.update(this.ref('invites',email),{status:'accepted',acceptedBy:uid,acceptedAt:this.timestamp(),updatedAt:this.timestamp(),updatedBy:uid,version:invitation.version+1});
   });
   snap=await this.get(this.ref('members',uid));
  }
  const member=snap.data();
  if(!member.active||member.email!==email)v.fail('Seu acesso à turma foi desativado ou o e-mail da conta mudou. Procure o responsável.','permission-denied');
  return member;
 }
 async required(tx,entity,id){const snap=await tx.get(this.ref(entity,id));if(!snap.exists())v.fail('Registro não encontrado.','not-found');return snap.data();}
 async references(tx,data){
  const refs=[];
  for(const [field,entity] of [['semesterId','semesters'],['subjectId','subjects'],['eventId','events'],['goalId','goals'],['contributorId','members']])if(data[field])refs.push([entity,data[field]]);
  for(const id of data.teacherIds||[])refs.push(['teachers',id]);
  const records=await Promise.all(refs.map(([entity,id])=>this.required(tx,entity,id)));
  records.forEach((record,i)=>{if(record.status==='archived')v.fail('Não é possível vincular conteúdo arquivado.','failed-precondition');if(refs[i][0]==='members'&&!record.active)v.fail('O contribuinte está inativo.','failed-precondition');if(['subjects','events'].includes(refs[i][0])&&data.semesterId&&record.semesterId!==data.semesterId)v.fail('A matéria ou evento pertence a outro semestre.','failed-precondition');});
 }
 async mutation(actor,action,payload,worker){
  const operationId=v.text(payload.operationId,'Identificador da operação',80,true);
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(operationId))v.fail('Identificador de operação inválido.');
  const key=`${actor.id}_${operationId}`,operation=this.ref('operations',key),audit=this.ref('audit',key);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable({action,payload})));
  const signature=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  const result=await this.s.runTransaction(this.db,async tx=>{
   const [member,done]=await Promise.all([tx.get(this.ref('members',actor.id)),tx.get(operation)]);
   if(!member.exists()||!member.data().active||member.data().email!==this.auth.currentUser?.email?.toLowerCase())v.fail('Seu acesso foi alterado. Entre novamente.','permission-denied');
   if(done.exists()){if(done.data().signature!==signature)v.fail('Esta operação já foi usada com dados diferentes. Atualize o formulário.','already-exists');return done.data().result;}
   const current=member.data(),out=await worker(tx,current,key);
   const response=out.response||{id:out.id||''};
   tx.set(operation,{id:key,actorId:current.id,action,signature,result:response,createdAt:this.timestamp()});
   tx.set(audit,{id:key,actorId:current.id,actorName:current.name,action,entity:out.entity||action,recordId:out.id||'',details:out.details||'',createdAt:this.timestamp()});
   return response;
  });
  this.clear();return result;
 }
 async list(actor,payload,force=false){
  const entity=payload.entity;
  if(!ENTITIES.includes(entity)&&entity!=='noticeReads')v.fail('Área inválida.');
  if(entity==='members'&&!isAdmin(actor))return {items:[toPlain(actor)],cursor:null};
  if(entity==='invites'&&actor.role!=='owner')return {items:[],cursor:null};
  if(['audit','noticeReads'].includes(entity)&&!isAdmin(actor))v.fail('Área restrita à administração.','permission-denied');
  const semesterId=payload.semesterId?v.id(payload.semesterId):'',cursor=payload.cursor||null,noticeId=payload.noticeId?v.id(payload.noticeId):'',upcoming=entity==='events'&&payload.upcoming===true;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(cursor&&(typeof cursor!=='string'||cursor.includes('/')||cursor.length>300))v.fail('Página inválida.');
  return this.cached(`list/${actor.id}/${actor.role}/${entity}/${semesterId}/${cursor||''}/${noticeId}/${upcoming?today:''}`,async()=>{
   const constraints=[];
   if(SCOPED.has(entity)&&semesterId)constraints.push(this.s.where('semesterId','==',semesterId));
   if(entity==='noticeReads'&&noticeId)constraints.push(this.s.where('noticeId','==',noticeId));
   if(entity==='requests'&&!isAdmin(actor))constraints.push(this.s.where('authorId','==',actor.id));
   if(upcoming){constraints.push(this.s.where('status','==','published'),this.s.where('date','>=',today),this.s.orderBy('date'));}
   if(!upcoming&&!isAdmin(actor)&&PUBLIC_STATES[entity]){const states=PUBLIC_STATES[entity];constraints.push(this.s.where('status',states.length===1?'==':'in',states.length===1?states[0]:states));}
   constraints.push(this.s.orderBy(this.s.documentId()));if(cursor){if(upcoming){const [date,id]=cursor.split('|');v.date(date);v.id(id);constraints.push(this.s.startAfter(date,id));}else constraints.push(this.s.startAfter(cursor));}constraints.push(this.s.limit(PAGE+1));
   const page=await this.docs(this.s.query(this.coll(entity),...constraints));
   const raw=page.docs.slice(0,PAGE);let items=raw.map(snap=>snap.data());
   if(entity==='ledger'&&items.length){
    let privateDocs=[];
    if(isAdmin(actor))privateDocs=await Promise.all(items.map(item=>this.get(this.ref('ledgerPrivate',item.id))));
    else{
     for(let i=0;i<items.length;i+=30){const ids=items.slice(i,i+30).map(item=>item.id);const own=await this.docs(this.s.query(this.coll('ledgerPrivate'),this.s.where('contributorId','==',actor.id),this.s.where(this.s.documentId(),'in',ids)));privateDocs.push(...own.docs);}
    }
    const map=new Map(privateDocs.filter(doc=>doc.exists()).map(doc=>[doc.id,doc.data()]));
    items=items.map(item=>map.has(item.id)?{...item,contributorId:map.get(item.id).contributorId,receiptUrl:map.get(item.id).receiptUrl}:item);
   }
   const extra=entity==='goals'?{goalTotals:await this.goalSums(items)}:{};
   return {items,cursor:page.docs.length>PAGE?(upcoming?`${raw.at(-1).data().date}|${raw.at(-1).id}`:raw.at(-1).id):null,...extra};
  },force);
 }
 async goalSums(goals){
  const goalTotals={};
  await Promise.all(goals.map(async goal=>{const aggregate=await this.s.getAggregateFromServer(this.s.query(this.coll('ledger'),this.s.where('goalId','==',goal.id)),{total:this.s.sum('deltaCents')});goalTotals[goal.id]=aggregate.data().total||0;}));
  return goalTotals;
 }
 async aggregates(){
  const result=await this.s.getAggregateFromServer(this.coll('ledger'),{balanceCents:this.s.sum('deltaCents'),incomeCents:this.s.sum('incomeDeltaCents'),expenseCents:this.s.sum('expenseDeltaCents')});
  return {totals:result.data()};
 }
 async bootstrap(actor,payload){
  const aliases={events:'calendar',materials:'subjects',groups:'subjects'};const view=aliases[payload.view]||payload.view||'home';
  const selected=Object.hasOwn(VIEWS,view)?view:'home';
  return this.cached(`bootstrap/${actor.id}/${actor.role}/${payload.semesterId||''}/${selected}`,async()=>{
   const [settingsSnap,personalSnap]=await Promise.all([this.get(this.ref('meta','settings')),this.get(this.ref('personal',actor.id))]);
   const settingsRaw=settingsSnap.exists()?settingsSnap.data():DEFAULT_SETTINGS;
   const settings=Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key=>[key,settingsRaw[key]??DEFAULT_SETTINGS[key]]));
   const semesterId=payload.semesterId?v.id(payload.semesterId):settings.activeSemesterId;
   const enabled=[...new Set(['semesters','subjects','teachers',...VIEWS[selected]])].filter(e=>(e!=='invites'||actor.role==='owner')&&(e!=='audit'||isAdmin(actor)));
   const data=Object.fromEntries(ENTITIES.map(e=>[e,[]])),more={},goalTotals={};
   await Promise.all(enabled.map(async entity=>{const page=await this.list(actor,{entity,semesterId,upcoming:selected==='home'&&entity==='events'},!!payload.force);data[entity]=page.items;more[entity]=page.cursor;if(page.goalTotals)Object.assign(goalTotals,page.goalTotals);}));
   const personalRaw=personalSnap.exists()?personalSnap.data():DEFAULT_PERSONAL;
   const personal=Object.fromEntries(Object.keys(DEFAULT_PERSONAL).map(k=>[k,personalRaw[k]??DEFAULT_PERSONAL[k]]));
   const stats=['home','finance'].includes(selected)?await this.aggregates():{totals:{balanceCents:0,incomeCents:0,expenseCents:0}};
   const noticeReads=isAdmin(actor)&&selected==='notices'?(await this.list(actor,{entity:'noticeReads'},!!payload.force)).items:[];
   return {me:actor,settings,data,personal,...stats,goalTotals,more,noticeReads,loaded:enabled};
  },!!payload.force);
 }
 async save(actor,payload){
  const entity=v.enumValue(payload.entity,EDITABLE,'Área'),data=v.entity(entity,payload.data),id=payload.id?v.id(payload.id):this.newId(entity);
  return this.mutation(actor,'save',payload,async(tx,current,op)=>{
   assertAdmin(current);const old=payload.id?await this.required(tx,entity,id):null;if(old)expected(old,payload.expectedVersion);
   await this.references(tx,data);
   if(entity==='semesters'&&data.status==='archived'){const settings=await tx.get(this.ref('meta','settings'));if(settings.exists()&&settings.data().activeSemesterId===id)v.fail('Ative outro semestre antes de arquivar este.','failed-precondition');}
   const moved=entity==='events'&&old&&['date','time','endDate','endTime','allDay'].some(k=>old[k]!==data[k]);
   if(moved&&!data.changeReason)v.fail('Explique a alteração de data ou horário.','failed-precondition');
   const next=this.stamp({...data,...(old?.sourceRequestId?{sourceRequestId:old.sourceRequestId}:{}),...(old&&data.status==='archived'?{previousStatus:old.status==='archived'?old.previousStatus||'published':old.status}:{})},current,id,old,op);
   tx.set(this.ref(entity,id),next);
   if(moved&&!['draft','archived'].includes(old.status)&&!['draft','archived'].includes(data.status)){const newsId=this.newId('news');tx.set(this.ref('news',newsId),this.stamp({title:`Prazo alterado: ${data.title}`.slice(0,120),description:`De ${old.date}${old.time?' às '+old.time:''} para ${data.date}${data.time?' às '+data.time:''}. ${data.changeReason}`,eventId:id,semesterId:data.semesterId,status:'published'},current,newsId,null,op));}
   return {id,entity,details:`${old?'Atualizado':'Criado'}: ${data.title}`};
  });
 }
 async archive(actor,action,payload){
  const entity=v.enumValue(payload.entity,EDITABLE,'Área'),id=v.id(payload.id);
  return this.mutation(actor,action,payload,async(tx,current,op)=>{
   assertAdmin(current);const old=await this.required(tx,entity,id);expected(old,payload.expectedVersion);
   if(entity==='semesters'){const settings=await tx.get(this.ref('meta','settings'));if(action==='archive'&&settings.exists()&&settings.data().activeSemesterId===id)v.fail('O semestre ativo não pode ser arquivado.','failed-precondition');}
   if(action==='restore'&&old.status!=='archived')v.fail('O registro não está arquivado.','failed-precondition');
   if(action==='archive'&&old.status==='archived')v.fail('O registro já está arquivado.','failed-precondition');
   const data={...old,status:action==='archive'?'archived':old.previousStatus||'published'};
   if(action==='archive')data.previousStatus=old.status;else{delete data.previousStatus;await this.references(tx,data);}
   tx.set(this.ref(entity,id),this.stamp(data,current,id,old,op));return {id,entity,details:old.title};
  });
 }
 async settings(actor,payload){const data=v.settings(payload.data);return this.mutation(actor,'settings',payload,async(tx,current,op)=>{assertAdmin(current);const old=await tx.get(this.ref('meta','settings'));if(data.activeSemesterId){const semester=await this.required(tx,'semesters',data.activeSemesterId);if(semester.status==='archived')v.fail('Restaure o semestre antes de ativá-lo.','failed-precondition');}tx.set(this.ref('meta','settings'),this.stamp(data,current,'settings',old.exists()?old.data():null,op));return {id:'settings',entity:'settings',details:'Configurações da turma atualizadas.'};});}
 async invite(actor,payload){const email=v.email(payload.email);if(email.includes('/'))v.fail('E-mail incompatível com o convite.');const name=v.text(payload.name,'Nome',120,true),role=v.enumValue(payload.role,['admin','student'],'Perfil');return this.mutation(actor,'invite',payload,async(tx,current,op)=>{assertOwner(current);const old=await tx.get(this.ref('invites',email));if(old.exists()&&old.data().status==='accepted')v.fail('O convite já foi aceito. Use a gestão de membros.','already-exists');tx.set(this.ref('invites',email),this.stamp({email,name,role,status:'pending'},current,email,old.exists()?old.data():null,op));return {id:email,entity:'invites',details:`Convite cadastrado para ${email}.`};});}
 async revokeInvite(actor,payload){const id=v.email(payload.id);return this.mutation(actor,'revokeInvite',payload,async(tx,current,op)=>{assertOwner(current);const old=await this.required(tx,'invites',id);if(old.status!=='pending')v.fail('Apenas convites pendentes podem ser revogados.','failed-precondition');tx.set(this.ref('invites',id),this.stamp({...old,status:'revoked'},current,id,old,op));return {id,entity:'invites',details:`Convite revogado: ${id}.`};});}
 async member(actor,payload){const id=v.id(payload.id),role=v.enumValue(payload.role,['owner','admin','student'],'Perfil'),active=v.bool(payload.active,'Acesso');return this.mutation(actor,'member',payload,async(tx,current,op)=>{assertOwner(current);const [old,access]=await Promise.all([this.required(tx,'members',id),this.required(tx,'config','access')]);if(id===access.ownerUid||role==='owner')v.fail('O responsável principal é fixo. Transferência ou recuperação exige o console Firebase.','failed-precondition');tx.set(this.ref('members',id),this.stamp({...old,role,active},current,id,old,op));return {id,entity:'members',details:`Acesso de ${old.name} atualizado.`};});}
 async request(actor,payload){
  const data=v.request(payload.data),id=this.newId('requests');
  return this.mutation(actor,'request',payload,async(tx,current,op)=>{
   await this.references(tx,data);
   if(data.parentId){const parent=await this.required(tx,'requests',data.parentId);if(parent.authorId!==current.id)v.fail('Você só pode complementar seus próprios pedidos.','permission-denied');}
   const limitRef=this.ref('requestLimits',current.id),limit=await tx.get(limitRef),dayString=new Date().toISOString().slice(0,10);
   const previousDay=limit.exists()?toPlain(limit.data().day).slice(0,10):'';
   const count=previousDay===dayString?limit.data().count:0;if(count>=10)v.fail('Você já enviou 10 solicitações neste dia UTC. Aguarde a renovação diária.','resource-exhausted');
   tx.set(this.ref('requests',id),this.stamp({...data,authorId:current.id,authorName:current.name,status:'pending',response:'',publishedId:'',publishedEntity:'',reviewedBy:''},current,id,null,op));
   tx.set(limitRef,{day:this.s.Timestamp.fromDate(new Date(`${dayString}T00:00:00Z`)),count:count+1,lastRequestId:id,updatedAt:this.timestamp()});
   return {id,entity:'requests',details:data.title};
  });
 }
 async review(actor,payload){
  const id=v.id(payload.id),status=v.enumValue(payload.status,['reviewing','awaiting','rejected','cancelled','approved'],'Situação'),response=v.text(payload.response,'Resposta',3000,status!=='reviewing');
  const entity=status==='approved'&&payload.entity?v.enumValue(payload.entity,['notices','events','materials','groups'],'Publicação'):'';
  const data=entity?v.entity(entity,payload.data):null,publishedId=entity?this.newId(entity):'';
  if(data&&data.status!=='published')v.fail('A aprovação deve criar conteúdo publicado.');
  return this.mutation(actor,'review',payload,async(tx,current,op)=>{
   assertAdmin(current);const old=await this.required(tx,'requests',id);expected(old,payload.expectedVersion);
   if(FINAL.has(old.status))v.fail('Esta solicitação já foi encerrada.','failed-precondition');
   const publishes=['notice','event','material','group'].includes(old.type);
   if(entity&&!publishes)v.fail('Pedidos de caixa, ajuda e correção devem ter resposta privada.','failed-precondition');
   if(status==='approved'&&publishes&&!entity)v.fail('Este pedido exige uma publicação.','failed-precondition');
   if(data){if(data.semesterId!==old.semesterId||(old.subjectId&&data.subjectId!==old.subjectId))v.fail('Mantenha o semestre e a matéria da solicitação.');await this.references(tx,data);}
   if(data)tx.set(this.ref(entity,publishedId),this.stamp({...data,sourceRequestId:id},current,publishedId,null,op));
   tx.set(this.ref('requests',id),this.stamp({...old,status,response,publishedId,publishedEntity:entity,reviewedBy:current.id},current,id,old,op));
   return {id,entity:'requests',details:`Pedido ${status}.`,response:{id,publishedId}};
  });
 }
 async ledger(actor,payload){const data=v.ledger(payload.data),id=this.newId('ledger');return this.mutation(actor,'ledger',payload,async(tx,current,op)=>{assertAdmin(current);await this.references(tx,data);const {contributorId,receiptUrl,...fields}=data;const income=data.type==='income';tx.set(this.ref('ledger',id),this.stamp({...fields,deltaCents:income?data.amountCents:-data.amountCents,incomeDeltaCents:income?data.amountCents:0,expenseDeltaCents:income?0:data.amountCents,reversalOf:'',reversedBy:'',reason:''},current,id,null,op));tx.set(this.ref('ledgerPrivate',id),{contributorId,receiptUrl,createdAt:this.timestamp(),createdBy:current.id});return {id,entity:'ledger',details:data.title};});}
 async reverse(actor,payload){const id=v.id(payload.id),reason=v.text(payload.reason,'Motivo do estorno',1000,true),reversalId=`${id}_reverse`;return this.mutation(actor,'reverse',payload,async(tx,current,op)=>{assertAdmin(current);const [old,privateSnap,existing]=await Promise.all([this.required(tx,'ledger',id),tx.get(this.ref('ledgerPrivate',id)),tx.get(this.ref('ledger',reversalId))]);if(old.reversalOf||old.reversedBy||existing.exists())v.fail('O movimento já foi estornado ou é um estorno.','failed-precondition');const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());tx.set(this.ref('ledger',reversalId),this.stamp({title:`Estorno: ${old.title}`.slice(0,120),date:day,type:old.type==='income'?'expense':'income',amountCents:old.amountCents,deltaCents:-old.deltaCents,incomeDeltaCents:-old.incomeDeltaCents,expenseDeltaCents:-old.expenseDeltaCents,category:'Estorno',goalId:old.goalId||'',description:reason,reason,reversalOf:id,reversedBy:''},current,reversalId,null,op));tx.update(this.ref('ledger',id),{reversedBy:reversalId,version:old.version+1,updatedAt:this.timestamp(),updatedBy:current.id,lastOperation:op});tx.set(this.ref('ledgerPrivate',reversalId),{contributorId:privateSnap.exists()?privateSnap.data().contributorId:'',receiptUrl:'',createdAt:this.timestamp(),createdBy:current.id});return {id:reversalId,entity:'ledger',details:reason};});}
 async personal(actor,payload){
  const data=v.personal(payload.data);
  await this.s.runTransaction(this.db,async tx=>{
   const personalRef=this.ref('personal',actor.id),snap=await tx.get(personalRef),old=snap.exists()?snap.data():DEFAULT_PERSONAL;
   if(data.preferences?.subjectId)await this.required(tx,'subjects',data.preferences.subjectId);
   const changes=Object.entries(data.read||{}).filter(([id,version])=>old.read?.[id]!==version);
   if(changes.length>10)v.fail('Confirme no máximo 10 avisos por vez.');
   const notices=await Promise.all(changes.map(([id])=>this.required(tx,'notices',id)));
   notices.forEach((notice,i)=>{if(notice.status!=='published'||notice.important!==true||notice.version!==changes[i][1])v.fail('Confirmação de leitura inválida. Atualize os avisos.');});
   const next=Object.fromEntries(Object.keys(DEFAULT_PERSONAL).map(key=>[key,data[key]??old[key]??DEFAULT_PERSONAL[key]]));
   tx.set(personalRef,{id:actor.id,...next,updatedAt:this.timestamp()});
   changes.forEach(([noticeId,version])=>tx.set(this.ref('noticeReads',`${actor.id}_${noticeId}`),{memberId:actor.id,memberName:actor.name,noticeId,version,updatedAt:this.timestamp()}));
  });this.clear();return {id:actor.id};
 }
 async cloneSemester(actor,payload){
  assertAdmin(actor);const input=v.cloneSemester(payload.data),id=this.newId('semesters');
  const map=Object.fromEntries(input.subjectIds.map(old=>[old,this.newId('subjects')]));
  // Web SDK transactions do not query collections. Capture candidates first, then
  // re-read every selected document in the transaction before writing the clone.
  const candidateGroups=input.copySchedules?await Promise.all(input.subjectIds.map(subjectId=>this.docs(this.s.query(this.coll('schedules'),this.s.where('subjectId','==',subjectId),this.s.where('status','==','published'),this.s.limit(101))))):[];
  const candidateIds=candidateGroups.flatMap(group=>group.docs.map(doc=>doc.id));if(candidateIds.length>100)v.fail('A cópia aceita até 100 horários. Selecione menos matérias ou desmarque Copiar horários.','resource-exhausted');
  return this.mutation(actor,'cloneSemester',payload,async(tx,current,op)=>{
   assertAdmin(current);const source=await this.required(tx,'semesters',input.sourceSemesterId);if(!['published','archived'].includes(source.status))v.fail('Semestre de origem indisponível.','failed-precondition');
   const subjects=await Promise.all(input.subjectIds.map(subjectId=>this.required(tx,'subjects',subjectId)));
   if(subjects.some(subject=>subject.semesterId!==source.id||subject.status!=='published'))v.fail('Selecione matérias publicadas do semestre de origem.','failed-precondition');
   const teachers=await Promise.all([...new Set(subjects.flatMap(subject=>subject.teacherIds||[]))].map(teacherId=>this.required(tx,'teachers',teacherId)));
   if(teachers.some(teacher=>teacher.status==='archived'))v.fail('Restaure o professor arquivado ou corrija o vínculo da matéria antes de copiar.','failed-precondition');
   const schedules=await Promise.all(candidateIds.map(scheduleId=>this.required(tx,'schedules',scheduleId)));
   if(schedules.some(schedule=>schedule.semesterId!==source.id||schedule.status!=='published'||!map[schedule.subjectId]))v.fail('Os horários mudaram. Atualize a página e tente novamente.','aborted');
   const copiedSubjects=subjects.map(subject=>this.stamp({...v.entity('subjects',{...schemaFields('subjects',subject),semesterId:id}),clonedFrom:subject.id},current,map[subject.id],null,op));
   const copiedSchedules=schedules.map(schedule=>{const scheduleId=this.newId('schedules');return this.stamp({...v.entity('schedules',{...schemaFields('schedules',schedule),semesterId:id,subjectId:map[schedule.subjectId]}),clonedFrom:schedule.id},current,scheduleId,null,op);});
   tx.set(this.ref('semesters',id),this.stamp({title:input.title,startDate:input.startDate,endDate:input.endDate,status:'published',clonedFrom:source.id},current,id,null,op));
   copiedSubjects.forEach(subject=>tx.set(this.ref('subjects',subject.id),subject));copiedSchedules.forEach(schedule=>tx.set(this.ref('schedules',schedule.id),schedule));
   return {id,entity:'semesters',details:`Criado a partir de ${source.title}: ${subjects.length} matérias e ${schedules.length} horários.`,response:{id,subjectCount:subjects.length,scheduleCount:schedules.length}};
  });
 }
 async backup(actor){assertOwner(actor);const collections={};let size=0;for(const entity of [...ENTITIES,'ledgerPrivate','noticeReads']){const rows=[];let cursor=null;while(true){const constraints=[this.s.orderBy(this.s.documentId())];if(cursor)constraints.push(this.s.startAfter(cursor));constraints.push(this.s.limit(200));const page=await this.docs(this.s.query(this.coll(entity),...constraints));for(const doc of page.docs){const row=toPlain({...doc.data(),id:doc.id});size+=new TextEncoder().encode(JSON.stringify(row)).length;if(size>8*1024*1024)v.fail('O backup excedeu 8 MB. Peça ajuda para dividir a exportação em arquivos menores; nenhum dado foi apagado.','resource-exhausted');rows.push(row);}if(page.docs.length<200)break;cursor=page.docs.at(-1).id;}collections[entity]=rows;}for(const [entity,id] of [['meta','settings'],['config','access']]){const snapshot=await this.get(this.ref(entity,id));collections[entity]=snapshot.exists()?[toPlain({...snapshot.data(),id})]:[];}return {format:'portal-turma-spark-backup',version:2,classId:'turma-licenciatura',exportedAt:new Date().toISOString(),exportedBy:actor.id,collections,note:'Exportação lógica sem senhas, contas Authentication, preferências pessoais, operações internas ou arquivos externos. Evite edições durante a exportação.'};}
 async call(action,payload={}){
  try{
   v.object(payload);if(new TextEncoder().encode(JSON.stringify(payload)).length>200000)v.fail('Solicitação muito grande.');
   const actor=await this.actor();let result;
   if(action==='bootstrap')result=await this.bootstrap(actor,payload);
   else if(action==='list')result=await this.list(actor,payload,!!payload.force);
   else if(action==='archive'||action==='restore')result=await this.archive(actor,action,payload);
   else if(action==='backup')result=await this.backup(actor);
   else if(['save','settings','invite','revokeInvite','member','request','review','ledger','reverse','personal','cloneSemester'].includes(action))result=await this[action](actor,payload);
   else v.fail('Ação não reconhecida.');
   return toPlain(result);
  }catch(error){
   // Preserve the interface's existing login-expired convention during the Spark migration.
   if(error.code==='permission-denied'||error.code==='unauthenticated')error.code=`functions/${error.code}`;
   if((error.code||'').includes('permission-denied'))this.clear();
   throw error;
  }
 }
}
