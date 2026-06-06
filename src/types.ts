export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: any; // Firestore Timestamp
  updatedAt: any;
}

export interface Photo {
  id: string;
  title: string;
  imageUrl: string; // Base64 image string or URL
  tags: string[];
  privacy: "public" | "private" | "shared";
  ownerId: string;
  ownerEmail: string;
  sharedWith: string[]; // List of emails
  createdAt: any; // Firestore Timestamp
  updatedAt: any;
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
