import { initializeApp, getApps } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Inicializar solo si no existe
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
// Elimina la persistencia Firebase que pudieran tener clientes de versiones
// anteriores; la sesión durable vive únicamente en la cookie del servidor.
export const authReady = typeof window === 'undefined'
  ? Promise.resolve()
  : setPersistence(auth, inMemoryPersistence).then(() => signOut(auth));
export default app;
