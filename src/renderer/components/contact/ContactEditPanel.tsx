import React, { useState, useEffect, useRef } from "react";
import type { Contact } from "../../../shared/types";
import { BURN_DURATIONS } from "../../../shared/constants";
import { useContactStore } from "../../stores/contact-store";

interface ContactEditPanelProps {
  contact: Contact;
  onClose: () => void;
  onStartChat: (address: string) => void;
  onDelete: (address: string) => void;
}

export function ContactEditPanel({ contact, onClose, onStartChat, onDelete }: ContactEditPanelProps) {
  const [name, setName] = useState(contact.name);
  const updateContact = useContactStore((s) => s.updateContact);
  const pickAndSetContactAvatar = useContactStore((s) => s.pickAndSetContactAvatar);
  const setBurnOptions = useContactStore((s) => s.setBurnOptions);
  const inputRef = useRef<HTMLInputElement>(null);

  const burnEnabled = (contact.burnAfterSeconds ?? 0) > 0;
  const burnSeconds = contact.burnAfterSeconds ?? 60;

  useEffect(() => {
    setName(contact.name);
  }, [contact.address, contact.name]);

  async function handleNameSave() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== contact.name) {
      await updateContact(contact.address, trimmed);
    } else {
      setName(contact.name);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setName(contact.name);
      inputRef.current?.blur();
    }
  }

  const avatarUrl = contact.avatarUri
    ? `dchat-media://contact-cache/${contact.avatarUri}`
    : null;

  return (
    <div className="w-80 border-l border-surface-border flex flex-col bg-surface-deep">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <h3 className="text-sm font-semibold text-text-secondary">Contact Details</h3>
        <button
          onClick={onClose}
          className="text-text-faint hover:text-text-secondary transition-colors text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Avatar */}
        <div className="flex justify-center">
          <button
            onClick={() => pickAndSetContactAvatar(contact.address)}
            className="group relative w-20 h-20 rounded-lg overflow-hidden bg-surface-hover flex items-center justify-center hover:ring-2 hover:ring-accent-500 transition-all"
            title="Click to change avatar"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={contact.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl text-text-secondary">
                {contact.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs text-text-muted mb-1">Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-500/50"
          />
        </div>

        {/* NKN Address */}
        <div>
          <label className="block text-xs text-text-muted mb-1">NKN Address</label>
          <div className="px-3 py-2 bg-surface-raised/50 border border-surface-border/50 rounded-lg text-text-secondary text-xs font-mono break-all select-all">
            {contact.address}
          </div>
        </div>

        {/* Burn After Read */}
        <div>
          <label className="block text-xs text-text-muted mb-2">Burn After Read</label>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">Self-destruct messages</span>
            <button
              onClick={() => setBurnOptions(contact.address, burnEnabled ? 0 : 60)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                burnEnabled ? "bg-orange-500" : "bg-surface-hover"
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  burnEnabled ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {burnEnabled && (
            <select
              value={burnSeconds}
              onChange={(e) => setBurnOptions(contact.address, Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-orange-500/50"
            >
              {BURN_DURATIONS.map((d) => (
                <option key={d.seconds} value={d.seconds}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => onStartChat(contact.address)}
            className="w-full px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Start Chat
          </button>
          <button
            onClick={() => onDelete(contact.address)}
            className="w-full px-4 py-2 bg-transparent hover:bg-red-900/30 text-red-400 border border-red-800/50 rounded-lg text-sm font-medium transition-colors"
          >
            Delete Contact
          </button>
        </div>
      </div>
    </div>
  );
}
