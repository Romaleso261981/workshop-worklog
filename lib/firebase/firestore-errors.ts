import { FirebaseError } from "firebase/app";

export function isFirestorePermissionDenied(e: unknown): boolean {
  return e instanceof FirebaseError && e.code === "permission-denied";
}

/** Підказка для UI, коли правила в консолі не збігаються з репозиторієм. */
export const UK_FIRESTORE_RULES_HINT =
  "Доступ заборонено правилами Firestore. У Firebase Console → Firestore → Rules опублікуйте вміст файлу firestore.rules з репозиторію (або firebase deploy --only firestore:rules).";
