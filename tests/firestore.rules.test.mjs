/**
 * Real Security Rules tests through the Firestore Emulator REST API.
 * No Firebase SDK dependency, and never connects to a production Firebase project.
 * Run: npm run test:rules (requires a working Firebase CLI + Java installation).
 * Without FIRESTORE_EMULATOR_HOST this suite is explicitly skipped.
 */
import {test,before,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project='demo-portal-spark';
const origin=`http://${host||'127.0.0.1:8085'}`;
const database=`projects/${project}/databases/(default)`;
const base=`${origin}/v1/${database}/documents`;
const root='classes/turma-licenciatura';
const SERVER=Symbol('server timestamp');
const fixed={timestampValue:'2026-01-01T00:00:00.000Z'};
const ftime=value=>({timestampValue:value});

function encode(value){
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 if(value&&Object.keys(value).length===1&&Object.hasOwn(value,'timestampValue'))return value;
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
}
function token(uid,verified=true){
 const now=Math.floor(Date.now()/1000);
 const encodePart=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 return `${encodePart({alg:'none',typ:'JWT'})}.${encodePart({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:now,exp:now+3600,email:`${uid}@turma.edu.br`,email_verified:verified,firebase:{sign_in_provider:'custom',identities:{}}})}.`;
}
async function api(method,url,body,uid){
 const headers={'Content-Type':'application/json'};
 if(uid)headers.Authorization=`Bearer ${uid==='__console__'?'owner':typeof uid==='string'?token(uid):token(uid.id,uid.verified)}`;
 const response=await fetch(url,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data};
}
function write(path,data,{exists}={}){
 const fields=Object.fromEntries(Object.entries(data).filter(([,v])=>v!==SERVER).map(([k,v])=>[k,encode(v)]));
 const updateTransforms=Object.entries(data).filter(([,v])=>v===SERVER).map(([fieldPath])=>({fieldPath,setToServerValue:'REQUEST_TIME'}));
 return {update:{name:`${database}/documents/${root}/${path}`,fields},...(updateTransforms.length?{updateTransforms}:{}),...(exists===undefined?{}:{currentDocument:{exists}})};
}
const commit=(uid,writes)=>api('POST',`${base}:commit`,{writes},uid);
const get=(uid,path)=>api('GET',`${base}/${root}/${path}`,undefined,uid);
async function query(uid,entity,where){
 const structuredQuery={from:[{collectionId:entity}],...(where?{where:{fieldFilter:{field:{fieldPath:where[0]},op:'EQUAL',value:encode(where[1])}}}:{})};
 return api('POST',`${base}/${root}:runQuery`,{structuredQuery},uid);
}
function ok(response){assert.ok(response.status>=200&&response.status<300,JSON.stringify(response));return response;}
function denied(response){assert.equal(response.status,403,JSON.stringify(response));}
function rejected(response){assert.ok([400,403,409].includes(response.status),JSON.stringify(response));}
function originalMeta(id,uid='admin'){return {id,version:1,createdAt:fixed,updatedAt:fixed,createdBy:uid,updatedBy:uid,lastOperation:'seeded'};}
function createMeta(id,uid,operation){return {id,version:1,createdAt:SERVER,updatedAt:SERVER,createdBy:uid,updatedBy:uid,lastOperation:operation};}
function updateMeta(old,uid,operation){return {...old,version:old.version+1,updatedAt:SERVER,updatedBy:uid,lastOperation:operation};}
function operationWrites(uid,key,action,entity,recordId){
 return [
  write(`operations/${key}`,{id:key,actorId:uid,action,signature:'test-signature',result:{id:recordId},createdAt:SERVER},{exists:false}),
  write(`audit/${key}`,{id:key,actorId:uid,actorName:uid,action,entity,recordId,details:'Operação de teste.',createdAt:SERVER},{exists:false})
 ];
}
function official(uid,key,entity,id,fields){return [...operationWrites(uid,key,'save',entity,id),write(`${entity}/${id}`,{...createMeta(id,uid,key),...fields},{exists:false})];}
function ledger(id,uid='admin',key='admin_ledger-operation'){
 return {...createMeta(id,uid,key),title:'Contribuição',date:'2026-10-09',type:'income',amountCents:5000,deltaCents:5000,incomeDeltaCents:5000,expenseDeltaCents:0,category:'Turma',goalId:'',description:'',reversalOf:'',reversedBy:'',reason:''};
}
function requestRecord(id,uid,key){return {...createMeta(id,uid,key),title:'Novo aviso',description:'Solicitação de teste',type:'notice',semesterId:'semester',subjectId:'',sourceUrl:'https://example.org/fonte',relatedId:'',parentId:'',authorId:uid,authorName:uid,status:'pending',response:'',publishedId:'',publishedEntity:'',reviewedBy:''};}
function requestWrites(uid,id,key,count=1){
 const day=ftime(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
 return [...operationWrites(uid,key,'request','requests',id),write(`requests/${id}`,requestRecord(id,uid,key),{exists:false}),write(`requestLimits/${uid}`,{day,count,lastRequestId:id,updatedAt:SERVER})];
}
async function seed(records){ok(await commit('__console__',Object.entries(records).map(([p,d])=>write(p,d))));}
const members=Object.fromEntries(['owner','admin','student','other'].map(uid=>[`members/${uid}`,{id:uid,name:uid,email:`${uid}@turma.edu.br`,role:uid==='owner'?'owner':uid==='admin'?'admin':'student',active:true,version:1,createdAt:fixed,updatedAt:fixed,createdBy:uid,updatedBy:uid}]));

before(async()=>{
 if(!host)return;
 // Reject accidental use of a real Firestore hostname even if an environment variable is mistyped.
 assert.ok(!host.includes('googleapis.com')&&!host.includes('firebaseio.com'),'Use only a local Firestore Emulator host.');
 const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
 ok(await api('PUT',`${origin}/emulator/v1/projects/${project}:securityRules`,{rules:{files:[{name:'firestore.rules',content:rules}]}},'__console__'));
});
beforeEach(async()=>{
 if(!host)return;
 ok(await api('DELETE',`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`,undefined,'__console__'));
 await seed({'config/access':{ownerUid:'owner'},...members,'semesters/semester':{...originalMeta('semester'),title:'2026.2',startDate:'2026-08-01',endDate:'2026-12-20',status:'published'},'meta/settings':{...originalMeta('settings'),title:'Turma',course:'Licenciatura',university:'Universidade',activeSemesterId:'semester',helpText:''}});
});
const rulesTest=(name,fn)=>test(name,{skip:!host?'Firestore Emulator indisponível: testes reais não executados.':false,concurrency:false},fn);

rulesTest('nega visitante, e-mail não verificado e membro desativado',async()=>{
 denied(await get(null,'semesters/semester'));
 denied(await get({id:'student',verified:false},'semesters/semester'));
 await seed({'members/student':{...members['members/student'],active:false}});
 denied(await get('student','semesters/semester'));
 ok(await get('student','members/student'));
});
rulesTest('configuração do responsável é imutável e não concede escrita ao aluno',async()=>{
 ok(await get('student','config/access'));
 denied(await commit('student',[write('config/access',{ownerUid:'student'})]));
 denied(await commit('owner',[write('config/access',{ownerUid:'other'})]));
 denied(await commit('student',[write('members/student',{...members['members/student'],role:'admin'})]));
});
rulesTest('membros e convites respeitam escopos distintos de aluno/admin/owner',async()=>{
 ok(await get('student','members/student'));denied(await get('student','members/other'));
 denied(await query('student','members'));ok(await query('admin','members'));
 await seed({'invites/new@turma.edu.br':{...originalMeta('new@turma.edu.br','owner'),email:'new@turma.edu.br',name:'new',role:'student',status:'pending'}});
 ok(await get('new','invites/new@turma.edu.br'));
 denied(await query('admin','invites'));ok(await query('owner','invites'));
});
rulesTest('ingresso exige convite do mesmo e-mail e aceite atômico ligado ao UID',async()=>{
 const email='new@turma.edu.br',invite={...originalMeta(email,'owner'),email,name:'new',role:'student',status:'pending'};
 await seed({[`invites/${email}`]:invite});
 const member={id:'new',name:'new',email,role:'student',active:true,version:1,createdAt:SERVER,updatedAt:SERVER,createdBy:'new',updatedBy:'new'};
 denied(await commit('new',[write('members/new',member)]));
 const accepted={...invite,status:'accepted',acceptedBy:'new',acceptedAt:SERVER,updatedAt:SERVER,updatedBy:'new',version:2};
 denied(await commit('new',[write('members/new',{...member,role:'admin'}),write(`invites/${email}`,accepted)]));
 ok(await commit('new',[write('members/new',member),write(`invites/${email}`,accepted)]));
 ok(await get('new','semesters/semester'));
});
rulesTest('primeiro owner só é criado pelo UID definido no console',async()=>{
 ok(await api('DELETE',`${base}/${root}/members/owner`,undefined,'__console__'));
 const member={id:'owner',name:'owner',email:'owner@turma.edu.br',role:'owner',active:true,version:1,createdAt:SERVER,updatedAt:SERVER,createdBy:'owner',updatedBy:'owner'};
 denied(await commit('stranger',[write('members/stranger',{...member,id:'stranger',email:'stranger@turma.edu.br',createdBy:'stranger',updatedBy:'stranger'})]));
 ok(await commit('owner',[write('members/owner',member)]));
});
rulesTest('aluno não recebe rascunhos e queries precisam expressar status autorizado',async()=>{
 const common={...originalMeta('published'),title:'Aviso',description:'',semesterId:'semester',subjectId:'',category:'Comunicado',sourceUrl:'',eventId:'',pinned:false,important:false,expiresDate:''};
 await seed({'notices/published':{...common,status:'published'},'notices/draft':{...common,id:'draft',status:'draft'}});
 ok(await get('student','notices/published'));denied(await get('student','notices/draft'));
 denied(await query('student','notices'));ok(await query('student','notices',['status','published']));
 ok(await get('admin','notices/draft'));
});
rulesTest('conteúdo oficial requer administrador, operação e auditoria da mesma gravação',async()=>{
 const fields={title:'Docente',description:'',email:'prof@universidade.br',contact:'',officeHours:'',platformUrl:'',links:[],sourceCheckedDate:'',status:'published'};
 denied(await commit('student',official('student','student_publish','teachers','teacher',fields)));
 denied(await commit('admin',[write('teachers/teacher',{...createMeta('teacher','admin','missing'),...fields})]));
 ok(await commit('admin',official('admin','admin_publish','teachers','teacher',fields)));
 denied(await commit('admin',[{delete:`${database}/documents/${root}/teachers/teacher`}]));
});
rulesTest('aluno só envia pedido próprio e precisa atualizar contador diário atômico',async()=>{
 denied(await commit('student',[...operationWrites('student','student_nocounter','request','requests','request'),write('requests/request',requestRecord('request','student','student_nocounter'))]));
 ok(await commit('student',requestWrites('student','request','student_request1')));
 ok(await get('student','requests/request'));denied(await get('other','requests/request'));
 denied(await query('other','requests'));ok(await query('student','requests',['authorId','student']));
 denied(await commit('student',requestWrites('student','request2','student_request2',1)));
 ok(await commit('student',requestWrites('student','request2','student_request2',2)));
});
rulesTest('contador UTC recusa décimo primeiro pedido e dia inventado',async()=>{
 const day=ftime(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
 await seed({'requestLimits/student':{day,count:10,lastRequestId:'seed',updatedAt:fixed}});
 denied(await commit('student',requestWrites('student','too-many','student_to_many',11)));
 const forged=requestWrites('student','forged','student_forged',1);
 forged[3]=write('requestLimits/student',{day:ftime('2099-01-01T00:00:00Z'),count:1,lastRequestId:'forged',updatedAt:SERVER});
 denied(await commit('student',forged));
});
rulesTest('aprovação de pedido é atômica, única e não publica comprovante financeiro',async()=>{
 ok(await commit('student',requestWrites('student','request','student_request')));
 const key='admin_approve',old=(await get('admin','requests/request')).data.fields;
 // Preserve Firestore timestamps exactly as returned by the emulator.
 const saved={...requestRecord('request','student','student_request'),createdAt:old.createdAt,updatedAt:old.updatedAt};
 const review={...updateMeta(saved,'admin',key),status:'approved',response:'Publicado.',publishedId:'notice',publishedEntity:'notices',reviewedBy:'admin'};
 const publication={...createMeta('notice','admin',key),sourceRequestId:'request',title:'Aviso',description:'Texto',semesterId:'semester',subjectId:'',category:'Comunicado',sourceUrl:'',eventId:'',pinned:false,important:false,expiresDate:'',status:'published'};
 const writes=[...operationWrites('admin',key,'review','requests','request'),write('requests/request',review),write('notices/notice',publication)];
 denied(await commit('admin',writes.slice(0,3)));ok(await commit('admin',writes));
 rejected(await commit('admin',writes));
 await seed({'requests/finance':{...originalMeta('finance','student'),...requestRecord('finance','student','seed'),createdAt:fixed,updatedAt:fixed,type:'finance'}});
 const finance={...review,id:'finance',type:'finance',createdAt:fixed,publishedId:'private-notice',lastOperation:'admin_finance'};
 denied(await commit('admin',[...operationWrites('admin','admin_finance','review','requests','finance'),write('requests/finance',finance),write('notices/private-notice',{...publication,id:'private-notice',sourceRequestId:'finance',lastOperation:'admin_finance'})]));
});
rulesTest('preferências privadas também são negadas ao owner e nunca entram em leitura coletiva',async()=>{
 const personal={id:'student',favorites:[],tasks:{},read:{},preferences:{theme:'light'},updatedAt:SERVER};
 ok(await commit('student',[write('personal/student',personal)]));
 ok(await get('student','personal/student'));denied(await get('owner','personal/student'));
 denied(await query('owner','personal'));
 denied(await commit('other',[write('personal/student',personal)]));
});
rulesTest('leitura de avisos exige autor, aviso importante publicado e versão atual',async()=>{
 await seed({'notices/notice':{...originalMeta('notice'),title:'Leia',status:'published',important:true}});
 const read={memberId:'student',memberName:'student',noticeId:'notice',version:1,updatedAt:SERVER};
 ok(await commit('student',[write('noticeReads/student_notice',read)]));
 denied(await commit('other',[write('noticeReads/student_notice',read)]));
 denied(await commit('student',[write('noticeReads/student_notice',{...read,version:99})]));
 ok(await get('admin','noticeReads/student_notice'));denied(await get('other','noticeReads/student_notice'));
});
rulesTest('caixa usa centavos exatos, mantém privado comprovante e proíbe alterar original',async()=>{
 const key='admin_ledger-operation',data=ledger('entry','admin',key);
 const privateData={contributorId:'student',receiptUrl:'https://example.org/private',createdAt:SERVER,createdBy:'admin'};
 ok(await commit('admin',[...operationWrites('admin',key,'ledger','ledger','entry'),write('ledger/entry',data),write('ledgerPrivate/entry',privateData)]));
 ok(await get('student','ledger/entry'));ok(await get('student','ledgerPrivate/entry'));
 denied(await get('other','ledgerPrivate/entry'));denied(await query('student','ledgerPrivate'));
 ok(await query('student','ledgerPrivate',['contributorId','student']));
 denied(await commit('admin',[write('ledger/entry',{...data,amountCents:7000})]));
 const forged={...ledger('forged','admin','admin_forged'),deltaCents:999999};
 denied(await commit('admin',[...operationWrites('admin','admin_forged','ledger','ledger','forged'),write('ledger/forged',forged)]));
});
rulesTest('estorno determinístico precisa atualizar original e só pode ser criado uma vez',async()=>{
 const id='entry',original={...ledger(id),...originalMeta(id)};
 await seed({[`ledger/${id}`]:original});
 const key='admin_reverse',revId=id+'_reverse';
 const reversed={...updateMeta(original,'admin',key),reversedBy:revId};
 const reversal={...ledger(revId,'admin',key),title:'Estorno',type:'expense',deltaCents:-5000,incomeDeltaCents:-5000,expenseDeltaCents:0,reversalOf:id,reason:'Duplicado'};
 const writes=[...operationWrites('admin',key,'reverse','ledger',revId),write(`ledger/${id}`,reversed),write(`ledger/${revId}`,reversal,{exists:false})];
 denied(await commit('admin',[writes[0],writes[1],writes[3]]));
 ok(await commit('admin',writes));rejected(await commit('admin',writes));
});
rulesTest('arquivamento protege semestre ativo e permite semestre quando settings ainda não existe',async()=>{
 const id='semester',key='admin_archive-semester';
 const archived={...originalMeta(id),title:'2026.2',startDate:'2026-08-01',endDate:'2026-12-20',status:'archived',previousStatus:'published',version:2,updatedAt:SERVER,lastOperation:key};
 const writes=[...operationWrites('admin',key,'archive','semesters',id),write(`semesters/${id}`,archived)];
 denied(await commit('admin',writes));
 ok(await api('DELETE',`${base}/${root}/meta/settings`,undefined,'__console__'));
 ok(await commit('admin',writes));
});
