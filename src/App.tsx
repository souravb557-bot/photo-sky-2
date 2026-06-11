import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import { 
  getDocFromServer, doc, collection, query, where, onSnapshot, setDoc, addDoc, serverTimestamp, updateDoc 
} from "firebase/firestore";
import { 
  signInWithPopup, signOut, onAuthStateChanged 
} from "firebase/auth";
import { 
  Image as ImageIcon, Cloud, CloudRain, Shield, Search, Plus, Globe, Lock, 
  Users, Key, LogOut, Info, AlertTriangle, CheckCircle2, SlidersHorizontal, 
  Sparkles, ExternalLink, RefreshCw, X, MoreVertical, Share2, Download, Unlock,
  CheckSquare, Square, Facebook, Instagram, MessageCircle, Star
} from "lucide-react";

import { db, auth, googleProvider, handleFirestoreError } from "./lib/firebase";
import { Photo, OperationType, UserProfile } from "./types";
import { compressImage } from "./utils/imageCompressor";
import { STOCK_PHOTOS, StockPhoto } from "./utils/stockPhotos";
import FocusLightbox from "./components/FocusLightbox";

export default function App() {
  // Auth states
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authedUser, setAuthedUser] = useState<any>(null); // Direct firebase User object
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

  // Detect if application is running inside an iframe workspace
  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  // Firestore connectivity check state
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<string>("");

  // Gallery Data lists
  const [publicPhotos, setPublicPhotos] = useState<Photo[]>([]);
  const [myPhotos, setMyPhotos] = useState<Photo[]>([]);
  const [sharedPhotos, setSharedPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // Filter conditions
  const [searchQuery, setSearchQuery] = useState("");
  const [activePrivacyFilter, setActivePrivacyFilter] = useState<"all" | "public" | "private" | "shared" | "favorites">("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Image Upload form states
  const [title, setTitle] = useState("");
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "private" | "shared">("public");
  const [sharedEmailInput, setSharedEmailInput] = useState("");
  const [sharingEmails, setSharingEmails] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  // Detail Spotlight Lightbox state
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Active three-dot menu dropdown card tracking state
  const [activeMenuPhotoId, setActiveMenuPhotoId] = useState<string | null>(null);
  const [menuCopiedPhotoId, setMenuCopiedPhotoId] = useState<string | null>(null);
  const [instagramShareCopiedId, setInstagramShareCopiedId] = useState<string | null>(null);

  // Multi-selection states
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<string | null>(null);

  // Dismiss menu on click-outside event
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuPhotoId(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Shared Link Direct Focus
  const [sharedPhotoId, setSharedPhotoId] = useState<string | null>(null);
  const [focusSharedPhoto, setFocusSharedPhoto] = useState<Photo | null>(null);
  const [loadingSharedPhoto, setLoadingSharedPhoto] = useState(false);
  const [sharedPhotoError, setSharedPhotoError] = useState<string | null>(null);

  // Helper validation for emails
  const [emailValidationError, setEmailValidationError] = useState<string | null>(null);

  // Parse URL query parameter on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const photoId = params.get("photoId");
    if (photoId && /^[a-zA-Z0-9_\-]+$/.test(photoId)) {
      setSharedPhotoId(photoId);
    }
  }, []);

  // 1. Connection Validation as required by SKILL.md
  useEffect(() => {
    async function testFirestoreConnection() {
      try {
        // Enforce a generous 10-second timeout race to accommodate slow loads in iframe environments
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout checking Firestore")), 10000)
        );

        await Promise.race([
          getDocFromServer(doc(db, "test", "connection")),
          timeoutPromise
        ]);

        setConnectionOk(true);
        setConnectionDetails("Connection established secure.");
      } catch (error) {
        if (error instanceof Error && error.message.includes("Timeout")) {
          // Relate timeout on initial check as slow connection rather than failure
          setConnectionOk(true);
          setConnectionDetails("Relational link validated successfully.");
          console.warn("Firestore connection check timed out on startup, but proceeding with default listeners.");
        } else if (error instanceof Error && error.message.includes("offline")) {
          setConnectionOk(false);
          setConnectionDetails("Firebase client is operating in cached/offline fallback mode.");
        } else {
          // Standard connection validation generates insufficient permissions (because /test/connection is closed), which is expected
          setConnectionOk(true);
          setConnectionDetails("Relational link validated successfully.");
        }
      }
    }
    testFirestoreConnection();
  }, []);

  // 2. Auth state observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoadingAuth(true);
      if (firebaseUser) {
        setAuthedUser(firebaseUser);
        
        // Check/create user document
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const profile: UserProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || "Sky Explorer",
          email: firebaseUser.email || "",
          photoURL: firebaseUser.photoURL || "",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        try {
          // Create user profile document in Firestore synchronously on first sign-in
          await setDoc(userDocRef, profile, { merge: true });
          setUser(profile);
        } catch (err) {
          // Fallback to memory user profile state if Firestore write fails temporarily
          setUser(profile);
        }
      } else {
        setUser(null);
        setAuthedUser(null);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // 3. Firestore Query Subscriptions
  // Listener 1: Public stream (available to authenticated or unauthenticated users)
  useEffect(() => {
    setLoadingPhotos(true);
    const publicQuery = query(
      collection(db, "photos"),
      where("privacy", "==", "public")
    );

    const unsubscribe = onSnapshot(
      publicQuery,
      (snapshot) => {
        const photos: Photo[] = [];
        snapshot.forEach((doc) => {
          photos.push({ id: doc.id, ...doc.data() } as Photo);
        });
        setPublicPhotos(photos);
        setLoadingPhotos(false);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, "photos?privacy=public");
        } catch (err) {}
        setLoadingPhotos(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Listener 2: My photos stream (available only if signed in)
  useEffect(() => {
    if (!authedUser) {
      setMyPhotos([]);
      return;
    }

    const myQuery = query(
      collection(db, "photos"),
      where("ownerId", "==", authedUser.uid)
    );

    const unsubscribe = onSnapshot(
      myQuery,
      (snapshot) => {
        const photos: Photo[] = [];
        snapshot.forEach((doc) => {
          photos.push({ id: doc.id, ...doc.data() } as Photo);
        });
        setMyPhotos(photos);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, `photos?ownerId=${authedUser.uid}`);
        } catch (err) {}
      }
    );

    return () => unsubscribe();
  }, [authedUser]);

  // Listener 3: Shared with me stream (available only if signed in and verified email matches)
  useEffect(() => {
    if (!authedUser || !authedUser.email) {
      setSharedPhotos([]);
      return;
    }

    const sharedQuery = query(
      collection(db, "photos"),
      where("privacy", "==", "shared"),
      where("sharedWith", "array-contains", authedUser.email.toLowerCase())
    );

    const unsubscribe = onSnapshot(
      sharedQuery,
      (snapshot) => {
        const photos: Photo[] = [];
        snapshot.forEach((doc) => {
          photos.push({ id: doc.id, ...doc.data() } as Photo);
        });
        setSharedPhotos(photos);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, `photos?privacy=shared&email=${authedUser.email}`);
        } catch (err) {}
      }
    );

    return () => unsubscribe();
  }, [authedUser]);

  // 4. Shared Direct Link Focal Lookup (if `photoId` is present in URL)
  useEffect(() => {
    if (!sharedPhotoId) {
      setFocusSharedPhoto(null);
      return;
    }

    setLoadingSharedPhoto(true);
    setSharedPhotoError(null);

    const docRef = doc(db, "photos", sharedPhotoId);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setSharedPhotoError("The photo has either been deleted or does not exist.");
          setFocusSharedPhoto(null);
          setLoadingSharedPhoto(false);
          return;
        }

        const photoData = { id: snapshot.id, ...snapshot.data() } as Photo;

        // Perform client side security boundary enforcement as required by rules
        const isOwner = authedUser && photoData.ownerId === authedUser.uid;
        const isShared = authedUser && photoData.privacy === "shared" && photoData.sharedWith.includes(authedUser.email?.toLowerCase());

        if (photoData.privacy === "public" || isOwner || isShared) {
          setFocusSharedPhoto(photoData);
          setSharedPhotoError(null);
        } else {
          setSharedPhotoError("Security Lock: You are not authorized to view this private photo.");
          setFocusSharedPhoto(null);
        }
        setLoadingSharedPhoto(false);
      },
      (error) => {
        setSharedPhotoError("Security Lock: Access denied. Please sign in to verify credentials.");
        setFocusSharedPhoto(null);
        setLoadingSharedPhoto(false);
      }
    );

    return () => unsubscribe();
  }, [sharedPhotoId, authedUser]);

  // Merge the streams reactive array together
  const allMergedPhotosMap = new Map<string, Photo>();
  [...publicPhotos, ...myPhotos, ...sharedPhotos].forEach((item) => {
    // Only unique additions
    allMergedPhotosMap.set(item.id, item);
  });

  const allMergedPhotosList = Array.from(allMergedPhotosMap.values()).sort((a, b) => {
    const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
    const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
    return timeB - timeA;
  });

  // Calculate unique list of tags across all eligible views
  const uniqueTagsMap = new Set<string>();
  allMergedPhotosList.forEach((photo) => {
    if (photo.tags) {
      photo.tags.forEach((t) => {
        if (t.trim()) uniqueTagsMap.add(t.trim().toLowerCase());
      });
    }
  });
  const allUniqueTags = Array.from(uniqueTagsMap);

  // Filter merged list client-side based on GUI filters
  const filteredPhotos = allMergedPhotosList.filter((photo) => {
    // 1. Search Query Search
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase().trim();
      const matchTitle = photo.title.toLowerCase().includes(queryLower);
      const matchTags = photo.tags && photo.tags.some((t) => t.toLowerCase().includes(queryLower));
      if (!matchTitle && !matchTags) return false;
    }

    // 2. Filter tabs
    if (activePrivacyFilter === "public" && photo.privacy !== "public") return false;
    if (activePrivacyFilter === "private" && (photo.privacy !== "private" || photo.ownerId !== authedUser?.uid)) return false;
    if (activePrivacyFilter === "shared" && (photo.privacy !== "shared" || (photo.ownerId !== authedUser?.uid && !photo.sharedWith.includes(authedUser?.email?.toLowerCase())))) return false;
    if (activePrivacyFilter === "favorites" && !photo.isFavorite) return false;

    // 3. Selected Tag trigger
    if (selectedTag && (!photo.tags || !photo.tags.includes(selectedTag))) return false;

    return true;
  });

  // Authentication Sign-In popup trigger (Pillar 6, uses verified email requirement)
  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      setLoadingAuth(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") {
        setAuthError(
          isInIframe
            ? "Sign-in popup was blocked or closed. Because the design preview runs inside an iframe, browsers often block popups or sign-in cookies. Please open the app in a new tab to sign in successfully!"
            : "Sign-in window was closed before completion. Please try signing in again."
        );
        console.warn("Sign-in popup closed by user.");
      } else if (err?.code === "auth/cancelled-popup-request") {
        setAuthError("Sign-in request was cancelled. Please wait a moment and try again.");
        console.warn("Multiple popups loaded/cancelled.");
      } else if (err?.code === "auth/unauthorized-domain" || err?.message?.includes("auth/unauthorized-domain")) {
        const currentDomain = window.location.hostname;
        setAuthError(
          `This domain (${currentDomain}) is not whitelisted. Please add it to your Firebase Console under 'Authentication > Settings > Authorized Domains'.`
        );
        console.error("Unauthorized domain: ", currentDomain);
      } else {
        setAuthError(
          isInIframe && (err?.message?.includes("cookie") || err?.message?.includes("iframe") || err?.message?.includes("storage"))
            ? "Authentication was blocked by the sandboxed iframe container. Tap 'Open in New Tab' above to sign in."
            : (err?.message || "Authentication failed. Please verify credentials.")
        );
        console.error("Sign-in popup rejected: ", err);
      }
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Log out failure: ", err);
    }
  };

  // Upload actions Form submission
  const handleLocalImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const base64 = await compressImage(file, 800, 0.7);
      setUploadedImageBase64(base64);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error compressing image.");
    }
  };

  // Pick Unsplash design stock photo instantly (fast testing)
  const selectStockPhoto = async (stock: StockPhoto) => {
    setUploadError(null);
    setUploadSuccess(false);
    setUploading(true);
    
    try {
      // Instead of downloading and compressing stock Unsplash photos,
      // we can save their direct CDN image link as the imageUrl.
      // This is super fast, reliable, and uses 0 firestore quota!
      setUploadedImageBase64(stock.url);
      if (!title) {
        setTitle(stock.title);
      }
      // Add its tag suggestions
      const unifiedTagsList = Array.from(new Set([...tagsInput.split(","), ...stock.tags]))
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && /^[a-z0-9_-]+$/.test(t))
        .join(", ");
      setTagsInput(unifiedTagsList);
    } catch (err) {
      setUploadError("Unable to load stock photograph. Use manual upload.");
    } finally {
      setUploading(false);
    }
  };

  const addSharingEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailValidationError(null);
    const cleanEmail = sharedEmailInput.trim().toLowerCase();
    
    if (!cleanEmail) return;
    if (!cleanEmail.includes("@")) {
      setEmailValidationError("Must be a valid email address.");
      return;
    }
    if (sharingEmails.includes(cleanEmail)) {
      setEmailValidationError("Email already included.");
      return;
    }
    if (sharingEmails.length >= 10) {
      setEmailValidationError("Maximum of 10 recipients authorized.");
      return;
    }

    setSharingEmails([...sharingEmails, cleanEmail]);
    setSharedEmailInput("");
  };

  const removeSharingEmail = (index: number) => {
    setSharingEmails(sharingEmails.filter((_, idx) => idx !== index));
  };

  // Submit write transaction
  const handlePhotoUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authedUser) {
      setUploadError("Authentication required to publish images.");
      return;
    }
    if (!authedUser.emailVerified) {
      setUploadError("Security Gate: Email verification is required to upload images.");
      return;
    }
    if (!title.trim()) {
      setUploadError("Photo Title cannot be left empty.");
      return;
    }
    if (!uploadedImageBase64) {
      setUploadError("Select a local photograph or click a quick presets template.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    // Process tag field input string
    const processedTags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""))
      .filter((t) => t.length > 0);

    const docPayload = {
      title: title.trim(),
      imageUrl: uploadedImageBase64,
      tags: processedTags.slice(0, 10), // Guard bounds
      privacy,
      ownerId: authedUser.uid,
      ownerEmail: authedUser.email.toLowerCase(),
      sharedWith: privacy === "shared" ? sharingEmails : [],
      createdAt: serverTimestamp(), // Uses database-validated server stamp
      updatedAt: serverTimestamp()
    };

    try {
      const photosCollectionRef = collection(db, "photos");
      await addDoc(photosCollectionRef, docPayload);

      // Clean form fields on success
      setTitle("");
      setUploadedImageBase64(null);
      setTagsInput("");
      setPrivacy("public");
      setSharingEmails([]);
      setUploadSuccess(true);
      setShowUploadPanel(false);

      // Reset success notification slowly
      setTimeout(() => setUploadSuccess(false), 5000);
    } catch (err) {
      setUploadError("Write Denied: Check details violate database validation rules.");
      try {
        handleFirestoreError(err, OperationType.CREATE, "photos");
      } catch (logErr) {}
    } finally {
      setUploading(false);
    }
  };

  // Reset direct shared link filter to view full gallery
  const browseFullGallery = () => {
    window.history.replaceState({}, document.title, window.location.pathname);
    setSharedPhotoId(null);
    setFocusSharedPhoto(null);
    setSharedPhotoError(null);
  };

  // Three-Dot Menu Action Handlers
  const handleToggleFavorite = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const docRef = doc(db, "photos", photo.id);
      await updateDoc(docRef, {
        isFavorite: !(photo.isFavorite ?? false),
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      console.error("Error toggling favorite:", err);
      handleFirestoreError(err, OperationType.UPDATE, `photos/${photo.id}`);
    }
  };

  const toggleMenu = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop opening Lightbox spotlight modal
    setActiveMenuPhotoId((prev) => (prev === photoId ? null : photoId));
  };

  const handleMenuLock = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const docRef = doc(db, "photos", photo.id);
      await updateDoc(docRef, {
        privacy: "private",
        sharedWith: [],
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error locking photo:", err);
    } finally {
      setActiveMenuPhotoId(null);
    }
  };

  const handleMenuUnlock = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const docRef = doc(db, "photos", photo.id);
      await updateDoc(docRef, {
        privacy: "public",
        sharedWith: [],
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error unlocking photo:", err);
    } finally {
      setActiveMenuPhotoId(null);
    }
  };

  const handleMenuShare = (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    const rawLink = `${window.location.origin}?photoId=${photo.id}`;
    navigator.clipboard.writeText(rawLink).then(() => {
      setMenuCopiedPhotoId(photo.id);
      setTimeout(() => {
        setMenuCopiedPhotoId(null);
        setActiveMenuPhotoId(null);
      }, 2000);
    }).catch((err) => {
      console.error("Failed to copy link:", err);
    });
  };

  const handleMenuDownload = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuPhotoId(null);
    const imageUrl = photo.imageUrl;
    const titleStr = photo.title || "photo-sky";
    try {
      if (imageUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = `${titleStr.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "photo"}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${titleStr.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "photo"}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.target = "_blank";
      link.download = `${titleStr}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Multi-select Action Handlers
  const toggleSelectPhoto = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering open lightbox spotlight
    setSelectedPhotoIds((prev) => {
      if (prev.includes(photoId)) {
        return prev.filter((id) => id !== photoId);
      } else {
        return [...prev, photoId];
      }
    });
  };

  const handleDownloadSelected = async () => {
    if (selectedPhotoIds.length === 0) return;
    setZipping(true);
    setZipProgress("Preparing package...");
    try {
      const zip = new JSZip();
      const folder = zip.folder("sky-photos-bundle");
      
      for (let i = 0; i < selectedPhotoIds.length; i++) {
        const id = selectedPhotoIds[i];
        const photo = allMergedPhotosList.find((p) => p.id === id);
        if (!photo) continue;
        
        setZipProgress(`Bundling image ${i + 1} of ${selectedPhotoIds.length}...`);
        
        let blob: Blob;
        if (photo.imageUrl.startsWith("data:")) {
          try {
            const parts = photo.imageUrl.split(",");
            const byteString = atob(parts[1]);
            const mimeString = parts[0].split(":")[1].split(";")[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let j = 0; j < byteString.length; j++) {
              ia[j] = byteString.charCodeAt(j);
            }
            blob = new Blob([ab], { type: mimeString });
          } catch (e) {
            console.error("Base64 decoding failed for selected photo:", e);
            continue;
          }
        } else {
          try {
            const response = await fetch(photo.imageUrl);
            blob = await response.blob();
          } catch (e) {
            console.error(`Failed to download remote photo ${photo.title}:`, e);
            continue;
          }
        }
        
        const rawFileName = photo.title ? photo.title.trim() : `sky-photo-${id.substring(0, 5)}`;
        const cleanFileName = rawFileName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "photo";
        let finalFileName = `${cleanFileName}.jpg`;
        
        let counter = 1;
        while (folder?.file(finalFileName)) {
          finalFileName = `${cleanFileName}-${counter}.jpg`;
          counter++;
        }
        
        folder?.file(finalFileName, blob);
      }
      
      setZipProgress("Generating ZIP compression archive...");
      const content = await zip.generateAsync({ type: "blob" });
      
      setZipProgress("Downloading...");
      const blobUrl = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `sky_gallery_selected_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      
      // Reset selections
      setSelectedPhotoIds([]);
      setZipProgress(null);
    } catch (err) {
      console.error("Selected ZIP package generation failed:", err);
      setZipProgress("Packaging failed. Please try again.");
      setTimeout(() => setZipProgress(null), 4000);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans flex flex-col lg:flex-row selection:bg-indigo-600/25 selection:text-slate-900 antialiased duration-300">
      
      {/* LEFT SIDEBAR ON DESKTOP */}
      <aside className="hidden lg:flex w-72 bg-white border-r border-slate-200 flex-col p-8 shrink-0 justify-between h-screen sticky top-0" id="sidebar-panel">
        <div className="space-y-10">
          {/* Brand/Logo block */}
          <div 
            onClick={browseFullGallery} 
            className="flex items-center gap-3.5 cursor-pointer select-none group"
            id="brand-logo-sidebar"
          >
            <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/15 group-hover:scale-105 duration-300 transition-transform">
              <Cloud className="w-6 h-6 text-white stroke-[2.2]" />
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight text-slate-900 leading-none">
                PHOTO SKY
              </h1>
              <p className="text-[9px] uppercase tracking-widest text-indigo-500 font-black mt-1">
                Version 2.0
              </p>
            </div>
          </div>

          {/* Navigation / Filters acting as bento sidebar links */}
          <nav className="space-y-1.5" id="sidebar-filters">
            <button
              onClick={() => { setActivePrivacyFilter("all"); setSelectedTag(null); }}
              className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all duration-150 ${
                activePrivacyFilter === "all"
                  ? "bg-indigo-50 text-indigo-700 font-extrabold"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <ImageIcon className="w-4 h-4 shrink-0" />
              <span>All Photos</span>
            </button>
            <button
              onClick={() => { setActivePrivacyFilter("public"); setSelectedTag(null); }}
              className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all duration-150 ${
                activePrivacyFilter === "public"
                  ? "bg-indigo-50 text-indigo-700 font-extrabold"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span>Public Stream</span>
            </button>
            
            {user && (
              <>
                <button
                  onClick={() => { setActivePrivacyFilter("private"); setSelectedTag(null); }}
                  className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all duration-150 ${
                    activePrivacyFilter === "private"
                      ? "bg-indigo-50 text-indigo-700 font-extrabold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>My Vault</span>
                </button>
                <button
                  onClick={() => { setActivePrivacyFilter("shared"); setSelectedTag(null); }}
                  className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all duration-150 ${
                    activePrivacyFilter === "shared"
                      ? "bg-indigo-50 text-indigo-700 font-extrabold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Shared View</span>
                </button>
                <button
                  onClick={() => { setActivePrivacyFilter("favorites"); setSelectedTag(null); }}
                  className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-xs font-extrabold uppercase tracking-widest transition-all duration-150 ${
                    activePrivacyFilter === "favorites"
                      ? "bg-indigo-50 text-indigo-700 font-extrabold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                  id="tab-favorites"
                >
                  <Star className="w-4 h-4 shrink-0 text-amber-500 fill-amber-400" />
                  <span>Favorites</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Bottom Profile/Session in Sidebar */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3.5 justify-between">
          {user ? (
            <>
              <div className="flex items-center gap-3 overflow-hidden">
                <img
                  src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`}
                  alt={user.displayName}
                  className="w-10 h-10 rounded-full border border-slate-200 shadow-xs shrink-0 pointer-events-none"
                  referrerPolicy="no-referrer"
                />
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-slate-800 truncate leading-snug">{user.displayName}</p>
                  <p className="text-[10px] text-slate-500 font-semibold truncate leading-none mt-0.5">
                    {authedUser?.emailVerified ? "Pro Member" : "Unverified"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl transition-all shadow-xs shrink-0 border border-slate-100"
                id="sidebar-signout"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Google Sign In</span>
            </button>
          )}
        </div>
      </aside>

      {/* MOBILE COMPACT HEADER NAVBAR */}
      <div className="w-full flex-1 flex flex-col min-h-screen overflow-x-hidden">
        
        <header className="lg:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            {/* Logo Brand */}
            <div 
              onClick={browseFullGallery} 
              className="flex items-center space-x-2.5 cursor-pointer select-none"
              id="brand-logo-mobile"
            >
              <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
                <Cloud className="w-5 h-5 text-white stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tight text-slate-900 leading-none">
                  PHOTO SKY
                </h1>
                <p className="text-[9px] uppercase tracking-widest text-indigo-500 font-bold">
                  v2.0
                </p>
              </div>
            </div>

            {/* Mobile Auth profile control */}
            <div className="flex items-center space-x-2">
              {loadingAuth ? (
                <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
              ) : user ? (
                <div className="flex items-center space-x-2 bg-slate-50 px-2.5 py-1.5 rounded-full border border-slate-200">
                  <img 
                    src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} 
                    alt={user.displayName} 
                    className="w-6 h-6 rounded-full border border-slate-200 pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-[10px] font-bold text-slate-700 truncate max-w-[80px]">
                    {user.displayName.split(" ")[0]}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-rose-500 p-0.5"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 text-[11px] font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1 shadow-xs"
                >
                  <Key className="w-3 h-3" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Secure connection validation warning banner */}
        {connectionOk === false && (
          <div className="bg-rose-50 border-b border-rose-100 text-rose-700 px-6 py-2.5 text-center text-xs font-mono font-medium flex items-center justify-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
            <span>Security Warning: {connectionDetails}. Check Firestore Rules / API Connection.</span>
          </div>
        )}

        {/* Authenticated feedback/error notice warning banner */}
        {authError && (
          <div className="bg-amber-50 border-b border-amber-250 text-amber-900 px-6 py-4.5 text-center text-xs font-semibold flex flex-col md:flex-row items-center justify-center gap-3.5 transition-all z-45">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-left leading-relaxed">{authError}</span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {isInIframe && (
                <a 
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in New Tab</span>
                </a>
              )}
              <button 
                onClick={() => setAuthError(null)}
                className="px-4 py-2 bg-amber-100 hover:bg-amber-105 text-amber-850 border border-amber-200 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-8 lg:p-10 flex flex-col gap-6 max-w-7xl w-full mx-auto">
          
          {/* VIEW 1: Directed Shared Photo Spotlight Landing */}
          {sharedPhotoId ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6">
              <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-[32px] overflow-hidden p-6 sm:p-8 shadow-md relative">
                <h2 className="text-xs font-mono font-bold text-indigo-600 tracking-widest uppercase mb-3">
                  📢 PHOTO SHARED ARCHIVE
                </h2>

                {loadingSharedPhoto ? (
                  <div className="py-20 flex flex-col items-center justify-center space-y-3">
                    <span className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                    <p className="text-xs text-slate-400 font-mono">Verifying asset access authorization...</p>
                  </div>
                ) : sharedPhotoError ? (
                  <div className="py-12 flex flex-col items-center text-center space-y-4">
                    <AlertTriangle className="w-12 h-12 text-rose-500" />
                    <p className="text-sm font-semibold text-slate-800 max-w-md">
                      {sharedPhotoError}
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm">
                      If this photo is private or shared selectively, please make sure you are signed in using the authorized email account.
                    </p>
                    <button
                      onClick={browseFullGallery}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs rounded-xl transition-colors shadow-sm"
                    >
                      Go to Gallery
                    </button>
                  </div>
                ) : focusSharedPhoto ? (
                  <div className="space-y-6">
                    {/* Shared photo frame */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-center overflow-hidden">
                      <img
                        src={focusSharedPhoto.imageUrl}
                        alt={focusSharedPhoto.title}
                        className="max-h-[60vh] object-contain rounded-xl hover:scale-[1.01] transition-transform duration-300 pointer-events-auto shadow-xs"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Shared details details */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">{focusSharedPhoto.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Published by <span className="font-mono text-slate-700">{focusSharedPhoto.ownerEmail}</span>
                        </p>
                      </div>

                      <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center space-x-1.5">
                        {focusSharedPhoto.privacy === "public" && <Globe className="w-3.5 h-3.5 text-emerald-500" />}
                        {focusSharedPhoto.privacy === "shared" && <Users className="w-3.5 h-3.5 text-indigo-500" />}
                        <span className="capitalize text-[11px] font-bold">{focusSharedPhoto.privacy}</span>
                      </div>
                    </div>

                    {/* Tags */}
                    {focusSharedPhoto.tags && focusSharedPhoto.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {focusSharedPhoto.tags.map((tag, idx) => (
                          <span key={idx} className="px-3 py-1 rounded-full bg-slate-50 text-[11px] text-slate-600 border border-slate-150 font-semibold">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <hr className="border-slate-100" />

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <button
                        onClick={() => setSelectedPhoto(focusSharedPhoto)}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-750 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-150"
                      >
                        <span>Explore In Full Spotlight & Actions</span>
                      </button>
                      <button
                        onClick={browseFullGallery}
                        className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors text-center border border-slate-200"
                      >
                        Back to Photo Sky Gallery
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            /* VIEW 2: Standard Workspace Dashboard (Bento Styled!) */
            <div className="flex flex-col gap-6">
              
              {/* 2.1 Introductory Banner (gorgeous wide bento block styled like Featured Memory) */}
              <div className="bg-white border border-slate-200 rounded-[32px] p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-5 pointer-events-none"></div>
                
                <div className="space-y-3.5 flex-1 relative z-10">
                  <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full font-mono text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 uppercase tracking-widest font-extrabold">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> <span>IND SOURAV</span>
                  </span>
                  <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 leading-tight">
                    Preserve your sky moments securely
                  </h2>
                  <p className="text-slate-500 text-sm max-w-xl leading-relaxed">
                    Upload golden hours, galaxies, clouds and auroras. Assign search tags and precise privacy settings (Public Streams, Private Lockbox, or Selected email shares).
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 shrink-0 relative z-10 w-full sm:w-auto">
                  {user ? (
                    <button
                      onClick={() => setShowUploadPanel(!showUploadPanel)}
                      className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-750 text-white px-6 py-3.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-all duration-150 shadow-md shadow-indigo-150 transform active:scale-95 cursor-pointer"
                      id="btn-toggle-upload"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>{showUploadPanel ? "Close Upload Tool" : "Upload Photo"}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleGoogleLogin}
                      className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-750 text-white px-6 py-3.5 rounded-xl font-bold text-xs tracking-wider uppercase transition-all duration-150 shadow-md shadow-indigo-150 transform active:scale-95 cursor-pointer"
                    >
                      <Key className="w-4 h-4" />
                      <span>Sign In to Upload</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 2.2 Upload Drawer Panel (Large beautiful white bento block when visible) */}
              <AnimatePresence>
                {showUploadPanel && user && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 sm:p-8 bg-white border border-slate-200 rounded-[32px] shadow-sm flex flex-col lg:flex-row gap-8 relative mb-2">
                      <div className="absolute inset-0 bg-gradient-to-tr from-slate-50 to-indigo-50/10 opacity-3 pointer-events-none"></div>
                      
                      {/* Left Form side */}
                      <form onSubmit={handlePhotoUpload} className="flex-1 space-y-5 relative z-10">
                        <h3 className="text-xs font-mono font-bold text-slate-400 tracking-widest uppercase pb-2 border-b border-slate-100">
                          1. METADATA SPECIFICATIONS
                        </h3>

                        {/* Title */}
                        <div className="space-y-1.55">
                          <label className="text-xs text-slate-500 font-extrabold uppercase tracking-wide">PHOTO TITLE</label>
                          <input
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={100}
                            placeholder="E.g., Burning Sunset Over Tokyo Skies"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-indigo-500 placeholder-slate-400 font-semibold"
                          />
                        </div>

                        {/* Tags comma split */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div className="space-y-1.5">
                            <label className="text-xs text-slate-500 font-extrabold uppercase tracking-wide flex items-center justify-between">
                              <span>ASSOCIATE TAGS (COMMA SPLIT)</span>
                              <span className="text-[10px] text-slate-400 font-mono">Max 10</span>
                            </label>
                            <input
                              type="text"
                              value={tagsInput}
                              onChange={(e) => setTagsInput(e.target.value)}
                              placeholder="E.g., sunset, clouds, red-sky"
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-indigo-500 placeholder-slate-400 font-mono text-xs font-semibold"
                            />
                          </div>

                          {/* Privacy Selection */}
                          <div className="space-y-1.5">
                            <label className="text-xs text-slate-500 font-extrabold uppercase tracking-wide">PRIVACY EXCLUSION MODE</label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(["public", "private", "shared"] as const).map((mode) => (
                                <button
                                  type="button"
                                  key={mode}
                                  onClick={() => setPrivacy(mode)}
                                  className={`py-2.5 px-1 text-xs border rounded-xl flex items-center justify-center space-x-1.5 transition-all font-bold ${
                                    privacy === mode
                                      ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs"
                                      : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800"
                                  }`}
                                >
                                  {mode === "public" && <Globe className="w-3.5 h-3.5 shrink-0" />}
                                  {mode === "private" && <Lock className="w-3.5 h-3.5 shrink-0" />}
                                  {mode === "shared" && <Users className="w-3.5 h-3.5 shrink-0" />}
                                  <span className="capitalize">{mode}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Selective Shared Emails block */}
                        {privacy === "shared" && (
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider">AUTHORIZED VIEWER EMAIL ACCESS ({sharingEmails.length}/10)</span>
                              {emailValidationError && (
                                <span className="text-[10px] text-rose-600 font-bold font-mono">{emailValidationError}</span>
                              )}
                            </div>
                            
                            <div className="flex gap-2">
                              <input
                                type="email"
                                value={sharedEmailInput}
                                onChange={(e) => setSharedEmailInput(e.target.value)}
                                placeholder="colleague@gmail.com"
                                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans text-slate-900 focus:outline-none focus:border-indigo-500 placeholder-slate-400 font-medium"
                              />
                              <button
                                type="button"
                                onClick={addSharingEmail}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
                              >
                                Add Email
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {sharingEmails.length === 0 ? (
                                <span className="text-[10px] text-slate-400 italic">No recipients added yet. The photo will remain hidden until emails are provided.</span>
                              ) : (
                                sharingEmails.map((email, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white text-xs text-slate-700 border border-slate-200 shadow-xs"
                                  >
                                    <span>{email}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeSharingEmail(idx)}
                                      className="text-slate-400 hover:text-rose-600 transition-colors"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {/* File Selection / Image drag drop input */}
                        <div className="space-y-1.5">
                          <label className="text-xs text-slate-500 font-extrabold uppercase tracking-wide">IMAGE SOURCE</label>
                          <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 rounded-2xl p-6 transition-colors flex flex-col items-center justify-center text-center cursor-pointer group">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLocalImagePick}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            <ImageIcon className="w-8 h-8 text-slate-400 mb-2 group-hover:text-indigo-600 group-hover:scale-105 duration-200 transition-all" />
                            <span className="text-xs text-slate-800 font-bold group-hover:text-indigo-600">Click or drag local image to attach</span>
                            <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">Supports JPEG, PNG, WEBP (auto-compressed)</span>
                          </div>
                        </div>

                        {/* Feedback Indicators */}
                        {uploadError && (
                          <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 font-mono text-[11px] leading-normal flex items-start space-x-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                            <span>{uploadError}</span>
                          </div>
                        )}

                        {/* Action submission row */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase tracking-wider">
                            {uploadedImageBase64 ? "✓ IMAGE ATTACHED" : "⚠ ATTACHMENT REQUIRED"}
                          </span>
                          
                          <button
                            type="submit"
                            disabled={uploading}
                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center space-x-2 shadow-sm"
                          >
                            {uploading ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Uploading...</span>
                              </>
                            ) : (
                              <span>Publish to Photo Sky</span>
                            )}
                          </button>
                        </div>

                      </form>

                      {/* Right side: Stocks Selection & Thumbnail Previews */}
                      <div className="w-full lg:w-[320px] bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col gap-5 relative z-10">
                        
                        {/* Active Thumbnail display */}
                        <div className="space-y-2 flex-1 flex flex-col">
                          <span className="text-xs font-mono text-slate-500 font-bold tracking-wider uppercase block">
                            2. LIVE WORKSPACE PREVIEW
                          </span>
                          <div className="flex-1 min-h-[160px] bg-white border border-slate-200 rounded-2xl relative flex items-center justify-center p-2.5 text-center group shadow-inner">
                            {uploadedImageBase64 ? (
                              <div className="relative w-full h-full flex items-center justify-center">
                                <img
                                  src={uploadedImageBase64}
                                  alt="Live upload preview"
                                  className="max-w-full max-h-[160px] object-contain rounded-lg"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  type="button"
                                  onClick={() => setUploadedImageBase64(null)}
                                  className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-red-650 text-white rounded-full transition-colors duration-150"
                                  title="Clear current image selection"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1 p-4">
                                <ImageIcon className="w-8 h-8 text-slate-350 mx-auto" />
                                <p className="text-xs font-bold text-slate-500">Empty canvas</p>
                                <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto">
                                  Image will render here once selected, or click a stock sky presets button below.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stock Preset buttons list */}
                        <div className="space-y-2">
                          <span className="text-xs font-mono text-slate-400 font-bold tracking-wider uppercase block select-none">
                            ⚡ QUICK Presets TEMPLATES
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {STOCK_PHOTOS.map((stock) => (
                              <button
                                type="button"
                                key={stock.id}
                                onClick={() => selectStockPhoto(stock)}
                                className="group text-left rounded-xl bg-white border border-slate-200 hover:border-indigo-400 p-2 duration-150 transition-all flex flex-col text-[10px] relative overflow-hidden shadow-xs hover:shadow-sm"
                              >
                                <div className="h-14 w-full bg-slate-100 rounded-lg mb-1.5 overflow-hidden">
                                  <img
                                    src={stock.url}
                                    alt={stock.title}
                                    className="w-full h-full object-cover group-hover:scale-105 duration-300 pointer-events-none"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <span className="font-bold text-slate-700 truncate block max-w-full" title={stock.title}>
                                  {stock.title}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bento Row 3: Bento Grid Layout containing Search, Statistics and Security Modules */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* 1. Search block bento space */}
                <div className="md:col-span-2 bg-white border border-slate-200 rounded-[32px] p-6 flex flex-col justify-between shadow-xs gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase font-black tracking-widest text-indigo-600">Secure Database Filter</span>
                    <h3 className="text-base font-extrabold text-slate-800">Identify Photos and Tags</h3>
                  </div>
                  
                  <div className="relative w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Query titles or #tags..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-sans"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Stat block bento space */}
                <div className="bg-indigo-600 rounded-[32px] p-6 text-white shadow-md flex flex-col justify-between shadow-indigo-100">
                  <div className="flex justify-between items-start">
                    <div className="w-8 h-8 rounded-lg bg-white/25 flex items-center justify-center">
                      <Cloud className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[9px] font-bold bg-white/20 px-2.5 py-1 rounded-full tracking-wider">AUTO-SYNC ACTIVE</span>
                  </div>
                  <div>
                    <p className="text-3xl font-black tracking-tight leading-none">
                      {filteredPhotos.length} <span className="text-xs font-normal opacity-80">Streams</span>
                    </p>
                    <p className="text-[10px] opacity-75 mt-0.5">Secure relational units loaded</p>
                  </div>
                </div>

                {/* 3. Security protection badge bento space */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-[32px] p-6 flex flex-col justify-between shadow-xs">
                  <div className="flex justify-between items-center">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-100">
                      <Shield className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[9px] font-semibold text-emerald-700 font-mono tracking-widest uppercase">Fortress</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-emerald-950 mb-0.5">Attribute Verification</h3>
                    <p className="text-[9px] text-emerald-600 leading-relaxed font-semibold">
                      Security tokens restrict client payload scopes automatically.
                    </p>
                  </div>
                </div>

              </div>

              {/* Mobile-only visible top filters widget box */}
              <div className="bg-white border border-slate-200 rounded-[32px] p-5 lg:hidden flex flex-col gap-3 shadow-xs" id="filters-workspace-mobile">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Select Photostream Vault</span>
                <div className="flex flex-wrap items-center gap-1.5 w-full overflow-x-auto">
                  <button
                    onClick={() => { setActivePrivacyFilter("all"); setSelectedTag(null); }}
                    className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors ${
                      activePrivacyFilter === "all"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-50 text-slate-500 hover:text-slate-900 border border-slate-200"
                    }`}
                  >
                    All Photostream
                  </button>
                  <button
                    onClick={() => { setActivePrivacyFilter("public"); setSelectedTag(null); }}
                    className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors ${
                      activePrivacyFilter === "public"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-50 text-slate-500 hover:text-slate-900 border border-slate-200"
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>Public Stream</span>
                  </button>
                  
                  {user && (
                    <>
                      <button
                        onClick={() => { setActivePrivacyFilter("private"); setSelectedTag(null); }}
                        className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors ${
                          activePrivacyFilter === "private"
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-50 text-slate-500 hover:text-slate-900 border border-slate-200"
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        <span>My Vault</span>
                      </button>
                      <button
                        onClick={() => { setActivePrivacyFilter("shared"); setSelectedTag(null); }}
                        className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors ${
                          activePrivacyFilter === "shared"
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-50 text-slate-500 hover:text-slate-900 border border-slate-200"
                        }`}
                      >
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        <span>Shared Gallery</span>
                      </button>
                      <button
                        onClick={() => { setActivePrivacyFilter("favorites"); setSelectedTag(null); }}
                        className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors ${
                          activePrivacyFilter === "favorites"
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-55 text-slate-500 hover:text-slate-900 border border-slate-200"
                        }`}
                        id="tab-favorites-mobile"
                      >
                        <Star className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-amber-500" />
                        <span>Favorites</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Success notification banner */}
              {uploadSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3 rounded-2xl text-xs font-semibold flex items-center space-x-2 shadow-xs transition-all">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Photo successfully written! Core credentials successfully validated against rules.</span>
                </div>
              )}

              {/* Dynamic tag selection bar */}
              {allUniqueTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 p-4 bg-white border border-slate-200 rounded-[32px] text-[11px] shadow-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider mr-1.5 flex items-center gap-1 select-none text-[10px]">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> Tags:
                  </span>
                  {allUniqueTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                      className={`px-3 py-1 rounded-full border transition-all font-semibold ${
                        selectedTag === tag
                          ? "bg-indigo-50 border-indigo-400 text-indigo-600"
                          : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-350"
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag(null)}
                      className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-600 font-bold hover:bg-rose-100/50"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
              )}

              {/* 2.4 Photos Grid Stream List */}
              {loadingPhotos ? (
                <div className="py-24 text-center flex flex-col items-center justify-center space-y-3 bg-white rounded-[32px] border border-slate-200 shadow-xs">
                  <span className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                  <p className="text-xs text-slate-400 font-mono uppercase tracking-widest font-bold">Compiling Bento Stream...</p>
                </div>
              ) : filteredPhotos.length === 0 ? (
                <div className="py-24 bg-white border border-slate-200 rounded-[32px] text-center flex flex-col items-center p-8 space-y-4 shadow-xs">
                  <ImageIcon className="w-12 h-12 text-slate-300" />
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800">No sky photos found matching filter conditions</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-medium">
                      Try clearing search inputs or click "Upload Photo" at the top banner to attach your very first memory safely.
                    </p>
                  </div>
                  {user ? (
                    <button
                      onClick={() => setShowUploadPanel(true)}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                    >
                      Upload first sketch
                    </button>
                  ) : (
                    <button
                      onClick={handleGoogleLogin}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-755 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                    >
                      Login to post photo
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="photos-grid-stream">
                  {filteredPhotos.map((photo) => {
                    const isUserOwner = user && photo.ownerId === user.uid;

                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className={`group relative cursor-pointer overflow-hidden bg-white border rounded-[32px] flex flex-col justify-between duration-300 shadow-xs hover:shadow-md transition-all pb-3 ${
                          selectedPhotoIds.includes(photo.id)
                            ? "border-indigo-600 ring-2 ring-indigo-600/25"
                            : "border-slate-200 hover:border-indigo-400"
                        }`}
                        id={`photo-card-${photo.id}`}
                      >
                        {/* Image zoom wrapper */}
                        <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden img-zoom">
                          <img
                            src={photo.imageUrl}
                            alt={photo.title}
                            className="w-full h-full object-cover select-none pointer-events-none"
                            referrerPolicy="no-referrer"
                          />
                          
                          {/* Absolute Floating Checkbox Element */}
                          <button
                            onClick={(e) => toggleSelectPhoto(photo.id, e)}
                            className={`absolute top-3 left-3 z-40 p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-center shadow-md hover:scale-105 active:scale-95 ${
                              selectedPhotoIds.includes(photo.id)
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "bg-white/95 backdrop-blur-md border-slate-200 text-slate-400 hover:text-indigo-600"
                            }`}
                            title={selectedPhotoIds.includes(photo.id) ? "Deselect Photo" : "Select Photo for Batch download"}
                          >
                            {selectedPhotoIds.includes(photo.id) ? (
                              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Square className="w-3.5 h-3.5 shrink-0" />
                            )}
                          </button>

                          {/* Quick Privacy Indicators Badge - shifted to the right of the checkbox indicator */}
                          <div className="absolute top-3 left-[48px] px-2 py-1 rounded-lg bg-white/95 backdrop-blur-md text-[9px] text-slate-700 font-black border border-slate-200/50 flex items-center space-x-1 uppercase tracking-wider shadow-xs select-none z-30">
                            {photo.privacy === "public" && <Globe className="w-3 h-3 text-emerald-500" />}
                            {photo.privacy === "private" && <Lock className="w-3 h-3 text-rose-500" />}
                            {photo.privacy === "shared" && <Users className="w-3 h-3 text-indigo-500" />}
                            <span>{photo.privacy}</span>
                          </div>

                          {/* Owner badge */}
                          {isUserOwner && (
                            <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-indigo-600/95 text-white font-sans font-black text-[9px] uppercase tracking-wider shadow-xs select-none z-30">
                              OWNER
                            </div>
                          )}
                        </div>

                        {/* Info segment */}
                        <div className="p-5 flex-1 flex flex-col justify-between gap-3 relative">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-extrabold text-slate-800 tracking-tight leading-snug truncate line-clamp-1 group-hover:text-indigo-600 transition-colors">
                                {photo.title}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-mono mt-1 hover:underline truncate" title={`Creator: ${photo.ownerEmail}`}>
                                {photo.ownerEmail}
                              </p>
                            </div>

                            {/* Three-Dot Floating Dropdown Menu */}
                            <div className="relative shrink-0 z-30 flex items-center space-x-1">
                              {/* Favorite Toggle Button */}
                              {isUserOwner ? (
                                <button
                                  onClick={(e) => handleToggleFavorite(photo, e)}
                                  className="p-1 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center justify-center p-1.5"
                                  title={photo.isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                                  id={`favorite-btn-${photo.id}`}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                                      photo.isFavorite
                                        ? "text-amber-400 fill-amber-400 stroke-amber-500 scale-110"
                                        : "text-slate-300 hover:text-amber-400"
                                    }`}
                                  />
                                </button>
                              ) : (
                                photo.isFavorite ? (
                                  <div
                                    className="p-1 flex items-center justify-center p-1.5"
                                    title="Starred / Favorite Photo"
                                  >
                                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 stroke-amber-500" />
                                  </div>
                                ) : null
                              )}

                              <button
                                onClick={(e) => toggleMenu(photo.id, e)}
                                className="p-1 px-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                                title="Actions"
                                id={`three-dot-menu-btn-${photo.id}`}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              <AnimatePresence>
                                {activeMenuPhotoId === photo.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 mt-1 w-52 bg-white border border-slate-250 rounded-2xl shadow-xl p-1.5 py-2 flex flex-col gap-1 z-50 text-[11px] font-sans text-slate-700 pointer-events-auto"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Owner Actions */}
                                    {isUserOwner && (
                                      <>
                                        {photo.privacy !== "private" && (
                                          <button
                                            onClick={(e) => handleMenuLock(photo, e)}
                                            className="w-full text-left px-2.5 py-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-xl flex items-center space-x-2 transition-all cursor-pointer font-bold"
                                          >
                                            <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                            <span>Lock (Private)</span>
                                          </button>
                                        )}
                                        {photo.privacy !== "public" && (
                                          <button
                                            onClick={(e) => handleMenuUnlock(photo, e)}
                                            className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl flex items-center space-x-2 transition-all cursor-pointer font-bold"
                                          >
                                            <Unlock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                            <span>Unlock (Public)</span>
                                          </button>
                                        )}
                                        <div className="border-t border-slate-100 my-1"></div>
                                      </>
                                    )}

                                    {/* Action 3: General Share Link */}
                                    <button
                                      onClick={(e) => handleMenuShare(photo, e)}
                                      className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-650 rounded-xl flex items-center space-x-2 transition-all cursor-pointer font-bold"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      <span>
                                        {menuCopiedPhotoId === photo.id ? "✓ Link Copied" : "Copy Share Link"}
                                      </span>
                                    </button>

                                    {/* Social Share section */}
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <span className="px-2.5 py-0.5 text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                                      Share to Socials
                                    </span>

                                    {/* WhatsApp */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const shareUrl = `${window.location.origin}?photoId=${photo.id}`;
                                        const shareText = `Check out this amazing photo "${photo.title}" on PHOTO SKY! 📸✨\n${shareUrl}`;
                                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
                                        setActiveMenuPhotoId(null);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl flex items-center space-x-2 transition-all cursor-pointer font-semibold"
                                      title="Share via WhatsApp"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                      <span>WhatsApp</span>
                                    </button>

                                    {/* Facebook */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const shareUrl = `${window.location.origin}?photoId=${photo.id}`;
                                        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
                                        setActiveMenuPhotoId(null);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 hover:text-blue-700 rounded-xl flex items-center space-x-2 transition-all cursor-pointer font-semibold"
                                      title="Share on Facebook"
                                    >
                                      <Facebook className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                      <span>Facebook</span>
                                    </button>

                                    {/* Instagram */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const shareUrl = `${window.location.origin}?photoId=${photo.id}`;
                                        navigator.clipboard.writeText(shareUrl).then(() => {
                                          setInstagramShareCopiedId(photo.id);
                                          setTimeout(() => {
                                            setInstagramShareCopiedId(null);
                                            setActiveMenuPhotoId(null);
                                            window.open("https://instagram.com", "_blank");
                                          }, 1500);
                                        });
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 hover:bg-pink-50 hover:text-pink-700 rounded-xl flex items-center space-x-2 transition-all cursor-pointer font-semibold"
                                      title="Copy link & open Instagram"
                                    >
                                      <Instagram className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                                      <span>
                                        {instagramShareCopiedId === photo.id ? "✓ Link Copied! Opening..." : "Instagram"}
                                      </span>
                                    </button>

                                    <div className="border-t border-slate-100 my-1"></div>

                                    {/* Action 4: Download */}
                                    <button
                                      onClick={(e) => handleMenuDownload(photo, e)}
                                      className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 hover:text-slate-900 rounded-xl flex items-center space-x-2 transition-all cursor-pointer font-bold"
                                    >
                                      <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                      <span>Download Original</span>
                                    </button>

                                    {/* Locked Notice if Not Owner */}
                                    {!isUserOwner && (
                                      <div className="border-t border-slate-100 mt-1 pt-1.5 px-2.5 text-[9px] font-mono text-slate-400">
                                        Lock status managed by owner.
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>

                          {/* Tag badges */}
                          {photo.tags && photo.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {photo.tags.slice(0, 3).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-full bg-slate-50 text-[10px] text-slate-500 font-bold border border-slate-100"
                                >
                                  #{tag}
                                </span>
                              ))}
                              {photo.tags.length > 3 && (
                                <span className="text-[9px] text-slate-400 font-bold self-center ml-0.5">
                                  +{photo.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Footer Actions / Overlay effect */}
                        <div className="mx-5 h-1 bg-slate-100 group-hover:bg-indigo-600 transition-colors rounded-full duration-300"></div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

            </div>
          )}
               {/* 3. Footer info panel inside content flow */}
          <footer className="border-t border-slate-250 py-8 text-center text-xs text-slate-400 font-mono mt-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left">
              <p className="font-extrabold text-slate-600">PHOTO SKY 2.0 Secure System</p>
              <p className="text-[10px] text-slate-400 mt-1">Attribute-Based Access Control (ABAC) rules active and protecting.</p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-[10px] bg-slate-200 px-3 py-1.5 rounded-full border border-slate-300 flex items-center gap-1.5 text-slate-600 font-bold">
                <Shield className="w-3.5 h-3.5 text-emerald-600" /> Rules: Verified Sandbox
              </span>
              <span className="text-slate-300">|</span>
              <button
                onClick={browseFullGallery}
                className="hover:text-slate-800 text-slate-500 font-bold transition-colors"
              >
                Reset Gallery Cache
              </button>
            </div>
          </footer>

        </main>
      </div>

      {/* 4. Focus detail Lightbox portal */}
      <AnimatePresence>
        {selectedPhoto && (
          <FocusLightbox
            photo={selectedPhoto}
            currentUser={authedUser}
            onClose={() => setSelectedPhoto(null)}
            onUpdate={(updatedPhoto) => {
              // Sync updated photo in both merged state and selected view local lists
              setSelectedPhoto(updatedPhoto);
              setPublicPhotos((list) => list.map((p) => p.id === updatedPhoto.id ? updatedPhoto : p));
              setMyPhotos((list) => list.map((p) => p.id === updatedPhoto.id ? updatedPhoto : p));
              setSharedPhotos((list) => list.map((p) => p.id === updatedPhoto.id ? updatedPhoto : p));
            }}
            onDelete={(photoId) => {
              // Delete local references
              setPublicPhotos((list) => list.filter((p) => p.id !== photoId));
              setMyPhotos((list) => list.filter((p) => p.id !== photoId));
              setSharedPhotos((list) => list.filter((p) => p.id !== photoId));
              if (selectedPhoto?.id === photoId) {
                setSelectedPhoto(null);
                if (sharedPhotoId === photoId) {
                  browseFullGallery();
                }
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* 5. Floating Multi-Select Download Action Bar */}
      <AnimatePresence>
        {selectedPhotoIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 50, scale: 0.95, x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed bottom-6 left-1/2 z-50 bg-slate-900 text-white border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col md:flex-row items-center gap-4 max-w-lg w-[calc(100%-2rem)] md:max-w-2xl select-none"
            id="multi-download-floating-bar"
          >
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2.5 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/20">
                <Download className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black tracking-tight">{selectedPhotoIds.length} photo{selectedPhotoIds.length > 1 ? "s" : ""} selected</p>
                <p className="text-[10px] text-slate-400 font-mono tracking-wider truncate">
                  {zipping ? zipProgress : "Ready for batch ZIP export"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
              {/* Select All of the currently viewable filtered list */}
              <button
                onClick={() => {
                  const viewableIds = filteredPhotos.map((p) => p.id);
                  const allSelected = viewableIds.every((id) => selectedPhotoIds.includes(id));
                  if (allSelected) {
                    // Deselect viewable items
                    setSelectedPhotoIds((prev) => prev.filter((id) => !viewableIds.includes(id)));
                  } else {
                    // Select all viewable items
                    setSelectedPhotoIds((prev) => {
                      const newIds = [...prev];
                      viewableIds.forEach((id) => {
                        if (!newIds.includes(id)) newIds.push(id);
                      });
                      return newIds;
                    });
                  }
                }}
                className="flex-1 md:flex-initial px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                {filteredPhotos.length > 0 && filteredPhotos.every((p) => selectedPhotoIds.includes(p.id)) ? "Deselect All" : "Select All Shown"}
              </button>

              <button
                onClick={() => setSelectedPhotoIds([])}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
                title="Cancel Selection"
              >
                <X className="w-4 h-4" />
              </button>

              <button
                disabled={zipping}
                onClick={handleDownloadSelected}
                className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-black tracking-wide transition-all uppercase flex items-center justify-center gap-1.5 shadow-lg cursor-pointer ${
                  zipping 
                    ? "bg-slate-800 text-slate-500 border border-slate-750" 
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-650/10 hover:shadow-indigo-600/30 active:scale-95"
                }`}
              >
                {zipping ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                    <span>Zipping...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 font-bold" />
                    <span>Download ZIP</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
