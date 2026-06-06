import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Globe, Lock, Users, Copy, Check, Trash2, Edit2, Save, Plus, Trash, Download 
} from "lucide-react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Photo, OperationType } from "../types";
import { db, handleFirestoreError } from "../lib/firebase";

interface FocusLightboxProps {
  photo: Photo;
  currentUser: { uid: string; email: string } | null;
  onClose: () => void;
  onUpdate: (updatedPhoto: Photo) => void;
  onDelete: (photoId: string) => void;
}

export default function FocusLightbox({
  photo,
  currentUser,
  onClose,
  onUpdate,
  onDelete
}: FocusLightboxProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(photo.title);
  const [privacy, setPrivacy] = useState(photo.privacy);
  const [sharedEmail, setSharedEmail] = useState("");
  const [sharedEmailsList, setSharedEmailsList] = useState<string[]>(photo.sharedWith || []);
  const [newTag, setNewTag] = useState("");
  const [tagsList, setTagsList] = useState<string[]>(photo.tags || []);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isOwner = currentUser && photo.ownerId === currentUser.uid;

  const handleCopyLink = () => {
    const rawLink = `${window.location.origin}?photoId=${photo.id}`;
    navigator.clipboard.writeText(rawLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = async () => {
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

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = sharedEmail.trim().toLowerCase();
    if (!cleanEmail) return;
    if (!cleanEmail.includes("@")) {
      setActionError("Please enter a valid email address.");
      return;
    }
    if (sharedEmailsList.includes(cleanEmail)) {
      setActionError("Email is already in the sharing list.");
      return;
    }
    if (sharedEmailsList.length >= 10) {
      setActionError("Max 10 recipient emails are authorized.");
      return;
    }
    setSharedEmailsList([...sharedEmailsList, cleanEmail]);
    setSharedEmail("");
    setActionError(null);
  };

  const handleRemoveEmail = (idx: number) => {
    setSharedEmailsList(sharedEmailsList.filter((_, i) => i !== idx));
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = newTag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanTag) return;
    if (tagsList.includes(cleanTag)) {
      setActionError("Tag already exists.");
      return;
    }
    if (tagsList.length >= 10) {
      setActionError("Max 10 tags are authorized.");
      return;
    }
    setTagsList([...tagsList, cleanTag]);
    setNewTag("");
    setActionError(null);
  };

  const handleRemoveTag = (idx: number) => {
    setTagsList(tagsList.filter((_, i) => i !== idx));
  };

  const handleSaveChanges = async () => {
    if (!isOwner) return;
    setSaving(true);
    setActionError(null);

    const docPath = `photos/${photo.id}`;
    try {
      const docRef = doc(db, "photos", photo.id);
      const updatedFields = {
        title: title.trim(),
        privacy,
        tags: tagsList,
        sharedWith: privacy === "shared" ? sharedEmailsList : [],
        updatedAt: new Date() // Will be updated as server date locally
      };

      await updateDoc(docRef, updatedFields);

      // Local success propagate
      onUpdate({
        ...photo,
        ...updatedFields,
        updatedAt: updatedFields.updatedAt
      });
      setIsEditing(false);
    } catch (err) {
      setActionError("Update Rejected: Check fields size & permissions.");
      try {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      } catch (logErr) {
        // Logged via custom telemetry handled centrally
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!isOwner) return;
    if (!window.confirm("Are you sure you want to delete this photo forever?")) return;
    
    setSaving(true);
    setActionError(null);
    const docPath = `photos/${photo.id}`;

    try {
      const docRef = doc(db, "photos", photo.id);
      await deleteDoc(docRef);
      onDelete(photo.id);
      onClose();
    } catch (err) {
      setActionError("Delete Denied: Insufficient Permissions.");
      try {
        handleFirestoreError(err, OperationType.DELETE, docPath);
      } catch (logErr) {}
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
      id="lightbox-container"
    >
      <motion.div
        initial={{ scale: 0.95, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 15 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        className="relative w-full max-w-5xl overflow-hidden bg-white border border-slate-200 rounded-[32px] shadow-2xl flex flex-col md:flex-row max-h-[90vh]"
        id="lightbox-card"
      >
        {/* Absolute Close Top Buttons */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2.5 z-10 bg-white/90 backdrop-blur-md border border-slate-200 rounded-full hover:bg-slate-50 text-slate-550 hover:text-slate-800 transition-all shadow-xs"
          id="btn-close-lightbox"
          aria-label="Close lightbox"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Side: Spotlight Media Frame */}
        <div className="flex-1 min-h-[300px] md:min-h-0 bg-slate-50 flex items-center justify-center p-6 relative group overflow-hidden md:border-r border-slate-150">
          <img
            src={photo.imageUrl}
            alt={photo.title}
            className="max-w-full max-h-[50vh] md:max-h-[75vh] object-contain rounded-2xl shadow-md pointer-events-auto select-none"
            referrerPolicy="no-referrer"
            id="lightbox-image"
          />
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center space-x-2 border border-slate-200 shadow-xs text-xs text-slate-700 select-none font-bold">
            {photo.privacy === "public" && <Globe className="w-3.5 h-3.5 text-emerald-500" />}
            {photo.privacy === "private" && <Lock className="w-3.5 h-3.5 text-rose-500" />}
            {photo.privacy === "shared" && <Users className="w-3.5 h-3.5 text-indigo-500" />}
            <span className="capitalize">{photo.privacy} Archive</span>
          </div>
        </div>

        {/* Right Side: Informational Context Panel */}
        <div className="w-full md:w-[380px] p-6 border-t md:border-t-0 md:border-l border-slate-200 flex flex-col justify-between bg-white overflow-y-auto max-h-[40vh] md:max-h-none">
          <div>
            {/* Title / Action Header */}
            <div className="mb-4">
              {isEditing ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-slate-400 tracking-wider">EDIT PHOTO TITLE</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-900 placeholder-slate-400 font-bold"
                    placeholder="Provide a sky title"
                  />
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-sans font-black text-slate-900 tracking-tight leading-snug">
                    {photo.title}
                  </h3>
                  {isOwner && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1.5 text-slate-400 hover:text-indigo-650 hover:bg-slate-50 rounded-lg transition-all"
                      id="btn-edit-title"
                      title="Edit photo metadata"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              
              <div className="mt-2 flex items-center space-x-2 text-xs text-slate-500">
                <span className="font-mono text-[9px] bg-indigo-50 text-indigo-700 font-extrabold px-2 py-0.5 rounded">Owner</span>
                <span className="truncate max-w-[200px] font-medium" title={photo.ownerEmail}>{photo.ownerEmail}</span>
              </div>
            </div>

            <hr className="border-slate-100 my-4" />

            {/* Privacy Configurations */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono font-extrabold text-slate-400 tracking-widest">PRIVACY EXCLUSION DESIGNATION</span>
              
              {isEditing ? (
                <div className="grid grid-cols-3 gap-2">
                  {(["public", "private", "shared"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPrivacy(mode)}
                      className={`py-2 px-1 text-xs border rounded-xl flex flex-col items-center justify-center transition-all font-bold ${
                        privacy === mode
                          ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs"
                          : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-800"
                      }`}
                    >
                      {mode === "public" && <Globe className="w-4 h-4 mb-1" />}
                      {mode === "private" && <Lock className="w-4 h-4 mb-1" />}
                      {mode === "shared" && <Users className="w-4 h-4 mb-1" />}
                      <span className="capitalize">{mode}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center space-x-2.5 bg-slate-50 px-3.5 py-3 border border-slate-200 rounded-2xl">
                  {photo.privacy === "public" && (
                    <>
                      <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">Public Stream</p>
                        <p className="text-[10px] text-slate-500 leading-normal font-medium mt-0.5">Visible to all registered/unregistered guests.</p>
                      </div>
                    </>
                  )}
                  {photo.privacy === "private" && (
                    <>
                      <Lock className="w-4 h-4 text-rose-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">My Secure Vault</p>
                        <p className="text-[10px] text-slate-500 leading-normal font-medium mt-0.5">Encrypted from standard catalog scans.</p>
                      </div>
                    </>
                  )}
                  {photo.privacy === "shared" && (
                    <>
                      <Users className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">Selective Vault Share</p>
                        <p className="text-[10px] text-slate-500 leading-normal font-medium mt-0.5">Restricted to specified authorization parameters.</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Shared Email list if shared mode */}
            {privacy === "shared" && (
              <div className="mt-4 space-y-2.5">
                <span className="text-[10px] font-mono font-extrabold text-slate-400 tracking-wider">AUTHORIZED RECIPIENT MAILS ({sharedEmailsList.length}/10)</span>
                {isEditing && (
                  <form onSubmit={handleAddEmail} className="flex gap-2">
                    <input
                      type="email"
                      value={sharedEmail}
                      onChange={(e) => setSharedEmail(e.target.value)}
                      placeholder="friend@g.co"
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 text-slate-900"
                    />
                    <button
                      type="submit"
                      className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                )}
                <div className="max-h-[100px] overflow-y-auto space-y-1.5">
                  {sharedEmailsList.length === 0 ? (
                    <p className="text-[10px] text-slate-405 italic">No emails authorized yet.</p>
                  ) : (
                    sharedEmailsList.map((email, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-xl text-xs text-slate-700 border border-slate-150"
                      >
                        <span className="truncate font-mono text-[11px] font-semibold">{email}</span>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(idx)}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tags Zone */}
            <div className="mt-4 space-y-2">
              <span className="text-[10px] font-mono font-extrabold text-slate-400 tracking-widest">METADATA TAG LABELS</span>
              {isEditing ? (
                <div className="space-y-2">
                  <form onSubmit={handleAddTag} className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="Add tag"
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 text-slate-900"
                    />
                    <button
                      type="submit"
                      className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto pt-1">
                    {tagsList.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-50 text-[11px] text-slate-600 border border-slate-200 hover:bg-rose-50 hover:border-rose-350 duration-150 font-bold"
                      >
                        <span>#{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(idx)}
                          className="text-slate-450 hover:text-rose-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {photo.tags && photo.tags.length > 0 ? (
                    photo.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] text-slate-600 tracking-wide font-extrabold"
                      >
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">No tags associated.</span>
                  )}
                </div>
              )}
            </div>

            {/* General Action Telemetry / Error Indicator */}
            {actionError && (
              <p className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-2xl font-mono text-[10px] text-rose-700 leading-normal font-semibold">
                {actionError}
              </p>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 space-y-2.5">
            {/* Save / Cancel buttons if editing */}
            {isEditing ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    // Reset fields
                    setTitle(photo.title);
                    setPrivacy(photo.privacy);
                    setTagsList(photo.tags || []);
                    setSharedEmailsList(photo.sharedWith || []);
                    setActionError(null);
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold tracking-wide transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold tracking-wide flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-indigo-150"
                  disabled={saving}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? "Saving..." : "Save"}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleCopyLink}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-100 active:scale-95"
                  id="btn-copy-share-url"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Copied Share Link!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Direct Share Link</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownload}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold tracking-wide flex items-center justify-center space-x-1.5 transition-all text-center"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Download Original</span>
                </button>

                {isOwner && (
                  <button
                    onClick={handleDeletePhoto}
                    disabled={saving}
                    className="w-full py-2 bg-white hover:bg-rose-50/50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 rounded-xl text-xs font-bold tracking-wide flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Photo</span>
                  </button>
                )}
              </div>
            )}

            {/* Quick specifications panel */}
            <p className="text-[9px] font-mono text-slate-400 text-center leading-normal pt-1.5 bg-slate-50 rounded-lg border border-slate-200 py-1.5 px-2">
              ID PIN: {photo.id.substring(0, 8)} | ACCESS: {photo.privacy.toUpperCase()}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
