import {firebaseConfig} from './config.js';
import {FirestoreStore} from './store.js';

export const configured = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('COLE_') && firebaseConfig.projectId !== 'SEU_PROJETO';

export class FirebaseService {
  async init(onUser) {
    const base='https://www.gstatic.com/firebasejs/12.19.0/';
    const [app,auth,firestore]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
    this.a=auth;
    this.app=app.initializeApp(firebaseConfig);
    this.auth=auth.getAuth(this.app);this.auth.languageCode='pt-BR';
    await auth.setPersistence(this.auth,auth.browserSessionPersistence);
    this.db=firestore.getFirestore(this.app);
    this.store=new FirestoreStore({db:this.db,auth:this.auth,sdk:firestore});
    this.unsubscribe=auth.onAuthStateChanged(this.auth,user=>{this.store.clear();onUser(user);});
  }
  async call(action,payload={}) { return this.store.call(action,payload); }
  async login(email,password){return this.a.signInWithEmailAndPassword(this.auth,email,password);}
  async google(){return this.a.signInWithPopup(this.auth,new this.a.GoogleAuthProvider());}
  async signup(name,email,password){const c=await this.a.createUserWithEmailAndPassword(this.auth,email,password);await this.a.updateProfile(c.user,{displayName:name});await this.a.sendEmailVerification(c.user);return c;}
  async reset(email){await this.a.sendPasswordResetEmail(this.auth,email);}
  async resend(){await this.a.sendEmailVerification(this.auth.currentUser);}
  async reload(){await this.auth.currentUser.reload();await this.auth.currentUser.getIdToken(true);return this.auth.currentUser;}
  async logout(){this.store?.clear();await this.a.signOut(this.auth);}
}

export function friendlyError(error){
 if(error?.name==='InputError')return error.message;
 const map={'auth/invalid-credential':'E-mail ou senha incorretos.','auth/popup-blocked':'O navegador bloqueou a janela. Permita pop-ups ou use e-mail e senha.','auth/popup-closed-by-user':'A janela de login foi fechada.','auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos.','auth/email-already-in-use':'Este e-mail já tem conta. Entre ou recupere sua senha.','auth/weak-password':'Use uma senha com pelo menos 8 caracteres.','auth/unauthorized-domain':'Autorize o domínio do site em Firebase Authentication > Configurações.','auth/network-request-failed':'Falha de conexão. Verifique sua internet.','unavailable':'O Firestore está indisponível. Confira a conexão e tente novamente.','resource-exhausted':'A cota gratuita do Firebase ou o limite desta ação foi atingido. Aguarde a renovação e tente novamente.','functions/permission-denied':'Acesso negado. Confira seu convite, a verificação do e-mail e as regras do Firestore.','functions/unauthenticated':'Entre novamente para continuar.','failed-precondition':'Confira os índices do Firestore e os dados informados. Veja os detalhes do erro.'};
 return map[error?.code] || error?.message || 'Não foi possível concluir. Tente novamente.';
}
